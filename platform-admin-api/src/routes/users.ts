// /admin-api/users — list, get. Per-user access toggles were removed:
// access is now derived from customer membership (see init/10).
// listUsers / getUser still surface per-product "has access" flags but they
// reflect customer-derived state, not a user-level toggle.

import { sql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

// GET /admin-api/users?q=<email-or-name>&limit=50
export async function listUsers(req: Request, _admin: AuthedAdmin): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);

  // acq_enabled / li_enabled are now derived: true if user belongs to any
  // customer with that product enabled, OR user is_platform_admin.
  const rows = q
    ? await sql`
        SELECT u.id, u.email, u.full_name, u.is_platform_admin,
               (u.acq_user_id IS NOT NULL) AS on_acq,
               (u.leadintel_user_id IS NOT NULL) AS on_leadintel,
               platform.user_has_access(u.id, 'acq_coach') AS acq_enabled,
               platform.user_has_access(u.id, 'lead_intel') AS li_enabled,
               COALESCE((
                 SELECT json_agg(json_build_object(
                   'id', c.id, 'name', c.name, 'product', cu.product, 'role', cu.role
                 ) ORDER BY c.name, cu.product)
                 FROM platform.customer_users cu
                 JOIN platform.customers c ON c.id = cu.customer_id
                 WHERE cu.user_id = u.id
               ), '[]'::json) AS memberships,
               u.created_at
        FROM platform.users u
        WHERE lower(u.email) LIKE ${"%" + q + "%"} OR lower(COALESCE(u.full_name, '')) LIKE ${"%" + q + "%"}
        ORDER BY u.email
        LIMIT ${limit}
      `
    : await sql`
        SELECT u.id, u.email, u.full_name, u.is_platform_admin,
               (u.acq_user_id IS NOT NULL) AS on_acq,
               (u.leadintel_user_id IS NOT NULL) AS on_leadintel,
               platform.user_has_access(u.id, 'acq_coach') AS acq_enabled,
               platform.user_has_access(u.id, 'lead_intel') AS li_enabled,
               COALESCE((
                 SELECT json_agg(json_build_object(
                   'id', c.id, 'name', c.name, 'product', cu.product, 'role', cu.role
                 ) ORDER BY c.name, cu.product)
                 FROM platform.customer_users cu
                 JOIN platform.customers c ON c.id = cu.customer_id
                 WHERE cu.user_id = u.id
               ), '[]'::json) AS memberships,
               u.created_at
        FROM platform.users u
        ORDER BY u.email
        LIMIT ${limit}
      `;
  return json({ users: rows, count: rows.length });
}

// GET /admin-api/users/:id
export async function getUser(_req: Request, _admin: AuthedAdmin, id: string): Promise<Response> {
  const rows = await sql`SELECT * FROM platform.users WHERE id = ${id}::uuid`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);

  // Per-user toggles are gone. We surface customer memberships joined with
  // the customer's product-level enabled flag so the UI can show
  // "granted via customer X" or "no access".
  const customers = await sql`
    SELECT
      c.id, c.name, c.ghl_location_id, cu.product, cu.role,
      COALESCE((SELECT enabled FROM platform.customer_product_access
                WHERE customer_id = c.id AND product = 'acq_coach'), false)  AS customer_acq_enabled,
      COALESCE((SELECT enabled FROM platform.customer_product_access
                WHERE customer_id = c.id AND product = 'lead_intel'), false) AS customer_li_enabled
    FROM platform.customer_users cu
    JOIN platform.customers c ON c.id = cu.customer_id
    WHERE cu.user_id = ${id}::uuid
    ORDER BY c.name, cu.product
  `;

  const recentActivity = await sql`
    SELECT id, action, metadata, created_at, actor_user_id
    FROM platform.audit_log
    WHERE target_user_id = ${id}::uuid
    ORDER BY created_at DESC
    LIMIT 30
  `;

  // Keep `access` field for back-compat with older clients but populate it
  // from the derived check rather than user_product_access table.
  const access = [
    {
      product: "acq_coach",
      enabled: (await sql<{ ok: boolean }[]>`SELECT platform.user_has_access(${id}::uuid, 'acq_coach') AS ok`)[0].ok,
      valid_until: null, notes: null, updated_at: null,
    },
    {
      product: "lead_intel",
      enabled: (await sql<{ ok: boolean }[]>`SELECT platform.user_has_access(${id}::uuid, 'lead_intel') AS ok`)[0].ok,
      valid_until: null, notes: null, updated_at: null,
    },
  ];

  return json({ user: rows[0], access, customers, recent_activity: recentActivity });
}
