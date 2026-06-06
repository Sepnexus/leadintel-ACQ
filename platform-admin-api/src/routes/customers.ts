// /admin-api/customers — list, get, update, toggle access.

import { sql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";
import { syncCustomerMemberships } from "../lib/provisioning.ts";
import { ensureAppCustomerRow } from "../lib/app-customer.ts";

type Product = "acq_coach" | "lead_intel";

// GET /admin-api/customers?q=<search>&limit=50
export async function listCustomers(req: Request, _admin: AuthedAdmin): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50") || 50, 200);

  const rows = q
    ? await sql`
        SELECT c.id, c.name, c.ghl_location_id, c.ghl_company_id, c.status, c.is_test, c.demo_mode,
               c.trial_active, c.trial_expires_at,
               (c.acq_account_id IS NOT NULL) AS on_acq,
               (c.leadintel_tenant_id IS NOT NULL) AS on_leadintel,
               COALESCE((SELECT bool_or(enabled) FROM platform.customer_product_access
                         WHERE customer_id=c.id AND product='acq_coach'), false) AS acq_enabled,
               COALESCE((SELECT bool_or(enabled) FROM platform.customer_product_access
                         WHERE customer_id=c.id AND product='lead_intel'), false) AS li_enabled,
               (SELECT count(DISTINCT user_id) FROM platform.customer_users WHERE customer_id=c.id)::int AS user_count
        FROM platform.customers c
        WHERE lower(c.name) LIKE ${"%" + q + "%"}
           OR c.ghl_location_id ILIKE ${"%" + q + "%"}
        ORDER BY c.name
        LIMIT ${limit}
      `
    : await sql`
        SELECT c.id, c.name, c.ghl_location_id, c.ghl_company_id, c.status, c.is_test, c.demo_mode,
               c.trial_active, c.trial_expires_at,
               (c.acq_account_id IS NOT NULL) AS on_acq,
               (c.leadintel_tenant_id IS NOT NULL) AS on_leadintel,
               COALESCE((SELECT bool_or(enabled) FROM platform.customer_product_access
                         WHERE customer_id=c.id AND product='acq_coach'), false) AS acq_enabled,
               COALESCE((SELECT bool_or(enabled) FROM platform.customer_product_access
                         WHERE customer_id=c.id AND product='lead_intel'), false) AS li_enabled,
               (SELECT count(DISTINCT user_id) FROM platform.customer_users WHERE customer_id=c.id)::int AS user_count
        FROM platform.customers c
        ORDER BY c.name
        LIMIT ${limit}
      `;

  return json({ customers: rows, count: rows.length });
}

// GET /admin-api/customers/:id
export async function getCustomer(_req: Request, _admin: AuthedAdmin, id: string): Promise<Response> {
  const rows = await sql`
    SELECT c.id, c.name, c.ghl_location_id, c.ghl_company_id, c.acq_account_id, c.leadintel_tenant_id,
           c.status, c.plan, c.is_test, c.demo_mode,
           c.trial_active, c.trial_started_at, c.trial_expires_at, c.notes,
           c.created_at, c.updated_at,
           (c.acq_account_id IS NOT NULL) AS on_acq,
           (c.leadintel_tenant_id IS NOT NULL) AS on_leadintel,
           -- GHL token fingerprint only — value is decrypt-only via /ghl/token
           (c.ghl_pit_token_encrypted IS NOT NULL) AS ghl_token_set,
           c.ghl_pit_token_last_4 AS ghl_token_last_4,
           c.ghl_pit_token_set_at AS ghl_token_set_at
    FROM platform.customers c WHERE c.id = ${id}::uuid
  `;
  if (rows.length === 0) return json({ error: "not_found" }, 404);

  const access = await sql`
    SELECT product, enabled, valid_until, notes, updated_at
    FROM platform.customer_product_access
    WHERE customer_id = ${id}::uuid
  `;

  const users = await sql`
    SELECT u.id, u.email, u.full_name, cu.product, cu.role
    FROM platform.customer_users cu
    JOIN platform.users u ON u.id = cu.user_id
    WHERE cu.customer_id = ${id}::uuid
    ORDER BY u.email, cu.product
  `;

  const recentActivity = await sql`
    SELECT id, action, metadata, created_at, actor_user_id
    FROM platform.audit_log
    WHERE target_user_id IN (SELECT user_id FROM platform.customer_users WHERE customer_id = ${id}::uuid)
       OR (metadata ? 'customer_id' AND metadata->>'customer_id' = ${id})
    ORDER BY created_at DESC
    LIMIT 30
  `;

  // Wallet + billing + recent transactions + usage rollup (Phase B2/B3/C1)
  const wallet = await sql<{ balance_cents: number; refreshed_at: string }[]>`
    SELECT balance_cents, refreshed_at FROM platform.customer_wallet WHERE customer_id = ${id}::uuid
  `;
  const billing = await sql<{
    stripe_customer_id: string | null; default_payment_method_id: string | null;
    card_brand: string | null; card_last4: string | null;
    card_exp_month: number | null; card_exp_year: number | null;
    auto_recharge_enabled: boolean; threshold_cents: number; topup_amount_cents: number;
  }[]>`
    SELECT stripe_customer_id, default_payment_method_id, card_brand, card_last4,
           card_exp_month, card_exp_year, auto_recharge_enabled, threshold_cents, topup_amount_cents
    FROM platform.billing_settings WHERE customer_id = ${id}::uuid
  `;
  const recentTransactions = await sql`
    SELECT id, product, type, amount_cents, balance_after_cents, reason, created_at
    FROM platform.wallet_transactions
    WHERE customer_id = ${id}::uuid
    ORDER BY created_at DESC
    LIMIT 20
  `;
  const usageSummary = await sql<{ product: string; cnt: number; billed: number }[]>`
    SELECT product, count(*)::int AS cnt, COALESCE(sum(billed_cents),0)::int AS billed
    FROM platform.usage_events
    WHERE customer_id = ${id}::uuid AND created_at > now() - interval '30 days'
    GROUP BY product
  `;

  return json({
    customer: rows[0], access, users, recent_activity: recentActivity,
    wallet: wallet[0] ?? null,
    billing: billing[0] ?? null,
    recent_transactions: recentTransactions,
    usage_30d: usageSummary,
  });
}

// POST /admin-api/customers/:id/access  body: { product, enabled, valid_until?, notes? }
export async function setCustomerAccess(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const body = await req.json().catch(() => null) as
    | { product?: Product; enabled?: boolean; valid_until?: string | null; notes?: string | null }
    | null;
  if (!body?.product || typeof body.enabled !== "boolean") {
    return json({ error: "bad_request", reason: "expected { product, enabled, valid_until?, notes? }" }, 400);
  }
  if (body.product !== "acq_coach" && body.product !== "lead_intel") {
    return json({ error: "bad_request", reason: "product must be 'acq_coach' or 'lead_intel'" }, 400);
  }

  // Confirm customer exists
  const exists = await sql`SELECT id, name FROM platform.customers WHERE id = ${id}::uuid`;
  if (exists.length === 0) return json({ error: "not_found" }, 404);

  await sql`
    INSERT INTO platform.customer_product_access (customer_id, product, enabled, valid_until, notes, updated_by)
    VALUES (${id}::uuid, ${body.product}::platform.product, ${body.enabled},
            ${body.valid_until ?? null}::timestamptz, ${body.notes ?? null}, ${admin.platformUserId}::uuid)
    ON CONFLICT (customer_id, product) DO UPDATE
    SET enabled     = EXCLUDED.enabled,
        valid_until = EXCLUDED.valid_until,
        notes       = COALESCE(EXCLUDED.notes, platform.customer_product_access.notes),
        updated_by  = EXCLUDED.updated_by
  `;

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, product, action, metadata)
    VALUES (${admin.platformUserId}::uuid, ${body.product}::platform.product,
            ${body.enabled ? "customer_access_granted" : "customer_access_revoked"},
            ${sql.json({ customer_id: id, customer_name: exists[0].name, valid_until: body.valid_until ?? null })})
  `;

  // When ENABLING a product:
  //   1. Ensure the customer EXISTS in the target app (ghl_accounts/tenants)
  //   2. Push existing customer members into that app's tables
  // No-op for revoke.
  let appRow: unknown = null;
  let provisioning: unknown = null;
  if (body.enabled) {
    try {
      appRow = await ensureAppCustomerRow(id, body.product);
    } catch (e) {
      console.error("[setCustomerAccess] ensureAppCustomerRow failed:", (e as Error).message);
    }
    try {
      provisioning = await syncCustomerMemberships(id);
    } catch (e) {
      console.error("[setCustomerAccess] provisioning failed:", (e as Error).message);
    }
  }

  return json({ ok: true, app_row: appRow, provisioning });
}

// POST /admin-api/customers/:id/sync — manually re-run provisioning for all
// current customer_users into all enabled products. Idempotent. Useful when
// a customer admin (or you) notices a user can't see anything in an app.
export async function syncMemberships(_req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const exists = await sql`SELECT id, name FROM platform.customers WHERE id = ${id}::uuid`;
  if (exists.length === 0) return json({ error: "not_found" }, 404);

  const result = await syncCustomerMemberships(id);

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      'customer_memberships_synced',
      ${sql.json({ customer_id: id, customer_name: exists[0].name, count: result.results.length })}
    )
  `;
  return json(result);
}

// POST /admin-api/customers  body: { name, ghl_location_id?, ghl_company_id?, plan?, is_test?, demo_mode?, trial_active?, trial_expires_at?, notes?, products?: Product[] }
// Creates a NEW customer org. Optionally enables it for one or more products.
export async function createCustomer(req: Request, admin: AuthedAdmin): Promise<Response> {
  const body = await req.json().catch(() => null) as
    | {
        name?: string;
        ghl_location_id?: string | null;
        ghl_company_id?: string | null;
        plan?: string;
        is_test?: boolean;
        demo_mode?: boolean;
        trial_active?: boolean;
        trial_expires_at?: string | null;
        notes?: string | null;
        products?: Product[];
      }
    | null;

  if (!body?.name?.trim()) {
    return json({ error: "bad_request", reason: "name is required" }, 400);
  }
  const name = body.name.trim();
  const ghl_location_id = body.ghl_location_id?.trim() || null;
  const products = (body.products ?? []).filter(p => p === "acq_coach" || p === "lead_intel");

  // Guard against duplicate location_id (the natural key)
  if (ghl_location_id) {
    const existing = await sql`SELECT id, name FROM platform.customers WHERE ghl_location_id = ${ghl_location_id}`;
    if (existing.length > 0) {
      return json({
        error: "duplicate_location_id",
        reason: `GHL location "${ghl_location_id}" already belongs to customer "${existing[0].name}".`,
        existing_customer_id: existing[0].id,
      }, 409);
    }
  }

  const rows = await sql<{ id: string }[]>`
    INSERT INTO platform.customers (
      name, ghl_location_id, ghl_company_id, plan,
      is_test, demo_mode, trial_active, trial_expires_at, notes, created_by
    )
    VALUES (
      ${name},
      ${ghl_location_id},
      ${body.ghl_company_id?.trim() || null},
      ${body.plan ?? "standard"},
      ${body.is_test ?? false},
      ${body.demo_mode ?? false},
      ${body.trial_active ?? false},
      ${body.trial_expires_at ?? null}::timestamptz,
      ${body.notes ?? null},
      ${admin.platformUserId}::uuid
    )
    RETURNING id
  `;
  const newId = rows[0].id;

  // For each enabled product: (a) create the customer_product_access row,
  // (b) create the corresponding app-side row (ghl_accounts for ACQ,
  // tenants for LI), (c) link the new app id back into platform.customers.
  // Without (b) the customer is invisible inside the app and downstream
  // flows (GHL token mirror, user provisioning, GHL sync) all silently fail.
  const provisioningResults: Array<{ product: Product; ok: boolean; created?: boolean; existed?: boolean; app_id?: string; error?: string }> = [];
  for (const p of products) {
    await sql`
      INSERT INTO platform.customer_product_access (customer_id, product, enabled, updated_by)
      VALUES (${newId}::uuid, ${p}::platform.product, true, ${admin.platformUserId}::uuid)
      ON CONFLICT (customer_id, product) DO NOTHING
    `;
    const r = await ensureAppCustomerRow(newId, p);
    provisioningResults.push({ product: p, ...r });
  }

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      'customer_created',
      ${sql.json({ customer_id: newId, name, ghl_location_id, products_enabled: products, provisioning: provisioningResults })}
    )
  `;

  return json({ ok: true, id: newId, app_provisioning: provisioningResults }, 201);
}

// PATCH /admin-api/customers/:id  body: { name?, status?, is_test?, demo_mode?, trial_active?, trial_expires_at?, notes? }
export async function updateCustomer(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  // whitelist editable fields
  const allowed = ["name", "status", "is_test", "demo_mode", "trial_active", "trial_expires_at", "plan", "notes"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];
  if (Object.keys(updates).length === 0) return json({ error: "bad_request", reason: "no editable fields" }, 400);

  const exists = await sql`SELECT id, name FROM platform.customers WHERE id = ${id}::uuid`;
  if (exists.length === 0) return json({ error: "not_found" }, 404);

  // Build the UPDATE dynamically with sql.json helper
  await sql`
    UPDATE platform.customers
    SET ${sql(updates)}
    WHERE id = ${id}::uuid
  `;

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, 'customer_updated',
            ${sql.json({ customer_id: id, fields: Object.keys(updates) })})
  `;

  return json({ ok: true });
}
