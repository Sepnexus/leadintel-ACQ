// Public endpoint — no auth header required.
// Validates the token, creates (or finds) the auth user, sets their password,
// records membership in tenant_users, marks invitation accepted.
import { createAdminClient } from "../_shared/tenantContext.ts";

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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!token) return json({ ok: false, error: "Token is required" }, 400);
    if (password.length < 8) return json({ ok: false, error: "Password must be at least 8 characters" }, 400);

    const tokenHash = await sha256Hex(token);
    const admin = createAdminClient();

    const { data: inv } = await admin
      .from("user_invitations")
      .select("id, email, tenant_id, expires_at, accepted_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!inv) return json({ ok: false, error: "Invitation not found" }, 200);
    if (inv.revoked_at) return json({ ok: false, error: "Invitation has been revoked" }, 200);
    if (inv.accepted_at) return json({ ok: false, error: "Invitation has already been accepted" }, 200);
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: "Invitation has expired" }, 200);
    }

    // Try to create the auth user. If they already exist, look them up and update password.
    let userIdToUse: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (createErr) {
      // Email exists — find the user and update password.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === inv.email);
      if (!existing) {
        return json({ ok: false, error: createErr.message ?? "Failed to create user" }, 500);
      }
      userIdToUse = existing.id;
      await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
    } else {
      userIdToUse = created.user?.id ?? null;
    }

    if (!userIdToUse) return json({ ok: false, error: "Failed to resolve user" }, 500);

    // Ensure profile row exists with role=tenant_user (handle_new_user trigger
    // already does this for new auth users; this is an upsert safety net).
    await admin.from("users").upsert({
      id: userIdToUse,
      email: inv.email,
      full_name: fullName || null,
      role: "tenant_user",
    }, { onConflict: "id" });

    // Insert tenant_users membership (ignore if it already exists).
    const { error: tuErr } = await admin
      .from("tenant_users")
      .insert({ user_id: userIdToUse, tenant_id: inv.tenant_id });
    if (tuErr && !String(tuErr.message ?? "").toLowerCase().includes("duplicate")) {
      return json({ ok: false, error: tuErr.message ?? "Failed to assign tenant" }, 500);
    }

    // Mark accepted.
    await admin
      .from("user_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_user_id: userIdToUse })
      .eq("id", inv.id);

    // Audit log — non-blocking.
    try {
      await admin.from("audit_log").insert({
        actor_user_id: userIdToUse,
        actor_email: inv.email,
        action: "invitation.accepted",
        target_type: "invitation",
        target_id: inv.id,
        metadata: { tenant_id: inv.tenant_id },
      });
    } catch (e) {
      console.warn("accept-invitation audit_log insert failed:", e);
    }

    return json({ ok: true, email: inv.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});