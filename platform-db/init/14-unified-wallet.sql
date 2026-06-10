-- Unified wallet — single shared ledger for ACQ Coach + Lead Intel.
--
-- Before this, each app had its OWN wallet (acq.wallets keyed by account_id,
-- li.wallets keyed by tenant_id) that it charged independently. The launcher
-- showed the SUM as a "unified balance," but a top-up to one app could not be
-- spent by the other — and the per-app "balance too low" gate blocked an app
-- whose local wallet was empty even when the customer had funds in the other.
--
-- Now platform.customer_wallet is the SINGLE source of truth. Each app's
-- local debit_wallet()/credit_wallet() RPCs are redefined (in the app DBs,
-- via postgres_fdw → here) to adjust THIS row and mirror the result back into
-- the app-local wallets table for display. No app or frontend code changes.
--
-- This file just opens the platform side: the app role (platform_app, which
-- the apps' fdw user-mapping authenticates as) needs to read the customer
-- mapping and write the wallet + ledger.

-- Write access for the app role (was SELECT-only).
GRANT INSERT, UPDATE ON platform.customer_wallet     TO platform_app;
GRANT INSERT         ON platform.wallet_transactions  TO platform_app;
GRANT SELECT         ON platform.customers            TO platform_app;

-- Atomic adjust: the single mutator both apps drive through fdw. Positive
-- delta = credit, negative = debit. A debit that would overdraw returns
-- ok=false WITHOUT changing the balance. Returns the new balance + ok flag
-- as JSON so the apps' RPCs can shape their own legacy return values.
--
-- SECURITY INVOKER (default) is fine: platform_app holds the grants above and
-- the function is only reachable from the apps' fdw mapping, never PUBLIC.
CREATE OR REPLACE FUNCTION platform.adjust_wallet(
  p_customer_id  uuid,
  p_delta_cents  integer,
  p_type         text,            -- 'credit' | 'debit' | 'refund' | 'adjustment'
  p_reason       text,
  p_product      text,            -- 'acq_coach' | 'lead_intel'
  p_metadata     jsonb DEFAULT '{}'::jsonb,
  p_stripe_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance integer;
  v_new     integer;
BEGIN
  -- Lock the wallet row (create at 0 if absent) so concurrent debits from
  -- both apps serialize correctly.
  INSERT INTO platform.customer_wallet (customer_id, balance_cents)
  VALUES (p_customer_id, 0)
  ON CONFLICT (customer_id) DO NOTHING;

  SELECT balance_cents INTO v_balance
  FROM platform.customer_wallet
  WHERE customer_id = p_customer_id
  FOR UPDATE;

  v_new := v_balance + p_delta_cents;
  IF v_new < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'balance_cents', v_balance);
  END IF;

  UPDATE platform.customer_wallet
  SET balance_cents = v_new, refreshed_at = now()
  WHERE customer_id = p_customer_id;

  -- Dedupe Stripe replays via the UNIQUE stripe_session_id.
  INSERT INTO platform.wallet_transactions
    (customer_id, product, type, amount_cents, balance_after_cents, reason, stripe_session_id, metadata)
  VALUES
    (p_customer_id, p_product::platform.product, p_type, abs(p_delta_cents), v_new, p_reason, p_stripe_session_id, p_metadata)
  ON CONFLICT (stripe_session_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'balance_cents', v_new);
END;
$$;

REVOKE ALL ON FUNCTION platform.adjust_wallet(uuid, integer, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.adjust_wallet(uuid, integer, text, text, text, jsonb, text) TO platform_app, platform_admin;
