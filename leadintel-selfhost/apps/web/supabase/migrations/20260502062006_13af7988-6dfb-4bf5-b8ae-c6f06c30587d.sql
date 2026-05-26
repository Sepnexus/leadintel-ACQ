
-- 1. Platform settings (single-row table for global config)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true,
  ai_markup_multiplier numeric(6,3) NOT NULL DEFAULT 2.0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by_user_id uuid,
  CONSTRAINT platform_settings_singleton CHECK (id = true),
  CONSTRAINT platform_settings_markup_positive CHECK (ai_markup_multiplier > 0)
);

INSERT INTO public.platform_settings (id, ai_markup_multiplier)
  VALUES (true, 2.0)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_settings_select_all_auth
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY platform_settings_update_super_admin
  ON public.platform_settings
  FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 2. Helper to read the multiplier from edge functions / RPCs
CREATE OR REPLACE FUNCTION public.get_ai_markup_multiplier()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ai_markup_multiplier FROM public.platform_settings WHERE id = true LIMIT 1;
$$;

-- 3. Flip all tenants to tenant-paid mode
UPDATE public.tenants
  SET billing_mode = 'tenant', updated_at = now()
  WHERE billing_mode <> 'tenant';

-- 4. Replace debit_wallet so it ALWAYS debits (no closer_control short-circuit).
--    The caller is responsible for passing the already-marked-up amount.
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_tenant_id uuid,
  p_amount_cents integer,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_balance integer;
  v_new_balance integer;
  v_tenant_exists boolean;
begin
  if p_amount_cents <= 0 then
    raise exception 'amount must be positive';
  end if;

  select exists(select 1 from public.tenants where id = p_tenant_id) into v_tenant_exists;
  if not v_tenant_exists then
    return jsonb_build_object('ok', false, 'error', 'tenant_not_found');
  end if;

  -- Lock wallet row
  select balance_cents into v_balance
    from public.wallets
    where tenant_id = p_tenant_id
    for update;

  if v_balance is null then
    -- Auto-create empty wallet, then fail insufficient
    insert into public.wallets (tenant_id, balance_cents) values (p_tenant_id, 0)
      on conflict (tenant_id) do nothing;
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_cents', 0);
  end if;

  if v_balance < p_amount_cents then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'balance_cents', v_balance
    );
  end if;

  update public.wallets
    set balance_cents = balance_cents - p_amount_cents,
        updated_at = now()
    where tenant_id = p_tenant_id
    returning balance_cents into v_new_balance;

  insert into public.wallet_transactions
    (tenant_id, type, amount_cents, balance_after_cents, description, metadata)
    values (p_tenant_id, 'debit', p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'debited', true, 'balance_cents', v_new_balance);
end;
$$;

-- 5. Super-admin manual credit (free funds). Audit-logged by caller.
CREATE OR REPLACE FUNCTION public.admin_credit_wallet(
  p_tenant_id uuid,
  p_amount_cents integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_new_balance integer;
begin
  if not is_super_admin() then
    raise exception 'super_admin required';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'reason required (min 3 chars)';
  end if;

  update public.wallets
    set balance_cents = balance_cents + p_amount_cents,
        updated_at = now()
    where tenant_id = p_tenant_id
    returning balance_cents into v_new_balance;

  if not found then
    insert into public.wallets (tenant_id, balance_cents)
      values (p_tenant_id, p_amount_cents)
      returning balance_cents into v_new_balance;
  end if;

  insert into public.wallet_transactions
    (tenant_id, type, amount_cents, balance_after_cents, description, metadata)
    values (
      p_tenant_id,
      'credit',
      p_amount_cents,
      v_new_balance,
      'Admin credit: ' || btrim(p_reason),
      jsonb_build_object('source', 'admin_credit', 'actor_user_id', auth.uid())
    );

  return jsonb_build_object('ok', true, 'balance_cents', v_new_balance);
end;
$$;
