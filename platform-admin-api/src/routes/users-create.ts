// POST   /admin-api/users                     — create a new platform user (optionally a super-admin)
// PATCH  /admin-api/users/:id/platform-admin   — grant/revoke the is_platform_admin flag
// DELETE /admin-api/users/:id                  — remove a user from the platform + both apps
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
//
// Optionally pass customer_id (+ role) to ALSO assign the new user to a customer.
// That assignment is what actually grants product access: it writes
// platform.customer_users for every product the customer has enabled, then
// syncCustomerMemberships() mirrors it into ACQ (profiles + user_roles) and LI
// (users + tenant_users). Without it a user can log in but sees nothing — which
// is why a user created inside one app alone (e.g. Lead Intel) never shows up
// in ACQ.

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";
import { syncCustomerMemberships } from "../lib/provisioning.ts";
import bcrypt from "npm:bcryptjs@2.4.3";

interface BridgeResult { ok: boolean; created?: boolean; error?: string; [k: string]: boolean | string | undefined }

// Exported so the team-invite path (routes/me.ts) mints logins the same way —
// one shared UUID with auth rows in all three DBs. It used to insert a bare
// platform.users row, which left the invitee with memberships but no login
// anywhere and no acq_user_id for ensureProvisioned() to hang the mirror off.
export async function upsertAuthUser(db: any, userId: string, email: string, hash: string): Promise<BridgeResult> {
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
    customer_id?: string; role?: string;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").toString();
  const fullName = (body.full_name ?? "").trim() || null;
  const makeAdmin = !!body.is_platform_admin;
  // Optional: assign to a customer in the same step. This is what grants
  // product access (both apps), so a normal user is usable immediately.
  const customerId = (body.customer_id ?? "").trim() || null;
  const role = (body.role ?? "").trim() || "tenant_user";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "bad_email", reason: "a valid email is required" }, 400);
  }
  if (!password || password.length < 8) {
    return json({ error: "weak_password", reason: "password must be at least 8 characters" }, 400);
  }
  if (password.length > 128) {
    return json({ error: "bad_password", reason: "password must be 128 characters or fewer" }, 400);
  }

  // Validate the customer + its enabled products BEFORE creating anything, so a
  // bad customer_id can never leave an orphaned login behind.
  let customer: { id: string; name: string } | null = null;
  let enabledProducts: string[] = [];
  if (customerId) {
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM platform.customers WHERE id = ${customerId}::uuid LIMIT 1
    `;
    if (rows.length === 0) {
      return json({ error: "customer_not_found", reason: "unknown customer_id" }, 404);
    }
    customer = rows[0];
    const prods = await sql<{ product: string }[]>`
      SELECT product FROM platform.customer_product_access
      WHERE customer_id = ${customerId}::uuid AND enabled = true
    `;
    if (prods.length === 0) {
      return json({
        error: "no_products_enabled",
        reason: "that customer has no products enabled — turn on ACQ Coach and/or Lead Intel for the customer first, then add users",
      }, 400);
    }
    enabledProducts = prods.map((p) => p.product);
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
    // Roll back so a retry is clean (no orphan platform.users row). Via the
    // SECURITY DEFINER function — platform_admin has no DELETE of its own.
    await sql`SELECT platform.admin_delete_user(${userId}::uuid)`;
    return json({ error: "auth_create_failed", reason: platformR.error }, 500);
  }
  const [acqR, liR] = await Promise.all([
    upsertAuthUser(acqSql, userId, email, hash),
    upsertAuthUser(liSql, userId, email, hash),
  ]);

  // Assign to the customer — one membership row per enabled product, then mirror
  // it into ACQ (profiles + user_roles) and LI (users + tenant_users). This is
  // the step that makes BOTH apps visible to the user.
  let assignment: Record<string, unknown> | null = null;
  if (customerId && customer) {
    for (const product of enabledProducts) {
      await sql`
        INSERT INTO platform.customer_users (customer_id, user_id, product, role)
        VALUES (${customerId}::uuid, ${userId}::uuid, ${product}::platform.product, ${role})
        ON CONFLICT (customer_id, user_id, product) DO UPDATE SET role = EXCLUDED.role
      `;
    }
    const provisioning = await syncCustomerMemberships(customerId);
    assignment = {
      customer_id: customerId,
      customer_name: customer.name,
      role,
      products: enabledProducts,
      provisioning,
    };
  }

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, target_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, ${userId}::uuid, 'user_created_by_admin',
            ${sql.json({ email, is_platform_admin: makeAdmin, assignment, bridges: { platform: platformR, acq: acqR, leadintel: liR } })})
  `;

  return json({
    ok: true,
    user_id: userId,
    email,
    is_platform_admin: makeAdmin,
    assignment,
    bridges: { platform: platformR, acq: acqR, leadintel: liR },
    note: makeAdmin
      ? "Super-admin created. They can log in at the launcher with this password and have full platform access."
      : assignment
      ? `User created and added to ${customer!.name} (${enabledProducts.join(" + ")}). They can log in now and will see every product enabled for that customer.`
      : "User created. They can log in, but will see no products until you assign them to a customer.",
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

// DELETE /admin-api/users/:id
//
// Removes the person everywhere: app-side access rows first (they FK to the
// auth user), then each app's auth login, then the platform row. Each app is
// best-effort and reported back — a wedged bridge shouldn't strand the user
// half-deleted with no feedback.
//
// Guardrails: you can't delete yourself, and you can't delete the last platform
// admin (that would lock everyone out of this panel).
export async function deleteUser(_req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  if (id === admin.platformUserId) {
    return json({ error: "self_delete_blocked", reason: "you cannot delete your own account" }, 400);
  }

  const rows = await sql<{ id: string; email: string; is_platform_admin: boolean }[]>`
    SELECT id, email, is_platform_admin FROM platform.users WHERE id = ${id}::uuid
  `;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  const target = rows[0];

  if (target.is_platform_admin) {
    const c = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM platform.users WHERE is_platform_admin = true
    `;
    if ((c[0]?.n ?? 0) <= 1) {
      return json({
        error: "last_admin_blocked",
        reason: "this is the only platform admin — make someone else an admin first",
      }, 400);
    }
  }

  const cleanup: Record<string, string> = {};

  // ACQ: access rows -> profile -> auth login.
  if (acqSql) {
    try {
      await acqSql`DELETE FROM public.user_roles       WHERE user_id = ${id}::uuid`;
      await acqSql`DELETE FROM public.rep_assignments  WHERE user_id = ${id}::uuid`;
      await acqSql`DELETE FROM public.profiles         WHERE id      = ${id}::uuid`;
      await acqSql`DELETE FROM auth.users              WHERE id      = ${id}::uuid`;
      cleanup.acq = "ok";
    } catch (e) { cleanup.acq = `failed: ${(e as Error).message}`; }
  } else cleanup.acq = "bridge unavailable";

  // Lead Intel: membership -> app user -> auth login.
  if (liSql) {
    try {
      await liSql`DELETE FROM public.tenant_users WHERE user_id = ${id}::uuid`;
      await liSql`DELETE FROM public.users        WHERE id      = ${id}::uuid`;
      await liSql`DELETE FROM auth.users          WHERE id      = ${id}::uuid`;
      cleanup.leadintel = "ok";
    } catch (e) { cleanup.leadintel = `failed: ${(e as Error).message}`; }
  } else cleanup.leadintel = "bridge unavailable";

  // Platform last. Goes through the SECURITY DEFINER function because we connect
  // here as platform_admin, which has no DELETE on platform.users or auth.users
  // (16-admin-delete-user.sql).
  try {
    await sql`SELECT platform.admin_delete_user(${id}::uuid)`;
    cleanup.platform = "ok";
  } catch (e) {
    return json({ error: "delete_failed", reason: (e as Error).message, cleanup }, 500);
  }

  // Audit with the actor's id only — target_user_id would FK to the row we just
  // deleted, so the email/id live in metadata instead.
  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, 'user_deleted_by_admin',
            ${sql.json({ user_id: id, email: target.email, was_platform_admin: target.is_platform_admin, cleanup })})
  `;

  return json({
    ok: true,
    user_id: id,
    email: target.email,
    cleanup,
    note: `${target.email} removed from the platform, ACQ Coach and Lead Intel.`,
  });
}
