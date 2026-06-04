// Shared client for the platform-db (entitlements + cross-product identity).
//
// Used by Lead Intel edge functions to answer "can this user do this thing?"
// before burning Anthropic/Deepgram tokens or syncing tenants.
//
// Connection: PLATFORM_DB_URL env var. Read-only role on platform_app.
//
// Idiom: pass the JWT sub claim (auth.users.id from Lead Intel's GoTrue) and
// the helper translates to a platform.users.id via the back-pointer.

import postgres from "npm:postgres@3.4.5";

const url = Deno.env.get("PLATFORM_DB_URL");

const sql = url
  ? postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 5,
      prepare: false,
    })
  : null;

if (!sql) {
  console.warn(
    "[platform] PLATFORM_DB_URL not set — userHasAccess() will fall back to allow-all. " +
      "Fix this before launching.",
  );
}

export type Product = "acq_coach" | "lead_intel";

// Customer-level (tenant-level) access check.
export async function leadintelTenantHasAccess(
  leadintelTenantId: string,
  product: Product,
): Promise<boolean> {
  if (!sql) return true;
  try {
    const rows = await sql<{ has_access: boolean }[]>`
      SELECT platform.leadintel_tenant_has_access(${leadintelTenantId}::uuid, ${product}::platform.product) AS has_access
    `;
    return rows[0]?.has_access === true;
  } catch (e) {
    console.error("[platform] leadintelTenantHasAccess failed (fail-open):", (e as Error).message);
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────
// Core entitlement check.
// `leadintelUserId` is the auth.users.id from Lead Intel's GoTrue (JWT sub).
// Returns true if the user is allowed to use the given product right now.
//
// FAIL-OPEN policy: if platform-db is unreachable OR PLATFORM_DB_URL is
// unset, return true. Switch to fail-closed in week 2.
// ─────────────────────────────────────────────────────────────────
export async function userHasAccess(
  leadintelUserId: string,
  product: Product,
): Promise<boolean> {
  if (!sql) return true;
  try {
    const rows = await sql<{ has_access: boolean }[]>`
      SELECT platform.leadintel_user_has_access(${leadintelUserId}::uuid, ${product}::platform.product) AS has_access
    `;
    return rows[0]?.has_access === true;
  } catch (e) {
    console.error("[platform] userHasAccess failed (fail-open):", (e as Error).message);
    return true;
  }
}

export async function getPlatformUserId(
  leadintelUserId: string,
): Promise<string | null> {
  if (!sql) return null;
  try {
    const rows = await sql<{ id: string | null }[]>`
      SELECT platform.user_id_for_leadintel(${leadintelUserId}::uuid) AS id
    `;
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error("[platform] getPlatformUserId failed:", (e as Error).message);
    return null;
  }
}

export async function logAudit(opts: {
  actorPlatformUserId?: string | null;
  targetPlatformUserId?: string | null;
  product?: Product | null;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!sql) return;
  try {
    await sql`
      INSERT INTO platform.audit_log (actor_user_id, target_user_id, product, action, metadata)
      VALUES (
        ${opts.actorPlatformUserId ?? null}::uuid,
        ${opts.targetPlatformUserId ?? null}::uuid,
        ${opts.product ?? null}::platform.product,
        ${opts.action},
        ${JSON.stringify(opts.metadata ?? {})}::jsonb
      )
    `;
  } catch (e) {
    console.error("[platform] logAudit failed (swallowed):", (e as Error).message);
  }
}

export function extractUserIdFromJwt(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const token = auth.slice(7);
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function requireAccessOrDeny(
  req: Request,
  product: Product,
  extraHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const baseHeaders = { "Content-Type": "application/json", ...extraHeaders };
  const userId = extractUserIdFromJwt(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "missing or malformed Authorization header" }),
      { status: 401, headers: baseHeaders },
    );
  }
  const allowed = await userHasAccess(userId, product);
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: "access_denied",
        message: `Your account does not have access to ${product}. Contact your admin.`,
      }),
      { status: 403, headers: baseHeaders },
    );
  }
  return null;
}
