import { createAdminClient, requireUser, TenantContextError } from "../_shared/tenantContext.ts";

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

// Allowed actions clients can ask us to log. Anything else is rejected.
// (sync.triggered / tenant.* are written by their respective edge functions,
// not from the client.)
const CLIENT_ALLOWED_ACTIONS = new Set([
  "login.super_admin",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId } = await requireUser(req);
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.role !== "super_admin") {
      return json({ error: "super_admin required" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const action = typeof body?.action === "string" ? body.action : "";
    if (!CLIENT_ALLOWED_ACTIONS.has(action)) {
      return json({ error: "action not allowed from client" }, 400);
    }

    const metadata = (body?.metadata && typeof body.metadata === "object") ? body.metadata : {};

    // Dedupe: skip login.super_admin if same user logged one within last 60s.
    if (action === "login.super_admin") {
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data: recent } = await admin
        .from("audit_log")
        .select("id")
        .eq("action", "login.super_admin")
        .eq("actor_user_id", userId)
        .gte("occurred_at", cutoff)
        .limit(1)
        .maybeSingle();
      if (recent) {
        return json({ ok: true, deduped: true });
      }
    }

    const { error } = await admin.from("audit_log").insert({
      actor_user_id: userId,
      actor_email: profile?.email ?? null,
      action,
      target_type: "system",
      target_id: null,
      metadata,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    if (e instanceof TenantContextError) {
      return json({ error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});