// Public endpoint — no auth required. Looks up an invitation by raw token
// and returns minimal display info (tenant name, email, expiry, status).
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
    if (!token) return json({ ok: false, error: "Token is required" }, 400);

    const tokenHash = await sha256Hex(token);
    const admin = createAdminClient();

    const { data: inv } = await admin
      .from("user_invitations")
      .select("id, email, expires_at, accepted_at, revoked_at, tenant_id, tenants(name)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!inv) return json({ ok: false, error: "Invitation not found" }, 200);

    let status: "active" | "expired" | "accepted" | "revoked" = "active";
    if (inv.revoked_at) status = "revoked";
    else if (inv.accepted_at) status = "accepted";
    else if (new Date(inv.expires_at).getTime() < Date.now()) status = "expired";

    return json({
      ok: true,
      status,
      email: inv.email,
      tenant_name: (inv.tenants as any)?.name ?? null,
      expires_at: inv.expires_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});