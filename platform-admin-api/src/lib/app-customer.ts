// When a customer is created (or a product is newly enabled on them), the
// matching app-level row must exist before anything else (GHL token mirror,
// user provisioning, sync_history) can work.
//
// ACQ keeps customers in public.ghl_accounts.
// LI  keeps customers in public.tenants.
//
// Idempotent — checks platform.customers.acq_account_id / leadintel_tenant_id
// first and short-circuits if already linked. Called from createCustomer
// (for every product enabled at creation time) and from setCustomerAccess
// (when an admin flips a product on later).

import { sql, acqSql, liSql } from "../db.ts";

type Product = "acq_coach" | "lead_intel";

interface Cust {
  id: string;
  name: string;
  ghl_location_id: string | null;
  ghl_company_id: string | null;
  acq_account_id: string | null;
  leadintel_tenant_id: string | null;
  is_test: boolean;
  demo_mode: boolean;
  trial_active: boolean;
  trial_expires_at: string | null;
}

export async function ensureAppCustomerRow(
  customerId: string,
  product: Product,
): Promise<{ ok: boolean; created?: boolean; existed?: boolean; app_id?: string; error?: string }> {
  const rows = await sql<Cust[]>`
    SELECT id, name, ghl_location_id, ghl_company_id,
           acq_account_id, leadintel_tenant_id,
           is_test, demo_mode, trial_active, trial_expires_at
    FROM platform.customers WHERE id = ${customerId}::uuid
  `;
  if (rows.length === 0) return { ok: false, error: "customer not found" };
  const c = rows[0];

  if (product === "acq_coach") {
    if (c.acq_account_id) return { ok: true, existed: true, app_id: c.acq_account_id };
    if (!acqSql) return { ok: false, error: "acq bridge unavailable" };

    try {
      // ACQ ghl_accounts has NOT NULL on api_key + location_id. We seed both
      // with placeholders so the row is creatable BEFORE the admin sets a
      // real PIT token. The bridge-write in setGhlCredentials populates
      // api_key when the token is set.
      const inserted = await acqSql<{ id: string }[]>`
        INSERT INTO public.ghl_accounts (
          name, api_key, location_id, company_id, is_active, is_test, demo_mode
        ) VALUES (
          ${c.name},
          ${"PENDING_TOKEN_SETUP"},
          ${c.ghl_location_id ?? "PENDING"},
          ${c.ghl_company_id ?? ""},
          true,
          ${c.is_test},
          ${c.demo_mode}
        )
        RETURNING id
      `;
      const appId = inserted[0].id;
      await sql`UPDATE platform.customers SET acq_account_id = ${appId}::uuid WHERE id = ${customerId}::uuid`;
      return { ok: true, created: true, app_id: appId };
    } catch (e) {
      return { ok: false, error: `acq insert failed: ${(e as Error).message}` };
    }
  }

  if (product === "lead_intel") {
    if (c.leadintel_tenant_id) return { ok: true, existed: true, app_id: c.leadintel_tenant_id };
    if (!liSql) return { ok: false, error: "leadintel bridge unavailable" };

    try {
      // billing_mode check constraint accepts only 'closer_control' | 'tenant'.
      const inserted = await liSql<{ id: string }[]>`
        INSERT INTO public.tenants (
          name, ghl_location_id, status, plan_type, billing_mode,
          trial_active, trial_expires_at
        ) VALUES (
          ${c.name},
          ${c.ghl_location_id},
          ${"active"},
          ${"standard"},
          ${"tenant"},
          ${c.trial_active},
          ${c.trial_expires_at}::timestamptz
        )
        RETURNING id
      `;
      const appId = inserted[0].id;
      await sql`UPDATE platform.customers SET leadintel_tenant_id = ${appId}::uuid WHERE id = ${customerId}::uuid`;
      return { ok: true, created: true, app_id: appId };
    } catch (e) {
      return { ok: false, error: `leadintel insert failed: ${(e as Error).message}` };
    }
  }

  return { ok: false, error: "unknown product" };
}
