import { createAdminClient, requireUser, TenantContextError } from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WEIGHT3_KEYS = new Set([
  "seller_temperature","last_offer_date","last_offer_feedback","last_offer_type",
  "last_offer_made","timeline","asking_price","condition","motivation",
  "seller_note","lead_identity","lead_source","personality_type",
]);

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
    const mappings = Array.isArray(body?.mappings) ? body.mappings : null;
    if (!tenantId) return json({ ok: false, error: "tenant_id required" });
    if (!mappings) return json({ ok: false, error: "mappings array required" });

    const { data: tenant } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
    if (!tenant) return json({ ok: false, error: "tenant not found" });

    const rows: Array<{ tenant_id: string; field_key: string; ghl_field_id: string; ghl_field_name: string | null }> = [];
    const toDelete: string[] = [];
    for (const m of mappings) {
      const field_key = typeof m?.field_key === "string" ? m.field_key.trim() : "";
      const ghl_field_id = typeof m?.ghl_field_id === "string" ? m.ghl_field_id.trim() : "";
      const ghl_field_name = typeof m?.ghl_field_name === "string" ? m.ghl_field_name : null;
      if (!field_key || !WEIGHT3_KEYS.has(field_key)) continue;
      if (!ghl_field_id) {
        toDelete.push(field_key);
        continue;
      }
      rows.push({ tenant_id: tenantId, field_key, ghl_field_id, ghl_field_name });
    }

    if (toDelete.length) {
      await admin
        .from("tenant_custom_field_mappings")
        .delete()
        .eq("tenant_id", tenantId)
        .in("field_key", toDelete);
    }

    if (rows.length) {
      const { error } = await admin
        .from("tenant_custom_field_mappings")
        .upsert(rows, { onConflict: "tenant_id,field_key" });
      if (error) return json({ ok: false, error: error.message });
    }

    try {
      const { data: actorProfile } = await admin.from("users").select("email").eq("id", userId).maybeSingle();
      await admin.from("audit_log").insert({
        actor_user_id: userId,
        actor_email: actorProfile?.email ?? null,
        action: "tenant.field_mappings_saved",
        target_type: "tenant",
        target_id: tenantId,
        metadata: { saved: rows.length, removed: toDelete.length },
      });
    } catch (e) {
      console.warn("audit_log insert failed:", e);
    }

    return json({ ok: true, saved: rows.length, removed: toDelete.length });
  } catch (e) {
    if (e instanceof TenantContextError) return json({ ok: false, error: e.message });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});