// Shared client for the platform-db (entitlements + cross-product identity).
//
// Used by ACQ edge functions to answer "can this user do this thing?" before
// burning OpenAI/Deepgram/Anthropic tokens or syncing.
//
// Connection: PLATFORM_DB_URL env var (set in docker-compose). Read-only role
// — schema is platform.*, owner is platform_app.
//
// Idiom: pass the JWT sub claim (auth.users.id from THIS app's GoTrue) and the
// helper translates to a platform.users.id via the back-pointer.

import postgres from "npm:postgres@3.4.5";

const url = Deno.env.get("PLATFORM_DB_URL");

// Single connection pool per worker. supabase/edge-runtime spawns a worker
// per request, but worker isolates are cached. This keeps connections small.
const sql = url
  ? postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 5,
      prepare: false, // edge-runtime workers are short-lived; prepared statements add overhead
    })
  : null;

if (!sql) {
  console.warn(
    "[platform] PLATFORM_DB_URL not set — userHasAccess() will fall back to allow-all. " +
      "Fix this before launching.",
  );
}

export type Product = "acq_coach" | "lead_intel";

// ─────────────────────────────────────────────────────────────────
// Customer-level access check (per-org, not per-user).
// `acqAccountId` is the ghl_accounts.id from ACQ's DB. Returns true if the
// customer org has the product enabled.
// ─────────────────────────────────────────────────────────────────
export async function acqAccountHasAccess(
  acqAccountId: string,
  product: Product,
): Promise<boolean> {
  if (!sql) return true;
  try {
    const rows = await sql<{ has_access: boolean }[]>`
      SELECT platform.acq_account_has_access(${acqAccountId}::uuid, ${product}::platform.product) AS has_access
    `;
    return rows[0]?.has_access === true;
  } catch (e) {
    console.error("[platform] acqAccountHasAccess failed (fail-open):", (e as Error).message);
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────
// Core entitlement check.
// `acqUserId` is the auth.users.id from ACQ's GoTrue (the JWT sub).
// Returns true if the user is allowed to use the given product right now
// (enabled = true AND (valid_until IS NULL OR valid_until > now())).
//
// FAIL-OPEN policy: if platform-db is unreachable OR PLATFORM_DB_URL is
// unset, return true. This is intentional for v1 — we'd rather not block
// real users during a platform-db outage. Production: switch to fail-closed
// after one week of stable operation.
// ─────────────────────────────────────────────────────────────────
export async function userHasAccess(
  acqUserId: string,
  product: Product,
): Promise<boolean> {
  if (!sql) return true; // fail-open if no DB configured
  try {
    const rows = await sql<{ has_access: boolean }[]>`
      SELECT platform.acq_user_has_access(${acqUserId}::uuid, ${product}::platform.product) AS has_access
    `;
    return rows[0]?.has_access === true;
  } catch (e) {
    console.error("[platform] userHasAccess failed (fail-open):", (e as Error).message);
    return true;
  }
}

// Translate ACQ's auth.users.id → platform.users.id. Used when writing audit
// rows — those want the canonical platform_user_id, not the per-app one.
export async function getPlatformUserId(
  acqUserId: string,
): Promise<string | null> {
  if (!sql) return null;
  try {
    const rows = await sql<{ id: string | null }[]>`
      SELECT platform.user_id_for_acq(${acqUserId}::uuid) AS id
    `;
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error("[platform] getPlatformUserId failed:", (e as Error).message);
    return null;
  }
}

// Append a row to platform.audit_log. Best-effort: if it fails, log and
// swallow — never break a customer request because audit failed.
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

// Convenience: parse the JWT sub claim from an incoming request.
// Returns null for missing/invalid headers — caller decides whether to 401.
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

// Convenience: enforce that the caller's JWT user has access to the product.
// Returns null on allow, or a Response to send back on deny.
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
