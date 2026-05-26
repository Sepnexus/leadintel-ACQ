-- ───────── Wallets ─────────
CREATE TABLE public.wallets (
  account_id uuid PRIMARY KEY REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  balance_cents integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own wallet" ON public.wallets FOR SELECT
  USING (is_account_admin(auth.uid(), account_id));

-- ───────── Wallet transactions ─────────
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit','debit','refund','adjustment')),
  amount_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  stripe_session_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_tx_account ON public.wallet_transactions(account_id, created_at DESC);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own transactions" ON public.wallet_transactions FOR SELECT
  USING (is_account_admin(auth.uid(), account_id));

-- ───────── Billing settings ─────────
CREATE TABLE public.billing_settings (
  account_id uuid PRIMARY KEY REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  auto_recharge_enabled boolean NOT NULL DEFAULT false,
  threshold_cents integer NOT NULL DEFAULT 500,    -- $5
  topup_amount_cents integer NOT NULL DEFAULT 2000, -- $20
  stripe_customer_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own billing" ON public.billing_settings FOR SELECT
  USING (is_account_admin(auth.uid(), account_id));
CREATE POLICY "update own billing" ON public.billing_settings FOR UPDATE
  USING (is_account_admin(auth.uid(), account_id))
  WITH CHECK (is_account_admin(auth.uid(), account_id));
CREATE POLICY "insert own billing" ON public.billing_settings FOR INSERT
  WITH CHECK (is_account_admin(auth.uid(), account_id));

-- ───────── Atomic debit/credit RPCs ─────────
CREATE OR REPLACE FUNCTION public.debit_wallet(
  _account_id uuid,
  _amount_cents integer,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  -- ensure wallet exists
  INSERT INTO public.wallets(account_id) VALUES (_account_id)
    ON CONFLICT (account_id) DO NOTHING;
  -- lock and check
  UPDATE public.wallets SET balance_cents = balance_cents - _amount_cents,
    updated_at = now()
    WHERE account_id = _account_id AND balance_cents >= _amount_cents
    RETURNING balance_cents INTO _new_balance;
  IF _new_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds');
  END IF;
  INSERT INTO public.wallet_transactions(account_id, type, amount_cents, balance_after_cents, reason, metadata)
    VALUES (_account_id, 'debit', _amount_cents, _new_balance, _reason, _metadata);
  RETURN jsonb_build_object('ok', true, 'balance_cents', _new_balance);
END $$;

CREATE OR REPLACE FUNCTION public.credit_wallet(
  _account_id uuid,
  _amount_cents integer,
  _reason text,
  _stripe_session_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _type text DEFAULT 'credit'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _amount_cents = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  -- de-duplicate Stripe sessions
  IF _stripe_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.wallet_transactions WHERE stripe_session_id = _stripe_session_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  INSERT INTO public.wallets(account_id, balance_cents) VALUES (_account_id, _amount_cents)
    ON CONFLICT (account_id) DO UPDATE SET balance_cents = wallets.balance_cents + EXCLUDED.balance_cents,
      updated_at = now()
    RETURNING balance_cents INTO _new_balance;
  INSERT INTO public.wallet_transactions(account_id, type, amount_cents, balance_after_cents, reason, stripe_session_id, metadata)
    VALUES (_account_id, _type, _amount_cents, _new_balance, _reason, _stripe_session_id, _metadata);
  RETURN jsonb_build_object('ok', true, 'balance_cents', _new_balance);
END $$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.debit_wallet(uuid, integer, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_wallet(uuid, integer, text, text, jsonb, text) TO service_role;