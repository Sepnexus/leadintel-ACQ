-- Unified wallet for ACQ — redefine debit_wallet/credit_wallet to operate on
-- the SHARED platform ledger (platform.customer_wallet) via postgres_fdw,
-- mirroring the result into the local public.wallets for the app's own UI.
--
-- Requires scripts/setup-wallet-fdw.sh to have run (creates platform_fdw.*).
-- Same return shapes as before, so every existing call site is unchanged.
-- If the account isn't linked to a platform customer (edge case), falls back
-- to the original local-only behaviour.

CREATE OR REPLACE FUNCTION public.debit_wallet(_account_id uuid, _amount_cents integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _customer uuid;
  _new_balance integer;
BEGIN
  IF _amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT id INTO _customer FROM platform_fdw.customers WHERE acq_account_id = _account_id;

  IF _customer IS NULL THEN
    -- Unlinked account: original local-only behaviour.
    INSERT INTO public.wallets(account_id) VALUES (_account_id) ON CONFLICT (account_id) DO NOTHING;
    UPDATE public.wallets SET balance_cents = balance_cents - _amount_cents, updated_at = now()
      WHERE account_id = _account_id AND balance_cents >= _amount_cents
      RETURNING balance_cents INTO _new_balance;
    IF _new_balance IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds'); END IF;
    INSERT INTO public.wallet_transactions(account_id, type, amount_cents, balance_after_cents, reason, metadata)
      VALUES (_account_id, 'debit', _amount_cents, _new_balance, _reason, _metadata);
    RETURN jsonb_build_object('ok', true, 'balance_cents', _new_balance);
  END IF;

  -- Shared ledger: conditional UPDATE is race-safe (re-checks balance).
  UPDATE platform_fdw.customer_wallet SET balance_cents = balance_cents - _amount_cents, refreshed_at = now()
    WHERE customer_id = _customer AND balance_cents >= _amount_cents
    RETURNING balance_cents INTO _new_balance;
  IF _new_balance IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds'); END IF;

  -- Platform-level ledger (launcher billing history) + local mirror.
  INSERT INTO platform_fdw.wallet_transactions(customer_id, product, type, amount_cents, balance_after_cents, reason, metadata)
    VALUES (_customer, 'acq_coach', 'debit', _amount_cents, _new_balance, _reason, _metadata);
  INSERT INTO public.wallets(account_id, balance_cents) VALUES (_account_id, _new_balance)
    ON CONFLICT (account_id) DO UPDATE SET balance_cents = EXCLUDED.balance_cents, updated_at = now();
  INSERT INTO public.wallet_transactions(account_id, type, amount_cents, balance_after_cents, reason, metadata)
    VALUES (_account_id, 'debit', _amount_cents, _new_balance, _reason, _metadata);
  RETURN jsonb_build_object('ok', true, 'balance_cents', _new_balance);
END $function$;

CREATE OR REPLACE FUNCTION public.credit_wallet(_account_id uuid, _amount_cents integer, _reason text, _stripe_session_id text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb, _type text DEFAULT 'credit'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _customer uuid;
  _new_balance integer;
BEGIN
  IF _amount_cents = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount'); END IF;

  -- Dedup Stripe replays (local ledger is the dedupe surface).
  IF _stripe_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.wallet_transactions WHERE stripe_session_id = _stripe_session_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT id INTO _customer FROM platform_fdw.customers WHERE acq_account_id = _account_id;

  IF _customer IS NULL THEN
    INSERT INTO public.wallets(account_id, balance_cents) VALUES (_account_id, _amount_cents)
      ON CONFLICT (account_id) DO UPDATE SET balance_cents = wallets.balance_cents + EXCLUDED.balance_cents, updated_at = now()
      RETURNING balance_cents INTO _new_balance;
    INSERT INTO public.wallet_transactions(account_id, type, amount_cents, balance_after_cents, reason, stripe_session_id, metadata)
      VALUES (_account_id, _type, _amount_cents, _new_balance, _reason, _stripe_session_id, _metadata);
    RETURN jsonb_build_object('ok', true, 'balance_cents', _new_balance);
  END IF;

  -- Shared ledger credit. Foreign tables don't support ON CONFLICT, so
  -- UPDATE-first then INSERT only if the row was absent.
  UPDATE platform_fdw.customer_wallet SET balance_cents = balance_cents + _amount_cents, refreshed_at = now()
    WHERE customer_id = _customer
    RETURNING balance_cents INTO _new_balance;
  IF _new_balance IS NULL THEN
    INSERT INTO platform_fdw.customer_wallet (customer_id, balance_cents, refreshed_at)
      VALUES (_customer, _amount_cents, now());
    _new_balance := _amount_cents;
  END IF;

  -- Platform-level ledger (dedupes Stripe replays via UNIQUE stripe_session_id)
  -- + local mirror.
  INSERT INTO platform_fdw.wallet_transactions(customer_id, product, type, amount_cents, balance_after_cents, reason, stripe_session_id, metadata)
    VALUES (_customer, 'acq_coach', _type, _amount_cents, _new_balance, _reason, _stripe_session_id, _metadata);
  INSERT INTO public.wallets(account_id, balance_cents) VALUES (_account_id, _new_balance)
    ON CONFLICT (account_id) DO UPDATE SET balance_cents = EXCLUDED.balance_cents, updated_at = now();
  INSERT INTO public.wallet_transactions(account_id, type, amount_cents, balance_after_cents, reason, stripe_session_id, metadata)
    VALUES (_account_id, _type, _amount_cents, _new_balance, _reason, _stripe_session_id, _metadata);
  RETURN jsonb_build_object('ok', true, 'balance_cents', _new_balance);
END $function$;
