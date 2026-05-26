import { createAdminClient, requireUser, TenantContextError } from "../_shared/tenantContext.ts";
import { validateGhlCredentials } from "../_shared/ghlValidate.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId } = await requireUser(req);
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.role !== "super_admin") {
      return json({ ok: false, error: "super_admin required" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const locationId = typeof body?.ghl_location_id === "string" ? body.ghl_location_id.trim() : "";
    const token = typeof body?.ghl_pit_token === "string" ? body.ghl_pit_token.trim() : "";
    if (!locationId || /\s/.test(locationId)) {
      return json({ ok: false, error: "ghl_location_id is required" }, 400);
    }
    if (!token) {
      return json({ ok: false, error: "ghl_pit_token is required" }, 400);
    }

    const result = await validateGhlCredentials(locationId, token);
    return json(result, result.ok ? 200 : 200); // always 200; client reads ok
  } catch (e) {
    if (e instanceof TenantContextError) {
      return json({ ok: false, error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});