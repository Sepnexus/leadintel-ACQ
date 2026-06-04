-- Phase C1 (bridge step) — unified wallet at the platform layer.
--
-- For each platform.customer, balance_cents = sum of their per-app wallets.
-- Edge functions still write to the per-app wallets; this table is the
-- single read source the launcher + admin UI use to show "Platform balance".
-- Real cutover (edge fns writing here directly) is a later phase.

CREATE TABLE IF NOT EXISTS platform.customer_wallet (
  customer_id    uuid PRIMARY KEY REFERENCES platform.customers(id) ON DELETE CASCADE,
  balance_cents  integer NOT NULL DEFAULT 0,
  -- Snapshot freshness — bumped by the backfill script or refresh function.
  refreshed_at   timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_balance
  ON platform.customer_wallet (balance_cents);

DROP TRIGGER IF EXISTS trg_customer_wallet_updated_at ON platform.customer_wallet;
CREATE TRIGGER trg_customer_wallet_updated_at BEFORE UPDATE ON platform.customer_wallet
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ─── Wallet transactions (unified ledger; future-proofed for bridge writes) ───
CREATE TABLE IF NOT EXISTS platform.wallet_transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES platform.customers(id) ON DELETE CASCADE,
  product              platform.product NOT NULL,  -- which app spent / received
  type                 text NOT NULL CHECK (type IN ('credit','debit','refund','adjustment')),
  amount_cents         integer NOT NULL,           -- always positive; type tells direction
  balance_after_cents  integer NOT NULL,
  reason               text NOT NULL,
  stripe_session_id    text UNIQUE,                -- dedupe Stripe webhook replays
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by           uuid REFERENCES platform.users(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_customer_recent
  ON platform.wallet_transactions (customer_id, created_at DESC);

-- Grants — apps read only; admin reads + writes via SECURITY DEFINER funcs.
GRANT SELECT ON platform.customer_wallet, platform.wallet_transactions TO platform_app, platform_admin;
GRANT INSERT, UPDATE ON platform.customer_wallet      TO platform_admin;
GRANT INSERT         ON platform.wallet_transactions  TO platform_admin;
