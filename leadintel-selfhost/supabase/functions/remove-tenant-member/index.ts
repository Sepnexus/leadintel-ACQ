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

/**
 * Remove a member from a tenant.
 *
 * Body:
 *   { tenant_id: string, user_id: string, mode: "revoke_access" | "delete_account" }
 *
 * - revoke_access: deletes the tenant_users row only. The user's auth
 *   account stays intact; they'll see "no tenant assigned" until re-invited.
 * - delete_account: deletes the tenant_users row AND the auth user
 *   entirely. Irreversible.
 */
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
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id.trim() : "";
    const targetUserId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const mode = body?.mode === "delete_account" ? "delete_account" : "revoke_access";
    if (!tenantId) return json({ ok: false, error: "tenant_id is required" }, 400);
    if (!targetUserId) return json({ ok: false, error: "user_id is required" }, 400);
    if (targetUserId === userId) {
      return json({ ok: false, error: "You cannot remove yourself" }, 400);
    }

    // Look up target user (for audit + safety check)
    const { data: target } = await admin
      .from("users").select("id, email, role").eq("id", targetUserId).maybeSingle();
    if (!target) return json({ ok: false, error: "User not found" }, 404);
    if (target.role === "super_admin") {
      return json({ ok: false, error: "Cannot remove a super_admin" }, 400);
    }

    // Confirm membership exists for this tenant
    const { data: membership } = await admin
      .from("tenant_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!membership) {
      return json({ ok: false, error: "User is not a member of this tenant" }, 404);
    }

    // 1) Always remove the membership row
    const { error: delMembershipErr } = await admin
      .from("tenant_users")
      .delete()
      .eq("id", membership.id);
    if (delMembershipErr) {
      return json({ ok: false, error: `Failed to remove membership: ${delMembershipErr.message}` }, 500);
    }

    // 2) If full delete requested, also nuke the auth user.
    //    public.users will cascade via the auth.users trigger / FK.
    let authDeleted = false;
    if (mode === "delete_account") {
      const { error: authErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (authErr) {
        // Membership is already removed; surface the partial state clearly.
        return json({
          ok: false,
          error: `Membership removed, but failed to delete auth account: ${authErr.message}`,
          partial: true,
        }, 500);
      }
      authDeleted = true;
      // Best-effort cleanup of public.users in case no FK cascade exists.
      await admin.from("users").delete().eq("id", targetUserId);
    }

    // 3) Audit
    try {
      await admin.from("audit_log").insert({
        actor_user_id: userId,
        actor_email: actor?.email ?? null,
        action: mode === "delete_account" ? "user.deleted" : "tenant_member.removed",
        target_type: "user",
        target_id: targetUserId,
        metadata: {
          tenant_id: tenantId,
          target_email: target.email,
          mode,
          auth_deleted: authDeleted,
        },
      });
    } catch (e) {
      console.warn("remove-tenant-member audit_log insert failed:", e);
    }

    return json({ ok: true, mode, auth_deleted: authDeleted });
  } catch (e) {
    if (e instanceof TenantContextError) return json({ ok: false, error: e.message }, e.status);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});