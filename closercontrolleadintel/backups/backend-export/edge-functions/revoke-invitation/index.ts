import { createAdminClient, requireUser, TenantContextError } from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { data: actor } = await admin
      .from("users").select("role, email").eq("id", userId).maybeSingle();
    if (actor?.role !== "super_admin") {
      return json({ ok: false, error: "super_admin required" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const invitationId = typeof body?.invitation_id === "string" ? body.invitation_id.trim() : "";
    if (!invitationId) return json({ ok: false, error: "invitation_id is required" }, 400);

    const { data: inv } = await admin
      .from("user_invitations")
      .select("id, tenant_id, email, accepted_at, revoked_at")
      .eq("id", invitationId)
      .maybeSingle();
    if (!inv) return json({ ok: false, error: "Invitation not found" }, 404);
    if (inv.accepted_at) return json({ ok: false, error: "Invitation already accepted" }, 200);
    if (inv.revoked_at) return json({ ok: false, error: "Invitation already revoked" }, 200);

    const { error: upErr } = await admin
      .from("user_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    try {
      await admin.from("audit_log").insert({
        actor_user_id: userId,
        actor_email: actor?.email ?? null,
        action: "invitation.revoked",
        target_type: "invitation",
        target_id: invitationId,
        metadata: { tenant_id: inv.tenant_id, email: inv.email },
      });
    } catch (e) {
      console.warn("revoke-invitation audit_log insert failed:", e);
    }

    return json({ ok: true });
  } catch (e) {
    if (e instanceof TenantContextError) return json({ ok: false, error: e.message }, e.status);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});