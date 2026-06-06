// POST /admin-api/users/:id/password
//
// Platform-Admin-only. Lets a super_admin set the password of any user
// (e.g. an account admin who's locked themselves out, or an initial
// password during onboarding).
//
// Why direct bcrypt + DB writes instead of GoTrue admin endpoints?
// - We're already doing fan-out writes for identity (Phase C2 merger)
//   so the same model applies here. Adding GoTrue service-role keys for
//   three backends just to set a password is more secrets to manage.
// - bcryptjs produces the standard $2a$ hash format that GoTrue stores
//   and accepts on login (verified via local round-trip).
//
// Behaviour:
// - Hashes the new password with bcryptjs (cost 10 — same default GoTrue uses).
// - Updates auth.users.encrypted_password on platform-db (source of truth).
// - Bridge-writes to ACQ + LI auth.users where the user UUID matches
//   (which it does for all users post-Phase C2). Failures on bridges are
//   non-fatal and surfaced in the response so the admin sees them.
// - Audit-logs the action (NEVER logs the password itself — only target
//   user id and which bridges succeeded).
// - Returns { ok, bridges: { acq: {ok|error}, leadintel: {ok|error} } }.
//
// Does NOT email the user. Does NOT invalidate existing sessions — Phase C2's
// shared JWT_SECRET means sessions remain valid until their natural expiry.
// Treat this as "set password," not "force re-login."

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";
import bcrypt from "npm:bcryptjs@2.4.3";

interface BridgeResult { ok: boolean; created?: boolean; error?: string }

// Upsert a user's password via the auth.admin_upsert_user_password()
// SECURITY DEFINER function (installed by migration 12-admin-set-password
// on platform-db and 20260606150000_admin_upsert_user_password on each
// app DB). We can't write to auth.users directly — GoTrue restricts those
// tables to read-only for every role except supabase_auth_admin. The
// function is owned by supabase_auth_admin so SECURITY DEFINER picks up
// the rights it needs; EXECUTE is granted only to the role each
// connection uses (platform_admin / postgres).
//
// Function returns:
//   'updated'   — existing auth.users row was patched
//   'created'   — fresh row was provisioned (invited-but-not-onboarded)
//   'not_found' — only happens if we ever pass create_if_missing=false
async function upsertAuthUser(
  db: any,
  userId: string,
  email: string,
  hash: string,
): Promise<BridgeResult> {
  if (!db) return { ok: false, error: "bridge_unavailable" };
  try {
    const rows = await db<{ result: string }[]>`
      SELECT auth.admin_upsert_user_password(
        ${userId}::uuid, ${email}, ${hash}, true
      ) AS result
    `;
    const result = rows[0]?.result;
    if (result === "updated") return { ok: true, created: false };
    if (result === "created") return { ok: true, created: true };
    return { ok: false, error: result ?? "unknown_result" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setUserPassword(
  req: Request,
  admin: AuthedAdmin,
  id: string,
): Promise<Response> {
  // Body validation
  const body = await req.json().catch(() => ({})) as { password?: string };
  const password = (body.password ?? "").toString();
  if (!password || password.length < 8) {
    return json(
      { error: "weak_password", reason: "password must be at least 8 characters" },
      400,
    );
  }
  if (password.length > 128) {
    return json(
      { error: "bad_password", reason: "password must be 128 characters or fewer" },
      400,
    );
  }

  // Look up target user (platform.users is the source of truth for who
  // exists in our system; auth.users may or may not be populated yet).
  const targetRows = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM platform.users WHERE id = ${id}::uuid
  `;
  if (targetRows.length === 0) return json({ error: "not_found" }, 404);
  const target = targetRows[0];

  // Hash with bcryptjs — cost 10 matches GoTrue's default.
  const hash = await bcrypt.hash(password, 10);

  // Source of truth: platform-db. Upsert (handles invited-but-never-logged-in
  // users whose platform.users row exists without a matching auth.users).
  const platformR = await upsertAuthUser(sql, id, target.email, hash);
  if (!platformR.ok) {
    return json(
      { error: "platform_update_failed", reason: platformR.error },
      500,
    );
  }

  // Bridge to both app DBs in parallel. Same upsert semantics so a user
  // can be bootstrapped into ACQ/LI auth even if they've never visited.
  const [acqR, liR] = await Promise.all([
    upsertAuthUser(acqSql, id, target.email, hash),
    upsertAuthUser(liSql, id, target.email, hash),
  ]);

  // Audit log — capture *which* bridges succeeded + whether each row was
  // newly created (vs updated), never the password itself.
  await sql`
    INSERT INTO platform.audit_log (actor_user_id, target_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      ${id}::uuid,
      'user_password_set_by_admin',
      ${sql.json({
        target_email: target.email,
        platform_auth: platformR,
        bridges: { acq: acqR, leadintel: liR },
      })}
    )
  `;

  return json({
    ok: true,
    user_id: id,
    platform_auth: platformR,
    bridges: { acq: acqR, leadintel: liR },
    note: platformR.created
      ? "User did not yet have a platform-auth row — provisioned and password set. They can log in now."
      : "User can log in with the new password immediately. Existing sessions remain valid until expiry.",
  });
}
