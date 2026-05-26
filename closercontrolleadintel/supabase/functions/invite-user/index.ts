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

function generateToken(): string {
  // 32 bytes -> 64 hex chars. Cryptographically random.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId } = await requireUser(req);
    const admin = createAdminClient();

    const { data: actor } = await admin
      .from("users")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();
    if (actor?.role !== "super_admin") {
      return json({ ok: false, error: "super_admin required" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id.trim() : "";
    const emailRaw = typeof body?.email === "string" ? body.email.trim() : "";
    const appOrigin = typeof body?.app_origin === "string" ? body.app_origin.trim() : "";

    if (!tenantId) return json({ ok: false, error: "tenant_id is required" }, 400);
    if (!EMAIL_RE.test(emailRaw)) return json({ ok: false, error: "Invalid email address" }, 400);
    const email = emailRaw.toLowerCase();

    // Tenant must exist & be active.
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name, status")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant) return json({ ok: false, error: "Tenant not found" }, 404);
    if (tenant.status !== "active") {
      return json({ ok: false, error: "Tenant is not active" }, 400);
    }

    // Block: email already belongs to a user that's already in a tenant_users row.
    const { data: existingUser } = await admin
      .from("users")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (existingUser) {
      const { data: membership } = await admin
        .from("tenant_users")
        .select("tenant_id")
        .eq("user_id", existingUser.id)
        .maybeSingle();
      if (membership) {
        return json({ ok: false, error: "This email already belongs to a user assigned to a tenant" }, 200);
      }
    }

    // Cleanup expired/revoked pending rows so the partial unique index doesn't block re-invite.
    await admin
      .from("user_invitations")
      .delete()
      .eq("tenant_id", tenantId)
      .ilike("email", email)
      .is("accepted_at", null)
      .or(`expires_at.lt.${new Date().toISOString()},revoked_at.not.is.null`);

    const token = generateToken();
    const tokenHash = await sha256Hex(token);

    const { data: inserted, error: insErr } = await admin
      .from("user_invitations")
      .insert({
        tenant_id: tenantId,
        email,
        token_hash: tokenHash,
        invited_by_user_id: userId,
      })
      .select("id, expires_at")
      .single();

    if (insErr) {
      const msg = insErr.message ?? "Failed to create invitation";
      if (msg.includes("idx_user_invitations_pending") || msg.toLowerCase().includes("duplicate")) {
        return json({ ok: false, error: "Pending invitation already exists for this email" }, 200);
      }
      return json({ ok: false, error: msg }, 500);
    }

    const origin = appOrigin || req.headers.get("origin") || "";
    const acceptUrl = `${origin.replace(/\/+$/, "")}/accept-invitation?token=${token}`;

    // Audit log — non-blocking.
    try {
      await admin.from("audit_log").insert({
        actor_user_id: userId,
        actor_email: actor?.email ?? null,
        action: "invitation.created",
        target_type: "invitation",
        target_id: inserted.id,
        metadata: { tenant_id: tenantId, tenant_name: tenant.name, email },
      });
    } catch (e) {
      console.warn("invite-user audit_log insert failed:", e);
    }

    return json({
      ok: true,
      invitation_id: inserted.id,
      accept_url: acceptUrl,
      expires_at: inserted.expires_at,
    });
  } catch (e) {
    if (e instanceof TenantContextError) return json({ ok: false, error: e.message }, e.status);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});