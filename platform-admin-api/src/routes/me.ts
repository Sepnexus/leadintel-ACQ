// /admin-api/me/* — customer-scoped self-service for end users.
//
// Distinct from /admin-api/customers/* which is platform-admin-only.
// These routes are authn-only (any signed-in user) and scope every query
// to customers the caller is a member of. Platform admins see everything.

import { sql, acqSql, liSql } from "../db.ts";
import { json, requireAuthedJwt, AuthedAdmin } from "../auth.ts";
import { ensureProvisioned, syncCustomerMemberships } from "../lib/provisioning.ts";
import { upsertAuthUser } from "./users-create.ts";
import bcrypt from "npm:bcryptjs@2.4.3";

// GET /admin-api/platform-summary — platform-wide totals for the super-admin
// home (admin-gated in main.ts). One SQL pass over the shared ledger instead
// of the WalletBanner's old per-customer fan-out, which left the balance blank
// whenever any of the N calls was slow or failed.
export async function getPlatformSummary(_req: Request, _admin: AuthedAdmin): Promise<Response> {
  const w = (await sql<{ total: number }[]>`
    SELECT COALESCE(SUM(balance_cents), 0)::int AS total FROM platform.customer_wallet
  `)[0] ?? { total: 0 };
  const cc = (await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM platform.customers`)[0]?.c ?? 0;
  const usage = await sql<{ product: string; billed: number }[]>`
    SELECT product::text AS product, COALESCE(SUM(billed_cents), 0)::int AS billed
    FROM platform.usage_events
    WHERE created_at > now() - interval '30 days'
    GROUP BY product
  `;
  let acq = 0, li = 0;
  for (const u of usage) {
    if (u.product === "acq_coach")  acq = u.billed;
    if (u.product === "lead_intel") li  = u.billed;
  }
  return json({ total_balance_cents: w.total, customer_count: cc, acq_30d_cents: acq, li_30d_cents: li });
}

// Helper: resolve caller's platform user info from a Bearer-token request.
async function resolveCaller(req: Request): Promise<
  | { ok: true; platformUserId: string; email: string; isAdmin: boolean }
  | Response
> {
  const authed = requireAuthedJwt(req);
  if (authed instanceof Response) return authed;
  const rows = await sql<{ id: string; email: string; is_platform_admin: boolean }[]>`
    SELECT id, email, is_platform_admin FROM platform.users
    WHERE acq_user_id = ${authed.sub}::uuid OR leadintel_user_id = ${authed.sub}::uuid
    LIMIT 1
  `;
  if (rows.length === 0) {
    return json({ error: "unauthorized", reason: "no platform.users record" }, 401);
  }
  return { ok: true, platformUserId: rows[0].id, email: rows[0].email, isAdmin: rows[0].is_platform_admin };
}

// Check that the caller can access customer cid (member or platform admin).
async function callerCanAccess(platformUserId: string, isAdmin: boolean, customerId: string): Promise<boolean> {
  if (isAdmin) return true;
  const r = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM platform.customer_users
    WHERE user_id = ${platformUserId}::uuid AND customer_id = ${customerId}::uuid
  `;
  return r[0].c > 0;
}

// GET /admin-api/me/customers — list customers the caller belongs to.
// (Used by AccountShell to populate the "managed orgs" dropdown.)
export async function listMyCustomers(req: Request): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;

  // Platform admins see ALL customers; everyone else sees only memberships.
  const customers = r.isAdmin
    ? await sql`
        SELECT c.id, c.name, c.ghl_location_id, c.status,
               (c.acq_account_id IS NOT NULL) AS on_acq,
               (c.leadintel_tenant_id IS NOT NULL) AS on_leadintel,
               'platform_admin'::text AS my_role
        FROM platform.customers c ORDER BY c.name
      `
    : await sql`
        SELECT c.id, c.name, c.ghl_location_id, c.status,
               (c.acq_account_id IS NOT NULL) AS on_acq,
               (c.leadintel_tenant_id IS NOT NULL) AS on_leadintel,
               MAX(cu.role)::text AS my_role
        FROM platform.customer_users cu
        JOIN platform.customers c ON c.id = cu.customer_id
        WHERE cu.user_id = ${r.platformUserId}::uuid
        GROUP BY c.id ORDER BY c.name
      `;
  return json({ customers, is_platform_admin: r.isAdmin });
}

// GET /admin-api/me/customer/:cid/team — list members of a customer.
export async function listMyTeam(req: Request, cid: string): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;
  if (!(await callerCanAccess(r.platformUserId, r.isAdmin, cid))) {
    return json({ error: "forbidden", reason: "not a member of this customer" }, 403);
  }

  // Flat list — dedupe + group in JS (avoids tricky DISTINCT-FILTER combos).
  const flat = await sql<{ id: string; email: string; full_name: string | null; product: string; role: string }[]>`
    SELECT u.id, u.email, u.full_name, cu.product::text AS product, cu.role
    FROM platform.users u
    JOIN platform.customer_users cu ON cu.user_id = u.id
    WHERE cu.customer_id = ${cid}::uuid
    ORDER BY u.email, cu.product
  `;
  const byUser = new Map<string, { id: string; email: string; full_name: string | null; memberships: { product: string; role: string }[] }>();
  for (const r of flat) {
    if (!byUser.has(r.id)) byUser.set(r.id, { id: r.id, email: r.email, full_name: r.full_name, memberships: [] });
    byUser.get(r.id)!.memberships.push({ product: r.product, role: r.role });
  }
  return json({ team: [...byUser.values()] });
}

// POST /admin-api/me/customer/:cid/team   body: { email, role?, full_name? }
// Invite a user to this customer. If user doesn't exist, create them in
// platform-auth (with a temporary password — sent by email later).
export async function inviteToTeam(req: Request, cid: string): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;
  if (!(await callerCanAccess(r.platformUserId, r.isAdmin, cid))) {
    return json({ error: "forbidden" }, 403);
  }
  // Only account_admin / platform_admin can invite.
  if (!r.isAdmin) {
    const meRoles = await sql<{ role: string }[]>`
      SELECT role FROM platform.customer_users
      WHERE user_id = ${r.platformUserId}::uuid AND customer_id = ${cid}::uuid
    `;
    if (!meRoles.some(m => m.role === "account_admin" || m.role === "super_admin")) {
      return json({ error: "forbidden", reason: "only account admins can invite" }, 403);
    }
  }

  const body = await req.json().catch(() => null) as { email?: string; role?: string; full_name?: string } | null;
  const email = (body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json({ error: "bad_request", reason: "valid email required" }, 400);
  }
  const role = body?.role || "tenant_user";

  // Find or create the platform.users row.
  let platformUser = (await sql<{ id: string; email: string; full_name: string | null }[]>`
    SELECT id, email, full_name FROM platform.users WHERE lower(email) = ${email} LIMIT 1
  `)[0];

  if (!platformUser) {
    // Brand-new person. Mint the login exactly like POST /admin-api/users does:
    // one shared UUID, back-pointers set, and an auth.users row in platform + both
    // app DBs. Inserting a bare platform.users row here (the old behaviour) left
    // acq_user_id/leadintel_user_id NULL, so ensureProvisioned() below could not
    // mirror them into ACQ/LI and they ended up with memberships but no way in.
    // There's no outbound email in this deployment, so a password is required —
    // the admin hands it over directly.
    const password = (body?.password ?? "").toString();
    if (password.length < 8) {
      return json({
        error: "password_required",
        reason: `${email} does not have an account yet — set a password (8+ characters) to create one`,
      }, 400);
    }
    const idRow = await sql<{ id: string }[]>`SELECT gen_random_uuid() AS id`;
    const newId = idRow[0].id;
    await sql`
      INSERT INTO platform.users (id, email, full_name, acq_user_id, leadintel_user_id)
      VALUES (${newId}::uuid, ${email}, ${body?.full_name ?? null}, ${newId}::uuid, ${newId}::uuid)
    `;
    const hash = await bcrypt.hash(password, 10);
    const authR = await upsertAuthUser(sql, newId, email, hash);
    if (!authR.ok) {
      await sql`SELECT platform.admin_delete_user(${newId}::uuid)`; // don't strand a half-made user
      return json({ error: "auth_create_failed", reason: authR.error }, 500);
    }
    await Promise.all([
      upsertAuthUser(acqSql, newId, email, hash),
      upsertAuthUser(liSql, newId, email, hash),
    ]);
    platformUser = { id: newId, email, full_name: body?.full_name ?? null };
  }

  // Add to customer_users (idempotent).
  const productsEnabled = await sql<{ product: string }[]>`
    SELECT product FROM platform.customer_product_access
    WHERE customer_id = ${cid}::uuid AND enabled = true
  `;
  if (productsEnabled.length === 0) {
    return json({ error: "bad_request", reason: "customer has no products enabled — enable one first" }, 400);
  }
  for (const p of productsEnabled) {
    await sql`
      INSERT INTO platform.customer_users (customer_id, user_id, product, role)
      VALUES (${cid}::uuid, ${platformUser.id}::uuid, ${p.product}::platform.product, ${role})
      ON CONFLICT (customer_id, user_id, product) DO UPDATE SET role = EXCLUDED.role
    `;
  }

  // Provision into both apps so the user can actually function.
  const provisioning = await syncCustomerMemberships(cid);

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, target_user_id, action, metadata)
    VALUES (
      ${r.platformUserId}::uuid, ${platformUser.id}::uuid,
      'team_member_invited',
      ${sql.json({ customer_id: cid, email, role })}
    )
  `;

  // Report mirroring failures for THIS user instead of a bare count. The count
  // covers every member of the customer, so it stayed reassuringly non-zero even
  // when the person we just added was the one that failed to provision.
  const mine = provisioning.results.filter(x => x.user_id === platformUser.id);
  const failed = mine.filter(x => !x.result.ok);
  return json({
    ok: true,
    user: platformUser,
    provisioned: mine.map(x => ({ product: x.product, ok: x.result.ok, error: x.result.ok ? undefined : (x.result as { error?: string }).error })),
    warning: failed.length > 0
      ? `added to the customer, but could not be set up in ${failed.map(f => f.product).join(" + ")} — they may not see data there`
      : undefined,
    provisioning_count: provisioning.results.length,
  });
}

// DELETE /admin-api/me/customer/:cid/team/:uid — remove user from customer.
export async function removeFromTeam(req: Request, cid: string, uid: string): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;
  if (!(await callerCanAccess(r.platformUserId, r.isAdmin, cid))) {
    return json({ error: "forbidden" }, 403);
  }
  if (!r.isAdmin) {
    const meRoles = await sql<{ role: string }[]>`
      SELECT role FROM platform.customer_users
      WHERE user_id = ${r.platformUserId}::uuid AND customer_id = ${cid}::uuid
    `;
    if (!meRoles.some(m => m.role === "account_admin" || m.role === "super_admin")) {
      return json({ error: "forbidden", reason: "only account admins can remove" }, 403);
    }
  }
  if (uid === r.platformUserId) {
    return json({ error: "bad_request", reason: "you can't remove yourself" }, 400);
  }
  const del = await sql`
    DELETE FROM platform.customer_users
    WHERE customer_id = ${cid}::uuid AND user_id = ${uid}::uuid
    RETURNING product
  `;
  await sql`
    INSERT INTO platform.audit_log (actor_user_id, target_user_id, action, metadata)
    VALUES (
      ${r.platformUserId}::uuid, ${uid}::uuid,
      'team_member_removed',
      ${sql.json({ customer_id: cid, products: del.map((d: any) => d.product) })}
    )
  `;
  return json({ ok: true, removed_count: del.length });
}

// GET /admin-api/me/customer/:cid/billing — wallet, payment method, recent tx, usage split.
export async function getMyBilling(req: Request, cid: string): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;
  if (!(await callerCanAccess(r.platformUserId, r.isAdmin, cid))) {
    return json({ error: "forbidden" }, 403);
  }
  const wallet = (await sql<any[]>`
    SELECT balance_cents, refreshed_at FROM platform.customer_wallet WHERE customer_id = ${cid}::uuid
  `)[0] ?? { balance_cents: 0, refreshed_at: null };

  const billing = (await sql<any[]>`
    SELECT stripe_customer_id, stripe_env, default_payment_method_id,
           card_brand, card_last4, card_exp_month, card_exp_year,
           auto_recharge_enabled, threshold_cents, topup_amount_cents
    FROM platform.billing_settings WHERE customer_id = ${cid}::uuid
  `)[0] ?? null;

  const transactions = await sql`
    SELECT id, product, type, amount_cents, balance_after_cents, reason, created_at
    FROM platform.wallet_transactions
    WHERE customer_id = ${cid}::uuid
    ORDER BY created_at DESC LIMIT 30
  `;

  const usage30d = await sql`
    SELECT product, count(*)::int AS cnt, COALESCE(sum(billed_cents), 0)::int AS billed
    FROM platform.usage_events
    WHERE customer_id = ${cid}::uuid AND created_at > now() - interval '30 days'
    GROUP BY product
    ORDER BY product
  `;

  return json({ wallet, billing, transactions, usage_30d: usage30d });
}

// GET /admin-api/me/customer/:cid/connections — GHL status (read-only for non-admins).
export async function getMyConnections(req: Request, cid: string): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;
  if (!(await callerCanAccess(r.platformUserId, r.isAdmin, cid))) {
    return json({ error: "forbidden" }, 403);
  }
  const rows = await sql<any[]>`
    SELECT
      ghl_location_id, ghl_company_id,
      (ghl_pit_token_encrypted IS NOT NULL) AS ghl_token_set,
      ghl_pit_token_last_4, ghl_pit_token_set_at
    FROM platform.customers WHERE id = ${cid}::uuid
  `;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  return json({ ghl: rows[0] });
}

// GET /admin-api/me/customer/:cid/activity — audit log scoped to this customer.
export async function getMyActivity(req: Request, cid: string): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;
  if (!(await callerCanAccess(r.platformUserId, r.isAdmin, cid))) {
    return json({ error: "forbidden" }, 403);
  }
  const events = await sql`
    SELECT a.id, a.action, a.created_at, a.metadata, a.product,
           ru.email AS actor_email
    FROM platform.audit_log a
    LEFT JOIN platform.users ru ON ru.id = a.actor_user_id
    WHERE a.metadata->>'customer_id' = ${cid}
    ORDER BY a.created_at DESC LIMIT 50
  `;
  return json({ events });
}

// PATCH /admin-api/me/customer/:cid/billing/auto-recharge
// body: { enabled, threshold_cents, topup_amount_cents }
export async function setAutoRecharge(req: Request, cid: string): Promise<Response> {
  const r = await resolveCaller(req);
  if (r instanceof Response) return r;
  if (!(await callerCanAccess(r.platformUserId, r.isAdmin, cid))) {
    return json({ error: "forbidden" }, 403);
  }
  // Only account_admin / platform_admin can change billing settings.
  if (!r.isAdmin) {
    const meRoles = await sql<{ role: string }[]>`
      SELECT role FROM platform.customer_users WHERE user_id = ${r.platformUserId}::uuid AND customer_id = ${cid}::uuid
    `;
    if (!meRoles.some(m => m.role === "account_admin" || m.role === "super_admin")) {
      return json({ error: "forbidden", reason: "only account admins can change billing" }, 403);
    }
  }
  const body = await req.json().catch(() => null) as
    | { enabled?: boolean; threshold_cents?: number; topup_amount_cents?: number }
    | null;
  if (!body || typeof body.enabled !== "boolean") {
    return json({ error: "bad_request", reason: "expected { enabled, threshold_cents?, topup_amount_cents? }" }, 400);
  }
  const threshold = body.threshold_cents != null ? Math.max(0, Math.floor(body.threshold_cents)) : null;
  const topup     = body.topup_amount_cents != null ? Math.max(500, Math.floor(body.topup_amount_cents)) : null;

  await sql`
    INSERT INTO platform.billing_settings (customer_id, auto_recharge_enabled, threshold_cents, topup_amount_cents)
    VALUES (${cid}::uuid, ${body.enabled}, ${threshold}, ${topup})
    ON CONFLICT (customer_id) DO UPDATE SET
      auto_recharge_enabled = EXCLUDED.auto_recharge_enabled,
      threshold_cents       = COALESCE(EXCLUDED.threshold_cents, platform.billing_settings.threshold_cents),
      topup_amount_cents    = COALESCE(EXCLUDED.topup_amount_cents, platform.billing_settings.topup_amount_cents)
  `;
  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${r.platformUserId}::uuid, 'auto_recharge_updated',
            ${sql.json({ customer_id: cid, enabled: body.enabled, threshold_cents: threshold, topup_amount_cents: topup })})
  `;
  return json({ ok: true });
}
