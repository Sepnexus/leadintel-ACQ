-- Phase A1 — platform.customers: the canonical customer org record.
-- A "customer" here = one sales team / agency that pays Closer Control.
-- A customer has ONE GHL location. They may have ACQ, Lead Intel, both, or
-- (transitionally) neither yet.
--
-- This file is added to /docker-entrypoint-initdb.d/ AFTER the original schema
-- so it runs only on a fresh cluster. To apply to an existing platform-db
-- (which is our case), the backfill script runs it manually via psql.

CREATE TABLE IF NOT EXISTS platform.customers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  ghl_location_id      text UNIQUE,         -- the natural key — one customer == one GHL location
  ghl_company_id       text,                -- often shared across multiple customers (an agency's master ID)
  -- Back-pointers — the per-app row ids for joining. NULL = not (yet) present in that app.
  acq_account_id       uuid UNIQUE,         -- → acqcoach.public.ghl_accounts.id
  leadintel_tenant_id  uuid UNIQUE,         -- → leadintel.public.tenants.id
  -- Operational
  status               text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'disabled')),
  plan                 text NOT NULL DEFAULT 'standard',
  is_test              boolean NOT NULL DEFAULT false,
  demo_mode            boolean NOT NULL DEFAULT false,
  -- Trial (whole-customer-level; per-product trials live in customer_product_access.valid_until)
  trial_active         boolean NOT NULL DEFAULT false,
  trial_started_at     timestamptz,
  trial_expires_at     timestamptz,
  -- Misc
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES platform.users(id)
);

CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON platform.customers (lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_acq        ON platform.customers (acq_account_id)      WHERE acq_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_li         ON platform.customers (leadintel_tenant_id) WHERE leadintel_tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_active     ON platform.customers (status) WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_customers_updated_at ON platform.customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON platform.customers
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ────────────────────────────────────────────────────────────────
-- platform.customer_users — which platform users belong to which customer.
-- Replaces ACQ's per-account user_roles + Lead Intel's tenant_users.
-- Role is per-PRODUCT within the customer because the role concepts differ:
--   ACQ:  super_admin / account_admin / rep
--   LI:   admin / user
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform.customer_users (
  customer_id   uuid NOT NULL REFERENCES platform.customers(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES platform.users(id)     ON DELETE CASCADE,
  product       platform.product NOT NULL,
  role          text NOT NULL,    -- free-form per-product role name
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES platform.users(id),
  PRIMARY KEY (customer_id, user_id, product)
);

CREATE INDEX IF NOT EXISTS idx_cu_user ON platform.customer_users (user_id);

-- ────────────────────────────────────────────────────────────────
-- Helpers: translate per-app IDs → platform.customer_id
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.customer_id_for_acq_account(p_acq_account_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM platform.customers WHERE acq_account_id = p_acq_account_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION platform.customer_id_for_leadintel_tenant(p_leadintel_tenant_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM platform.customers WHERE leadintel_tenant_id = p_leadintel_tenant_id LIMIT 1;
$$;

-- Read-only summary view useful for the admin API
CREATE OR REPLACE VIEW platform.customer_summary AS
SELECT
  c.id,
  c.name,
  c.ghl_location_id,
  c.ghl_company_id,
  c.status,
  c.plan,
  c.is_test,
  c.demo_mode,
  c.trial_active,
  c.trial_expires_at,
  c.acq_account_id IS NOT NULL      AS on_acq,
  c.leadintel_tenant_id IS NOT NULL AS on_leadintel,
  c.created_at,
  c.updated_at,
  -- counts via a lateral join would slow the view; let API do them
  c.notes
FROM platform.customers c;

-- ────────────────────────────────────────────────────────────────
-- Grants (mirror the patterns from 02-grants.sql)
-- ────────────────────────────────────────────────────────────────
GRANT SELECT                         ON platform.customers          TO platform_app;
GRANT SELECT                         ON platform.customer_users     TO platform_app;
GRANT SELECT                         ON platform.customer_summary   TO platform_app, platform_admin;
GRANT EXECUTE ON FUNCTION platform.customer_id_for_acq_account(uuid)        TO platform_app, platform_admin;
GRANT EXECUTE ON FUNCTION platform.customer_id_for_leadintel_tenant(uuid)   TO platform_app, platform_admin;

GRANT SELECT, INSERT, UPDATE         ON platform.customers          TO platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.customer_users     TO platform_admin;
