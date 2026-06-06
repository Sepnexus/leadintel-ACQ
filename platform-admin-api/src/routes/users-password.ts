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

interface BridgeResult { ok: boolean; error?: string }

async function bridgeUpdate(
  db: any,
  userId: string,
  hash: string,
): Promise<BridgeResult> {
  if (!db) return { ok: false, error: "bridge_unavailable" };
  try {
    const rows = await db`
      UPDATE auth.users
      SET encrypted_password = ${hash}, updated_at = now()
      WHERE id = ${userId}::uuid
      RETURNING id
    `;
    if (rows.length === 0) return { ok: false, error: "user_not_in_app_db" };
    return { ok: true };
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

  // Look up target user
  const targetRows = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM platform.users WHERE id = ${id}::uuid
  `;
  if (targetRows.length === 0) return json({ error: "not_found" }, 404);
  const target = targetRows[0];

  // Sanity: confirm target also exists in auth.users on platform-db
  // (every platform.users row should have a matching auth.users — they're
  // back-pointed during signup — but check defensively).
  const authExists = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = ${id}::uuid) AS exists
  `;
  if (!authExists[0]?.exists) {
    return json(
      { error: "auth_user_missing", reason: "user is in platform.users but not platform-auth auth.users" },
      409,
    );
  }

  // Hash with bcryptjs — cost 10 matches GoTrue's default.
  const hash = await bcrypt.hash(password, 10);

  // Source of truth: platform-db. If this fails, the whole thing fails.
  let platformUpdated = false;
  try {
    const r = await sql<{ id: string }[]>`
      UPDATE auth.users
      SET encrypted_password = ${hash}, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id
    `;
    platformUpdated = r.length > 0;
  } catch (e) {
    return json(
      { error: "platform_update_failed", reason: (e as Error).message },
      500,
    );
  }
  if (!platformUpdated) {
    return json({ error: "platform_update_no_rows" }, 500);
  }

  // Bridge to both app DBs in parallel. Non-fatal — but surfaced.
  const [acqR, liR] = await Promise.all([
    bridgeUpdate(acqSql, id, hash),
    bridgeUpdate(liSql, id, hash),
  ]);

  // Audit log — capture *which* bridges succeeded, never the password.
  await sql`
    INSERT INTO platform.audit_log (actor_user_id, target_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      ${id}::uuid,
      'user_password_set_by_admin',
      ${sql.json({
        target_email: target.email,
        bridges: { acq: acqR, leadintel: liR },
      })}
    )
  `;

  return json({
    ok: true,
    user_id: id,
    bridges: { acq: acqR, leadintel: liR },
    note: "User can log in with the new password immediately. Existing sessions remain valid until expiry.",
  });
}
