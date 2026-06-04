-- Phase B3 — Single Stripe customer per platform customer.
--
-- Both apps currently have their own billing_settings keyed off their own
-- customer table (ACQ: account_id, LI: tenant_id). This unifies the identity
-- + saved-card columns at the platform layer. Per-product config (e.g. ACQ's
-- markup_multiplier, min_call_seconds_for_ai) stays in the app-specific
-- billing_settings — those are scoring config, not billing identity.

CREATE TABLE IF NOT EXISTS platform.billing_settings (
  customer_id              uuid PRIMARY KEY REFERENCES platform.customers(id) ON DELETE CASCADE,
  -- Stripe customer (unified — replaces the two stripe_customer_id columns in apps)
  stripe_customer_id       text UNIQUE,
  stripe_env               text CHECK (stripe_env IN ('test', 'live')) DEFAULT 'test',
  -- Saved payment method
  default_payment_method_id text,
  card_brand               text,
  card_last4               text,
  card_exp_month           integer,
  card_exp_year            integer,
  -- Auto-recharge settings (shared across products — one threshold/topup per customer)
  auto_recharge_enabled    boolean NOT NULL DEFAULT false,
  threshold_cents          integer NOT NULL DEFAULT 500,
  topup_amount_cents       integer NOT NULL DEFAULT 2000,
  -- Operational
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES platform.users(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_settings_stripe_customer
  ON platform.billing_settings (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_billing_settings_updated_at ON platform.billing_settings;
CREATE TRIGGER trg_billing_settings_updated_at BEFORE UPDATE ON platform.billing_settings
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

GRANT SELECT                         ON platform.billing_settings TO platform_app;
GRANT SELECT, INSERT, UPDATE         ON platform.billing_settings TO platform_admin;
