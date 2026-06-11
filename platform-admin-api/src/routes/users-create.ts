// POST  /admin-api/users                     — create a new platform user (optionally a super-admin)
// PATCH /admin-api/users/:id/platform-admin   — grant/revoke the is_platform_admin flag
//
// Platform-Admin-only: the whole /admin-api surface is gated on is_platform_admin
// in main.ts, so only an existing super-admin can mint another one. This is what
// lets a super-admin create a new super-admin WITH a password from the
// Admin → Users page (no SQL, no CLI).
//
// User creation mirrors setUserPassword's plumbing: it writes the platform.users
// row, then uses the auth.admin_upsert_user_password() SECURITY DEFINER function
// to provision the auth.users row (with a bcrypt password) on platform-db AND
// both app DBs — one shared UUID across all three (post-C2 identity model), so
// the apps' per-app login + resolveCaller() all resolve the same person.

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";
import bcrypt from "npm:bcryptjs@2.4.3";

interface BridgeResult { ok: boolean; created?: boolean; error?: string; [k: string]: boolean | string | undefined }

async function upsertAuthUser(db: any, userId: string, email: string, hash: string): Promise<BridgeResult> {
  if (!db) return { ok: false, error: "bridge_unavailable" };
  try {
    const rows = await db<{ result: string }[]>`
      SELECT auth.admin_upsert_user_password(${userId}::uuid, ${email}, ${hash}, true) AS result
    `;
    const result = rows[0]?.result;
    if (result === "updated") return { ok: true, created: false };
    if (result === "created") return { ok: true, created: true };
    return { ok: false, error: result ?? "unknown_result" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function createUser(req: Request, admin: AuthedAdmin): Promise<Response> {
  const body = await req.json().catch(() => ({})) as {
    email?: string; password?: string; full_name?: string; is_platform_admin?: boolean;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").toString();
  const fullName = (body.full_name ?? "").trim() || null;
  const makeAdmin = !!body.is_platform_admin;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "bad_email", reason: "a valid email is required" }, 400);
  }
  if (!password || password.length < 8) {
    return json({ error: "weak_password", reason: "password must be at least 8 characters" }, 400);
  }
  if (password.length > 128) {
    return json({ error: "bad_password", reason: "password must be 128 characters or fewer" }, 400);
  }

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM platform.users WHERE lower(email) = ${email} LIMIT 1
  `;
  if (existing.length > 0) {
    return json({ error: "email_exists", reason: "a user with this email already exists", user_id: existing[0].id }, 409);
  }

  // One shared UUID across platform + both apps (post-C2), wired into the
  // back-pointers so resolveCaller() finds them by acq_user_id/leadintel_user_id.
  const idRow = await sql<{ id: string }[]>`SELECT gen_random_uuid() AS id`;
  const userId = idRow[0].id;

  await sql`
    INSERT INTO platform.users (id, email, full_name, acq_user_id, leadintel_user_id, is_platform_admin)
    VALUES (${userId}::uuid, ${email}, ${fullName}, ${userId}::uuid, ${userId}::uuid, ${makeAdmin})
  `;

  const hash = await bcrypt.hash(password, 10);
  const platformR = await upsertAuthUser(sql, userId, email, hash);
  if (!platformR.ok) {
    // Roll back so a retry is clean (no orphan platform.users row).
    await sql`DELETE FROM platform.users WHERE id = ${userId}::uuid`;
    return json({ error: "auth_create_failed", reason: platformR.error }, 500);
  }
  const [acqR, liR] = await Promise.all([
    upsertAuthUser(acqSql, userId, email, hash),
    upsertAuthUser(liSql, userId, email, hash),
  ]);

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, target_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, ${userId}::uuid, 'user_created_by_admin',
            ${sql.json({ email, is_platform_admin: makeAdmin, bridges: { platform: platformR, acq: acqR, leadintel: liR } })})
  `;

  return json({
    ok: true,
    user_id: userId,
    email,
    is_platform_admin: makeAdmin,
    bridges: { platform: platformR, acq: acqR, leadintel: liR },
    note: makeAdmin
      ? "Super-admin created. They can log in at the launcher with this password and have full platform access."
      : "User created. They can log in, but get product access only once added to a customer.",
  });
}

export async function setPlatformAdmin(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { is_platform_admin?: boolean };
  if (typeof body.is_platform_admin !== "boolean") {
    return json({ error: "bad_request", reason: "expected { is_platform_admin: boolean }" }, 400);
  }
  // Don't let an admin demote themselves into a lockout.
  if (id === admin.platformUserId && body.is_platform_admin === false) {
    return json({ error: "self_demote_blocked", reason: "you cannot remove your own platform-admin role" }, 400);
  }

  const rows = await sql<{ id: string; email: string }[]>`
    UPDATE platform.users SET is_platform_admin = ${body.is_platform_admin}, updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id, email
  `;
  if (rows.length === 0) return json({ error: "not_found" }, 404);

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, target_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, ${id}::uuid, 'platform_admin_toggled',
            ${sql.json({ email: rows[0].email, is_platform_admin: body.is_platform_admin })})
  `;
  return json({ ok: true, user_id: id, is_platform_admin: body.is_platform_admin });
}
