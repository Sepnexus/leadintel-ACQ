-- Phase A2 — Per-customer product entitlement.
-- Same shape as user_product_access but for customer orgs.
-- This is the toggle Deon flips when SHC Homes signs up for Lead Intel.

CREATE TABLE IF NOT EXISTS platform.customer_product_access (
  customer_id  uuid NOT NULL REFERENCES platform.customers(id) ON DELETE CASCADE,
  product      platform.product NOT NULL,
  enabled      boolean NOT NULL DEFAULT false,
  valid_until  timestamptz,                          -- null = no expiry
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES platform.users(id),
  PRIMARY KEY (customer_id, product)
);

CREATE INDEX IF NOT EXISTS idx_cpa_product_enabled
  ON platform.customer_product_access (product) WHERE enabled = true;

DROP TRIGGER IF EXISTS trg_cpa_updated_at ON platform.customer_product_access;
CREATE TRIGGER trg_cpa_updated_at BEFORE UPDATE ON platform.customer_product_access
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ── Customer-level access check ──
CREATE OR REPLACE FUNCTION platform.customer_has_access(p_customer_id uuid, p_product platform.product)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (
      SELECT enabled AND (valid_until IS NULL OR valid_until > now())
      FROM platform.customer_product_access
      WHERE customer_id = p_customer_id AND product = p_product
    ),
    false
  );
$$;

-- Helpers starting from per-app customer ids (used by edge fns that hold the
-- per-product customer id like account_id or tenant_id from their own DB).
CREATE OR REPLACE FUNCTION platform.acq_account_has_access(p_acq_account_id uuid, p_product platform.product)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT platform.customer_has_access(platform.customer_id_for_acq_account(p_acq_account_id), p_product);
$$;

CREATE OR REPLACE FUNCTION platform.leadintel_tenant_has_access(p_leadintel_tenant_id uuid, p_product platform.product)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT platform.customer_has_access(platform.customer_id_for_leadintel_tenant(p_leadintel_tenant_id), p_product);
$$;

-- Combined: a charging edge fn must check BOTH user-level AND customer-level
-- entitlements. This convenience returns true only if both pass.
CREATE OR REPLACE FUNCTION platform.fully_authorized(
  p_user_id uuid, p_customer_id uuid, p_product platform.product
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT platform.user_has_access(p_user_id, p_product)
     AND platform.customer_has_access(p_customer_id, p_product);
$$;

-- ── Grants ──
GRANT SELECT                         ON platform.customer_product_access  TO platform_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.customer_product_access  TO platform_admin;
GRANT EXECUTE ON FUNCTION platform.customer_has_access(uuid, platform.product)             TO platform_app, platform_admin;
GRANT EXECUTE ON FUNCTION platform.acq_account_has_access(uuid, platform.product)          TO platform_app, platform_admin;
GRANT EXECUTE ON FUNCTION platform.leadintel_tenant_has_access(uuid, platform.product)     TO platform_app, platform_admin;
GRANT EXECUTE ON FUNCTION platform.fully_authorized(uuid, uuid, platform.product)          TO platform_app, platform_admin;

-- ── Backfill ──
-- Every existing customer that has an acq_account_id gets acq_coach enabled.
-- Every customer with a leadintel_tenant_id gets lead_intel enabled.
-- This reproduces the implicit "you're already paying for it" state.
INSERT INTO platform.customer_product_access (customer_id, product, enabled)
SELECT id, 'acq_coach'::platform.product, true
FROM platform.customers WHERE acq_account_id IS NOT NULL
ON CONFLICT (customer_id, product) DO NOTHING;

INSERT INTO platform.customer_product_access (customer_id, product, enabled)
SELECT id, 'lead_intel'::platform.product, true
FROM platform.customers WHERE leadintel_tenant_id IS NOT NULL
ON CONFLICT (customer_id, product) DO NOTHING;

INSERT INTO platform.audit_log (actor_user_id, action, metadata)
VALUES (
  NULL, 'backfill_customer_product_access',
  jsonb_build_object(
    'acq_grants',  (SELECT count(*) FROM platform.customer_product_access WHERE product='acq_coach'  AND enabled),
    'li_grants',   (SELECT count(*) FROM platform.customer_product_access WHERE product='lead_intel' AND enabled),
    'run_at',      to_jsonb(now())
  )
);
