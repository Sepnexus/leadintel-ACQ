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
  accessible: boolean | null;   // true = scope ok · false = no scope · null = couldn't verify
  exist: boolean;
  sample_count: number;
  sample_note: string | null;
  error?: string;
  contacts_checked: number;
}

async function fetchNotesForContact(
  contactId: string,
  pit: string,
): Promise<{ status: number; notes: any[]; message: string }> {
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
      const body = await r.text().catch(() => "");
      let message = body.slice(0, 200);
      try { message = JSON.parse(body)?.message ?? message; } catch { /* keep raw */ }
      return { status: r.status, notes: [], message };
    }
    const data = await r.json().catch(() => ({}));
    const notes = Array.isArray(data?.notes) ? data.notes : [];
    return { status: r.status, notes, message: "" };
  } finally {
    clearTimeout(t);
  }
}

// A per-contact 403/404 with this message means the CONTACT is gone from GHL
// (deleted/merged, or belongs to an old location) — a stale row in our DB.
// It is NOT evidence that the token lacks the notes scope.
const STALE_CONTACT_RE = /does not have access to this location|not found|no longer/i;

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

  // Sample a wider window: tenants with un-reconciled stale rows can have many
  // recently-added contacts that GHL already deleted. 25 makes it very likely
  // we hit at least one contact GHL still has, which is all we need to prove
  // the notes scope.
  const { data: contacts, error: cErr } = await admin
    .from("ghl_contacts")
    .select("ghl_contact_id")
    .eq("tenant_id", tenant.id)
    .order("ghl_date_added", { ascending: false, nullsFirst: false })
    .limit(25);

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
  let okReads = 0;       // contacts whose notes we read successfully → scope proven
  let scopeFails = 0;    // genuine 401/403 (NOT the stale-contact kind) → real scope problem
  let staleSkips = 0;    // contact gone from GHL → ignored, not a scope signal
  let lastError: string | null = null;

  for (const id of ids) {
    base.contacts_checked++;
    try {
      const { status, notes, message } = await fetchNotesForContact(id, tenant.ghl_pit_token);
      if (status >= 200 && status < 300) {
        okReads++;
        totalNotes += notes.length;
        if (!sampleNote) {
          for (const n of notes) {
            const body = typeof n?.body === "string" ? n.body.trim() : "";
            if (body) { sampleNote = body.slice(0, 200); break; }
          }
        }
        break; // one clean read proves the scope — stop hammering stale rows
      }
      if ((status === 403 || status === 404) && STALE_CONTACT_RE.test(message)) {
        staleSkips++;                 // stale contact, not a scope problem
        lastError = `stale contact ${id}`;
        continue;
      }
      if (status === 401 || status === 403) {
        scopeFails++;                 // genuine token/scope failure
        lastError = `HTTP ${status}${message ? " — " + message : ""}`;
        continue;
      }
      lastError = `HTTP ${status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  // Three-way result:
  //  - any clean read           → scope is good (true)
  //  - a genuine 401/403        → no scope (false)
  //  - only stale/empty samples → can't tell (null = "unknown"), NOT "no scope"
  const accessible: boolean | null = okReads > 0 ? true : scopeFails > 0 ? false : null;
  const exist = accessible === true && totalNotes > 0;
  if (accessible === null && staleSkips > 0) {
    base.error = "Couldn't verify — all sampled contacts are stale (deleted in GHL). Run a full sync to reconcile, then re-check.";
  }

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
  // Only surface the raw lastError for a genuine no-scope; the unknown case
  // already set a clearer message above, and the good case needs none.
  if (accessible === false && lastError) base.error = lastError;
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