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

import { sql, acqSql, liSql, TOKEN_KEY } from "../db.ts";

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
  has_token: boolean;
}

// If a token was set on platform BEFORE the app row existed, decrypt it now
// so the new ACQ ghl_accounts.api_key / LI tenants.ghl_pit_token can be
// seeded with the real value instead of the placeholder. Returns null if
// no token, decryption unavailable, or any error (we fall back to
// placeholder + the user can re-set the token via the admin UI).
async function decryptPlatformToken(customerId: string): Promise<string | null> {
  if (!TOKEN_KEY) return null;
  try {
    const rows = await sql<{ token: string | null }[]>`
      SELECT platform.get_ghl_pit_token(${customerId}::uuid, ${TOKEN_KEY}) AS token
    `;
    const t = rows[0]?.token;
    return t && t.length > 0 ? t : null;
  } catch (e) {
    console.warn("[ensureAppCustomerRow] token decrypt failed:", (e as Error).message);
    return null;
  }
}

// Look for an app row that already covers this GHL location and, if there is
// one, write the back-pointer to it. Returns null when there's nothing to adopt
// (no location known, or no match) so the caller falls through to creating one.
//
// "PENDING" is the placeholder ACQ rows carry before credentials are set; it is
// not a real location and must never match.
async function adoptByLocation(
  customerId: string,
  product: Product,
  location: string | null,
): Promise<{ ok: true; existed: true; app_id: string; adopted: true } | null> {
  if (!location || location === "PENDING") return null;
  try {
    const db = product === "acq_coach" ? acqSql : liSql;
    if (!db) return null;
    const found = product === "acq_coach"
      ? await db<{ id: string }[]>`SELECT id FROM public.ghl_accounts WHERE location_id = ${location} LIMIT 1`
      : await db<{ id: string }[]>`SELECT id FROM public.tenants      WHERE ghl_location_id = ${location} LIMIT 1`;
    if (found.length === 0) return null;
    const appId = found[0].id;
    if (product === "acq_coach") {
      await sql`UPDATE platform.customers SET acq_account_id = ${appId}::uuid WHERE id = ${customerId}::uuid`;
    } else {
      await sql`UPDATE platform.customers SET leadintel_tenant_id = ${appId}::uuid WHERE id = ${customerId}::uuid`;
    }
    console.log(`[ensureAppCustomerRow] adopted existing ${product} row ${appId} for location ${location}`);
    return { ok: true, existed: true, app_id: appId, adopted: true };
  } catch (e) {
    console.warn("[ensureAppCustomerRow] adopt lookup failed:", (e as Error).message);
    return null; // fall through to insert; a duplicate-key error is louder than a silent skip
  }
}

export async function ensureAppCustomerRow(
  customerId: string,
  product: Product,
): Promise<{ ok: boolean; created?: boolean; existed?: boolean; app_id?: string; error?: string }> {
  const rows = await sql<Cust[]>`
    SELECT id, name, ghl_location_id, ghl_company_id,
           acq_account_id, leadintel_tenant_id,
           is_test, demo_mode, trial_active, trial_expires_at,
           (ghl_pit_token_encrypted IS NOT NULL) AS has_token
    FROM platform.customers WHERE id = ${customerId}::uuid
  `;
  if (rows.length === 0) return { ok: false, error: "customer not found" };
  const c = rows[0];

  // Seed token: if the token was set on platform BEFORE the app row existed,
  // we pull and decrypt it once here so the new app row gets the real token
  // instead of a placeholder. Falls back to placeholder/null on any failure.
  const seedToken = c.has_token ? await decryptPlatformToken(customerId) : null;

  if (product === "acq_coach") {
    if (c.acq_account_id) return { ok: true, existed: true, app_id: c.acq_account_id };
    if (!acqSql) return { ok: false, error: "acq bridge unavailable" };

    // The app row may already exist for this GHL location — created by the app's
    // own onboarding, or by an earlier link that never wrote the back-pointer.
    // Adopt it instead of inserting a second one. ghl_accounts has no unique
    // index on location_id, so a blind insert here silently duplicates the
    // account rather than failing loudly.
    const adopted = await adoptByLocation(customerId, "acq_coach", c.ghl_location_id);
    if (adopted) return adopted;

    try {
      // ACQ ghl_accounts has NOT NULL on api_key + location_id. We seed both
      // with the real token + location if known, else placeholders so the
      // row is creatable BEFORE the admin sets credentials. The bridge-write
      // in setGhlCredentials updates the row if it pre-exists.
      const inserted = await acqSql<{ id: string }[]>`
        INSERT INTO public.ghl_accounts (
          name, api_key, location_id, company_id, is_active, is_test, demo_mode
        ) VALUES (
          ${c.name},
          ${seedToken ?? "PENDING_TOKEN_SETUP"},
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

    // Adopt an existing tenant for this location rather than inserting a second
    // one. tenants.ghl_location_id is UNIQUE, so the blind insert below fails
    // with a duplicate-key error whenever the tenant already exists — which left
    // leadintel_tenant_id NULL and made ensureProvisioned() skip every user of
    // that customer as "ACQ-only", with no visible error anywhere.
    const adopted = await adoptByLocation(customerId, "lead_intel", c.ghl_location_id);
    if (adopted) return adopted;

    try {
      // billing_mode check constraint accepts only 'closer_control' | 'tenant'.
      // Seed ghl_pit_token with the real token if one already exists on
      // platform side — otherwise leave NULL and the admin's token-set flow
      // will fill it via setGhlCredentials' bridge-write.
      const inserted = await liSql<{ id: string }[]>`
        INSERT INTO public.tenants (
          name, ghl_location_id, ghl_pit_token, status, plan_type, billing_mode,
          trial_active, trial_expires_at
        ) VALUES (
          ${c.name},
          ${c.ghl_location_id},
          ${seedToken},
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
