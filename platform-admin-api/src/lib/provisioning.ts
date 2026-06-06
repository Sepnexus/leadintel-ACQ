// Cross-app user provisioning.
//
// platform.customer_users + platform.customer_product_access tell the truth
// about who SHOULD have access. But each app has its own user/membership
// tables (ACQ: public.profiles + user_roles; LI: public.users + tenant_users)
// that the apps' code joins against to actually FUNCTION. Without rows in
// those tables, a user gets a valid JWT but can't see any data.
//
// This module bridges that. Call ensureProvisioned() any time:
//   - a new customer_users row is created
//   - a customer_product_access row enables a product
//   - an admin clicks "Sync memberships" on a customer detail page
//
// Idempotent. Safe to call repeatedly.

import { sql, acqSql, liSql } from "../db.ts";

type Product = "acq_coach" | "lead_intel";

interface Platform_User {
  id: string;
  email: string;
  full_name: string | null;
  acq_user_id: string | null;
  leadintel_user_id: string | null;
}

interface Platform_Customer {
  id: string;
  name: string;
  acq_account_id: string | null;
  leadintel_tenant_id: string | null;
}

// Map platform.customer_users.role → ACQ's user_roles app_role enum.
function acqRoleFor(platformRole: string): "account_admin" | "rep" {
  // Customer-level admins are account_admin; everyone else is a rep.
  // platform-wide super_admins are managed separately (is_platform_admin).
  if (platformRole === "account_admin" || platformRole === "owner" || platformRole === "super_admin") {
    return "account_admin";
  }
  return "rep";
}

// LI's public.users.role is plain text; default to tenant_user for everyone.
// (super_admin is only for global platform admins, set by the bootstrap fn.)
function liRoleFor(_platformRole: string): string {
  return "tenant_user";
}

/**
 * Ensure a single user has the right rows in the target app for a given customer.
 *
 * @param platformUserId  platform.users.id (NOT the app-specific id)
 * @param platformCustomerId  platform.customers.id
 * @param product       which app to provision in
 */
export async function ensureProvisioned(
  platformUserId: string,
  platformCustomerId: string,
  product: Product,
): Promise<{ ok: boolean; product: Product; created?: string[]; skipped?: string; error?: string }> {
  // Look up platform user + customer
  const [userRows, custRows] = await Promise.all([
    sql<Platform_User[]>`
      SELECT id, email, full_name, acq_user_id, leadintel_user_id
      FROM platform.users WHERE id = ${platformUserId}::uuid
    `,
    sql<Platform_Customer[]>`
      SELECT id, name, acq_account_id, leadintel_tenant_id
      FROM platform.customers WHERE id = ${platformCustomerId}::uuid
    `,
  ]);
  if (userRows.length === 0) return { ok: false, product, error: "user not found" };
  if (custRows.length === 0) return { ok: false, product, error: "customer not found" };
  const user = userRows[0];
  const cust = custRows[0];

  // Look up the customer_users role for the role we'll set in the app.
  const cuRows = await sql<{ role: string }[]>`
    SELECT role FROM platform.customer_users
    WHERE customer_id = ${platformCustomerId}::uuid AND user_id = ${platformUserId}::uuid
    ORDER BY role DESC LIMIT 1
  `;
  const platformRole = cuRows[0]?.role ?? "tenant_user";

  const created: string[] = [];

  if (product === "acq_coach") {
    if (!acqSql) return { ok: false, product, error: "acq bridge unavailable" };
    if (!cust.acq_account_id) {
      return { ok: true, product, skipped: "customer has no acq_account_id — product not provisioned on customer (this is fine for LI-only customers)" };
    }
    // Mirror back-pointer fix: same idea as the LI block.
    if (!user.acq_user_id) {
      const acqAuthRow = await acqSql<{ id: string }[]>`
        SELECT id FROM auth.users WHERE email = ${user.email} LIMIT 1
      `;
      if (acqAuthRow.length > 0) {
        const acqUserId = acqAuthRow[0].id;
        await sql`
          UPDATE platform.users SET acq_user_id = ${acqUserId}::uuid WHERE id = ${platformUserId}::uuid
        `;
        user.acq_user_id = acqUserId;
        created.push("backfilled_acq_user_id");
      } else {
        return { ok: false, product, error: "user has no row in ACQ auth.users (run mirror-to-apps script)" };
      }
    }
    // public.profiles row
    const beforeP = await acqSql<{ c: number }[]>`SELECT count(*)::int AS c FROM public.profiles WHERE id = ${user.acq_user_id}::uuid`;
    await acqSql`
      INSERT INTO public.profiles (id, full_name, account_id, created_by, created_at, updated_at)
      VALUES (
        ${user.acq_user_id}::uuid,
        ${user.full_name ?? user.email.split("@")[0]},
        ${cust.acq_account_id}::uuid,
        ${user.acq_user_id}::uuid,
        now(), now()
      )
      ON CONFLICT (id) DO UPDATE
      SET account_id = COALESCE(public.profiles.account_id, EXCLUDED.account_id),
          updated_at = now()
    `;
    if (beforeP[0].c === 0) created.push("profiles");

    // public.user_roles row
    const acqRole = acqRoleFor(platformRole);
    const beforeR = await acqSql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM public.user_roles
      WHERE user_id = ${user.acq_user_id}::uuid AND account_id = ${cust.acq_account_id}::uuid
    `;
    await acqSql`
      INSERT INTO public.user_roles (user_id, role, account_id)
      VALUES (${user.acq_user_id}::uuid, ${acqRole}::public.app_role, ${cust.acq_account_id}::uuid)
      ON CONFLICT (user_id, role, account_id) DO NOTHING
    `;
    if (beforeR[0].c === 0) created.push(`user_roles(${acqRole})`);

    return { ok: true, product, created };
  }

  if (product === "lead_intel") {
    if (!liSql) return { ok: false, product, error: "leadintel bridge unavailable" };
    if (!cust.leadintel_tenant_id) {
      return { ok: true, product, skipped: "customer has no leadintel_tenant_id — product not provisioned on customer (this is fine for ACQ-only customers)" };
    }
    // If the back-pointer is missing, see if the user already exists in LI's
    // auth.users (typical post-C2 mirror case where mhassan-style ACQ-only
    // users got auth rows in LI but platform.users wasn't updated).
    if (!user.leadintel_user_id) {
      const liAuthRow = await liSql<{ id: string }[]>`
        SELECT id FROM auth.users WHERE email = ${user.email} LIMIT 1
      `;
      if (liAuthRow.length > 0) {
        const liUserId = liAuthRow[0].id;
        await sql`
          UPDATE platform.users SET leadintel_user_id = ${liUserId}::uuid WHERE id = ${platformUserId}::uuid
        `;
        user.leadintel_user_id = liUserId;
        created.push("backfilled_leadintel_user_id");
      } else {
        return { ok: false, product, error: "user has no row in LI auth.users (run mirror-to-apps script)" };
      }
    }
    // public.users row (LI's app-level users table)
    const beforeU = await liSql<{ c: number }[]>`SELECT count(*)::int AS c FROM public.users WHERE id = ${user.leadintel_user_id}::uuid`;
    await liSql`
      INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
      VALUES (
        ${user.leadintel_user_id}::uuid,
        ${user.email},
        ${user.full_name ?? user.email.split("@")[0]},
        ${liRoleFor(platformRole)},
        now(), now()
      )
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, updated_at = now()
    `;
    if (beforeU[0].c === 0) created.push("users");

    // public.tenant_users (membership)
    const beforeTU = await liSql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM public.tenant_users
      WHERE user_id = ${user.leadintel_user_id}::uuid AND tenant_id = ${cust.leadintel_tenant_id}::uuid
    `;
    await liSql`
      INSERT INTO public.tenant_users (user_id, tenant_id)
      VALUES (${user.leadintel_user_id}::uuid, ${cust.leadintel_tenant_id}::uuid)
      ON CONFLICT DO NOTHING
    `;
    if (beforeTU[0].c === 0) created.push("tenant_users");

    return { ok: true, product, created };
  }

  return { ok: false, product, error: "unknown product" };
}

/**
 * Sync ALL members of a customer into all enabled products' app tables.
 * Used when a customer's product access changes or on demand.
 */
export async function syncCustomerMemberships(platformCustomerId: string): Promise<{
  ok: boolean;
  customer_id: string;
  results: Array<{ user_id: string; email: string; product: Product; result: Awaited<ReturnType<typeof ensureProvisioned>> }>;
}> {
  // Which products does this customer have enabled?
  const enabled = await sql<{ product: Product }[]>`
    SELECT product FROM platform.customer_product_access
    WHERE customer_id = ${platformCustomerId}::uuid
      AND enabled = true
      AND (valid_until IS NULL OR valid_until > now())
  `;
  if (enabled.length === 0) {
    return { ok: true, customer_id: platformCustomerId, results: [] };
  }
  const products = enabled.map(e => e.product);

  // Which users are on this customer?
  const members = await sql<{ user_id: string; email: string }[]>`
    SELECT cu.user_id, u.email
    FROM platform.customer_users cu
    JOIN platform.users u ON u.id = cu.user_id
    WHERE cu.customer_id = ${platformCustomerId}::uuid
  `;

  const results: Array<{ user_id: string; email: string; product: Product; result: Awaited<ReturnType<typeof ensureProvisioned>> }> = [];
  for (const m of members) {
    for (const product of products) {
      const result = await ensureProvisioned(m.user_id, platformCustomerId, product);
      results.push({ user_id: m.user_id, email: m.email, product, result });
    }
  }
  return { ok: true, customer_id: platformCustomerId, results };
}
