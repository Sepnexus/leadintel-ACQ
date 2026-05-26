import { createAdminClient, requireUser, TenantContextError } from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const CANONICAL_NAMES: Record<string, string[]> = {
  seller_temperature: ["Seller Temperature"],
  last_offer_date: ["Last Offer Date"],
  last_offer_feedback: ["Last Offer Feedback"],
  last_offer_type: ["Last Offer Type"],
  last_offer_made: ["Last Offer Made"],
  timeline: ["Timeline"],
  asking_price: ["Asking Price"],
  condition: ["Condition"],
  motivation: ["Motivation"],
  seller_note: ["Seller Notes", "Seller Note"],
  lead_identity: ["Lead Identity"],
  lead_source: ["Lead Source"],
  personality_type: ["Personality Type (2 required)", "Personality Type"],
};
const WEIGHT3_KEYS = Object.keys(CANONICAL_NAMES);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const norm = (s: string) => s.trim().toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId } = await requireUser(req);
    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("role,email").eq("id", userId).maybeSingle();
    if (profile?.role !== "super_admin") {
      return json({ ok: false, error: "super_admin required" });
    }

    const { data: tenants, error: tErr } = await admin
      .from("tenants")
      .select("id, name, ghl_location_id, ghl_pit_token, status")
      .eq("status", "active");
    if (tErr) return json({ ok: false, error: tErr.message });

    const eligible = (tenants ?? []).filter((t) => t.ghl_location_id && t.ghl_pit_token);
    const results: Array<{
      tenant_id: string;
      name: string;
      mapped: string[];
      unmapped: string[];
      error?: string;
    }> = [];

    for (const t of eligible) {
      const r = { tenant_id: t.id as string, name: t.name as string, mapped: [] as string[], unmapped: [] as string[] };
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        let allFields: Array<{ id: string; name: string }> = [];
        try {
          const res = await fetch(
            `${GHL_BASE}/locations/${encodeURIComponent(t.ghl_location_id!)}/customFields`,
            {
              headers: {
                Authorization: `Bearer ${t.ghl_pit_token}`,
                Version: GHL_VERSION,
                Accept: "application/json",
              },
              signal: ctrl.signal,
            },
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            results.push({ ...r, error: `GHL ${res.status}: ${txt.slice(0, 160)}` });
            await sleep(200);
            continue;
          }
          const data = await res.json().catch(() => ({} as any));
          allFields = (Array.isArray(data?.customFields) ? data.customFields : [])
            .map((f: any) => ({ id: String(f?.id ?? ""), name: String(f?.name ?? "") }))
            .filter((f: any) => f.id && f.name);
        } finally {
          clearTimeout(timer);
        }

        const byName = new Map<string, { id: string; name: string }>();
        for (const f of allFields) byName.set(norm(f.name), f);

        const upserts: Array<{ tenant_id: string; field_key: string; ghl_field_id: string; ghl_field_name: string }> = [];
        for (const key of WEIGHT3_KEYS) {
          const candidates = CANONICAL_NAMES[key];
          let match: { id: string; name: string } | undefined;
          for (const c of candidates) {
            const m = byName.get(norm(c));
            if (m) { match = m; break; }
          }
          if (match) {
            upserts.push({ tenant_id: t.id, field_key: key, ghl_field_id: match.id, ghl_field_name: match.name });
            r.mapped.push(key);
          } else {
            r.unmapped.push(key);
          }
        }

        if (upserts.length) {
          const { error: upErr } = await admin
            .from("tenant_custom_field_mappings")
            .upsert(upserts, { onConflict: "tenant_id,field_key" });
          if (upErr) {
            results.push({ ...r, error: `upsert: ${upErr.message}` });
            await sleep(200);
            continue;
          }
        }
        results.push(r);
      } catch (e) {
        const msg = (e as any)?.name === "AbortError" ? "GHL did not respond" : (e instanceof Error ? e.message : String(e));
        results.push({ ...r, error: msg });
      }
      await sleep(200);
    }

    // Trigger delta sync (fire-and-forget) for tenants with at least one mapping
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    for (const r of results) {
      if (r.error || r.mapped.length === 0) continue;
      fetch(`${supabaseUrl}/functions/v1/ghl-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ tenant_id: r.tenant_id, resource: "contacts", mode: "delta" }),
      }).catch(() => { /* ignore */ });
    }

    const totalMapped = results.reduce((s, r) => s + r.mapped.length, 0);
    const okCount = results.filter((r) => !r.error).length;
    const avg_mapped = okCount ? Math.round((totalMapped / okCount) * 10) / 10 : 0;

    try {
      await admin.from("audit_log").insert({
        actor_user_id: userId,
        actor_email: profile?.email ?? null,
        action: "tenant.field_mappings_bulk_auto",
        target_type: "platform",
        target_id: null,
        metadata: { tenants: results.length, avg_mapped, results },
      });
    } catch (e) {
      console.warn("audit_log insert failed:", e);
    }

    return json({ ok: true, tenants: results.length, avg_mapped, results });
  } catch (e) {
    if (e instanceof TenantContextError) return json({ ok: false, error: e.message });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});