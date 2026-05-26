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
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const locationId = typeof body?.ghl_location_id === "string" ? body.ghl_location_id.trim() : "";
    const token = typeof body?.ghl_pit_token === "string" ? body.ghl_pit_token.trim() : "";

    if (name.length < 1 || name.length > 100) {
      return json({ ok: false, error: "name must be 1-100 characters" }, 400);
    }
    if (!locationId || /\s/.test(locationId)) {
      return json({ ok: false, error: "ghl_location_id is required" }, 400);
    }
    if (!token.startsWith("pit-")) {
      return json({ ok: false, error: "ghl_pit_token must start with 'pit-'" }, 400);
    }

    // Re-validate credentials server-side.
    const validation = await validateGhlCredentials(locationId, token);
    if (!validation.ok) {
      return json({ ok: false, error: validation.error }, 200);
    }

    // Pre-check duplicate location id (so we can return a friendly message
    // before invoking the SECURITY DEFINER function).
    const { data: existing } = await admin
      .from("tenants")
      .select("id")
      .eq("ghl_location_id", locationId)
      .maybeSingle();
    if (existing) {
      return json({ ok: false, error: "A tenant with that Location ID already exists" }, 200);
    }

    // Atomic create: insert tenant + seed sync_state in one transaction.
    // Call via a user-scoped client so auth.uid() / is_super_admin() inside
    // the SECURITY DEFINER function resolve to the caller.
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = (await import("https://esm.sh/@supabase/supabase-js@2.45.0")).createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const { data: tenantId, error: rpcErr } = await userClient.rpc("create_tenant_with_sync_state", {
      p_name: name,
      p_location_id: locationId,
      p_token: token,
    });
    if (rpcErr) {
      const msg = rpcErr.message ?? "Failed to create tenant";
      if (msg.includes("duplicate_location_id")) {
        return json({ ok: false, error: "A tenant with that Location ID already exists" }, 200);
      }
      if (msg.includes("super_admin required") || msg.includes("authentication required")) {
        return json({ ok: false, error: msg }, 403);
      }
      return json({ ok: false, error: msg }, 500);
    }

    // Audit log entry — non-blocking on failure.
    try {
      const { data: actorProfile } = await admin
        .from("users")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      await admin.from("audit_log").insert({
        actor_user_id: userId,
        actor_email: actorProfile?.email ?? null,
        action: "tenant.created",
        target_type: "tenant",
        target_id: tenantId,
        metadata: { name, ghl_location_id: locationId, plan_type: "standard" },
      });
    } catch (auditErr) {
      console.warn("create-tenant audit_log insert failed:", auditErr);
    }

    return json({ ok: true, tenant_id: tenantId, name, location: validation.location });
  } catch (e) {
    if (e instanceof TenantContextError) {
      return json({ ok: false, error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});