import { createAdminClient, requireUser, TenantContextError } from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const WEIGHT3_KEYS = [
  "seller_temperature","last_offer_date","last_offer_feedback","last_offer_type",
  "last_offer_made","timeline","asking_price","condition","motivation",
  "seller_note","lead_identity","lead_source","personality_type",
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId } = await requireUser(req);
    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
    if (profile?.role !== "super_admin") {
      return json({ ok: false, error: "super_admin required" });
    }

    const body = await req.json().catch(() => ({} as any));
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
    if (!tenantId) return json({ ok: false, error: "tenant_id required" });

    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("name, ghl_location_id, ghl_pit_token")
      .eq("id", tenantId)
      .maybeSingle();
    if (tErr || !tenant) return json({ ok: false, error: "tenant not found" });
    if (!tenant.ghl_location_id || !tenant.ghl_pit_token) {
      return json({ ok: false, error: "tenant missing GHL credentials" });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    let allFields: Array<{ id: string; name: string }> = [];
    try {
      const res = await fetch(
        `${GHL_BASE}/locations/${encodeURIComponent(tenant.ghl_location_id)}/customFields`,
        {
          headers: {
            Authorization: `Bearer ${tenant.ghl_pit_token}`,
            Version: GHL_VERSION,
            Accept: "application/json",
          },
          signal: ctrl.signal,
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return json({ ok: false, error: `GHL ${res.status}: ${txt.slice(0, 200)}` });
      }
      const data = await res.json().catch(() => ({} as any));
      allFields = (Array.isArray(data?.customFields) ? data.customFields : [])
        .map((f: any) => ({ id: String(f?.id ?? ""), name: String(f?.name ?? "") }))
        .filter((f: any) => f.id && f.name)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    } catch (e) {
      const msg = (e as any)?.name === "AbortError" ? "GHL did not respond" : (e instanceof Error ? e.message : String(e));
      return json({ ok: false, error: msg });
    } finally {
      clearTimeout(timer);
    }

    const { data: existing } = await admin
      .from("tenant_custom_field_mappings")
      .select("field_key, ghl_field_id, ghl_field_name")
      .eq("tenant_id", tenantId);
    const mapped = existing ?? [];
    const mappedKeys = new Set(mapped.map((m: any) => m.field_key));
    const unmapped_keys = WEIGHT3_KEYS.filter((k) => !mappedKeys.has(k));

    return json({
      ok: true,
      tenant_name: tenant.name,
      all_fields: allFields,
      mapped,
      unmapped_keys,
      weight3_keys: WEIGHT3_KEYS,
    });
  } catch (e) {
    if (e instanceof TenantContextError) return json({ ok: false, error: e.message });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});