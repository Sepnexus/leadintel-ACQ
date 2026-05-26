import {
  createAdminClient,
  resolveTenantContext,
  TenantContextError,
} from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface TenantRow {
  id: string;
  name: string;
  status: string;
  ghl_pit_token: string | null;
  ghl_location_id: string | null;
}

interface CheckResult {
  tenant_id: string;
  tenant_name: string;
  accessible: boolean;
  exist: boolean;
  sample_count: number;
  sample_note: string | null;
  error?: string;
  contacts_checked: number;
}

async function fetchNotesForContact(
  contactId: string,
  pit: string,
): Promise<{ status: number; notes: any[] }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: GHL_VERSION,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) {
      await r.text().catch(() => "");
      return { status: r.status, notes: [] };
    }
    const data = await r.json().catch(() => ({}));
    const notes = Array.isArray(data?.notes) ? data.notes : [];
    return { status: r.status, notes };
  } finally {
    clearTimeout(t);
  }
}

async function checkOne(
  admin: ReturnType<typeof createAdminClient>,
  tenant: TenantRow,
): Promise<CheckResult> {
  const base: CheckResult = {
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    accessible: false,
    exist: false,
    sample_count: 0,
    sample_note: null,
    contacts_checked: 0,
  };

  if (!tenant.ghl_pit_token || !tenant.ghl_location_id) {
    base.error = "missing GHL credentials";
    await admin
      .from("tenants")
      .update({
        notes_scope_accessible: false,
        notes_exist: false,
        notes_last_checked_at: new Date().toISOString(),
      })
      .eq("id", tenant.id);
    return base;
  }

  const { data: contacts, error: cErr } = await admin
    .from("ghl_contacts")
    .select("ghl_contact_id")
    .eq("tenant_id", tenant.id)
    .order("ghl_date_added", { ascending: false, nullsFirst: false })
    .limit(5);

  if (cErr) {
    base.error = `db: ${cErr.message}`;
    return base;
  }

  const ids = (contacts ?? [])
    .map((c: any) => c.ghl_contact_id)
    .filter((x: any) => typeof x === "string" && x.length > 0);

  if (ids.length === 0) {
    base.error = "no contacts to sample";
    await admin
      .from("tenants")
      .update({
        notes_scope_accessible: null,
        notes_exist: null,
        notes_last_checked_at: new Date().toISOString(),
      })
      .eq("id", tenant.id);
    return base;
  }

  let totalNotes = 0;
  let sampleNote: string | null = null;
  let unauthorized = false;
  let lastError: string | null = null;

  for (const id of ids) {
    base.contacts_checked++;
    try {
      const { status, notes } = await fetchNotesForContact(id, tenant.ghl_pit_token);
      if (status === 401 || status === 403) {
        unauthorized = true;
        lastError = `HTTP ${status}`;
        break;
      }
      if (status >= 400) {
        lastError = `HTTP ${status}`;
        continue;
      }
      totalNotes += notes.length;
      if (!sampleNote) {
        for (const n of notes) {
          const body = typeof n?.body === "string" ? n.body.trim() : "";
          if (body) {
            sampleNote = body.slice(0, 200);
            break;
          }
        }
      }
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  const accessible = !unauthorized;
  const exist = accessible && totalNotes > 0;

  await admin
    .from("tenants")
    .update({
      notes_scope_accessible: accessible,
      notes_exist: exist,
      notes_last_checked_at: new Date().toISOString(),
    })
    .eq("id", tenant.id);

  base.accessible = accessible;
  base.exist = exist;
  base.sample_count = totalNotes;
  base.sample_note = sampleNote;
  if (!accessible && lastError) base.error = lastError;
  return base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await resolveTenantContext(req);
    if (ctx.role !== "super_admin") {
      return json({ ok: false, error: "super_admin required" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;
    const runAll = body?.run_all === true;

    if ((!tenantId && !runAll) || (tenantId && runAll)) {
      return json({ ok: false, error: "provide exactly one of tenant_id or run_all" }, 400);
    }

    const admin = createAdminClient();

    if (tenantId) {
      const { data: t, error } = await admin
        .from("tenants")
        .select("id, name, status, ghl_pit_token, ghl_location_id")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!t) return json({ ok: false, error: "tenant not found" }, 404);
      const result = await checkOne(admin, t as TenantRow);
      return json({ ok: true, result });
    }

    const { data: tenants, error } = await admin
      .from("tenants")
      .select("id, name, status, ghl_pit_token, ghl_location_id")
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 500);

    const results: CheckResult[] = [];
    for (const t of tenants ?? []) {
      results.push(await checkOne(admin, t as TenantRow));
      await new Promise((r) => setTimeout(r, 150));
    }
    return json({ ok: true, results });
  } catch (e) {
    if (e instanceof TenantContextError) {
      return json({ ok: false, error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});