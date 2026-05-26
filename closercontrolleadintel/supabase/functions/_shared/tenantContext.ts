// Shared tenant resolution + auth helper for all SaaS edge functions.
// Verifies the caller's JWT and returns { tenantId, role, userId }.
//
// Behavior:
//   - super_admin: tenant_id from request body is honored as-is
//   - tenant_user: tenant_id from request body is IGNORED; resolved server-side
//                  from tenant_users WHERE user_id = caller
//   - no role / no tenant assignment / invalid JWT: throws TenantContextError(403)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type TenantRole = "super_admin" | "tenant_user";

export interface TenantContext {
  tenantId: string | null; // null only allowed for super_admin who didn't pass one
  role: TenantRole;
  userId: string;
}

export class TenantContextError extends Error {
  status: number;
  constructor(message: string, status: number = 403) {
    super(message);
    this.status = status;
  }
}

export interface ResolveOpts {
  /** If true, super_admin must also provide a tenant_id (e.g. for sync). Default false. */
  requireTenantForAdmin?: boolean;
  /** tenant_id from request body (super_admin override) */
  bodyTenantId?: string | null;
}

/**
 * Service-role admin client. RLS is bypassed — only use for trusted lookups.
 */
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function resolveTenantContext(
  req: Request,
  opts: ResolveOpts = {},
): Promise<TenantContext> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new TenantContextError("Missing Authorization header", 401);

  const admin = createAdminClient();
  const { data: userResp, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userResp?.user) {
    throw new TenantContextError("Invalid or expired session", 401);
  }
  const userId = userResp.user.id;

  // Look up role
  const { data: profile, error: profileErr } = await admin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) throw new TenantContextError("Failed to load user profile", 500);
  if (!profile) throw new TenantContextError("User profile not found", 403);

  const role = profile.role as TenantRole;
  if (role !== "super_admin" && role !== "tenant_user") {
    throw new TenantContextError("Unknown role", 403);
  }

  if (role === "super_admin") {
    const tenantId = (opts.bodyTenantId ?? null) || null;
    if (opts.requireTenantForAdmin && !tenantId) {
      throw new TenantContextError("tenant_id is required", 400);
    }
    return { tenantId, role, userId };
  }

  // tenant_user — ignore any body tenant_id, resolve from membership.
  const { data: membership, error: memErr } = await admin
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (memErr) throw new TenantContextError("Failed to resolve tenant", 500);
  if (!membership?.tenant_id) {
    throw new TenantContextError("User is not assigned to a tenant", 403);
  }

  return { tenantId: membership.tenant_id, role, userId };
}

/**
 * Lighter helper for functions that need authentication but no tenant scoping
 * (e.g. tts-briefing, ai-analyze — pure pass-through to external APIs).
 */
export async function requireUser(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new TenantContextError("Missing Authorization header", 401);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new TenantContextError("Invalid or expired session", 401);
  return { userId: data.user.id };
}

/**
 * Look up a tenant's GHL credentials. Returns null if tenant inactive or missing.
 */
export async function getTenantGhlCreds(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ pit: string; locationId: string } | null> {
  const { data, error } = await admin
    .from("tenants")
    .select("ghl_pit_token, ghl_location_id, status")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.status !== "active") return null;
  if (!data.ghl_pit_token || !data.ghl_location_id) return null;
  return { pit: data.ghl_pit_token, locationId: data.ghl_location_id };
}