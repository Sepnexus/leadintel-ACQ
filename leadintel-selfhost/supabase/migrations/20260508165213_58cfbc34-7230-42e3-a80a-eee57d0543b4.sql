
-- 1. Trial columns on tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz;

-- 2. Admin: toggle trial
CREATE OR REPLACE FUNCTION public.admin_set_trial(p_tenant_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expires timestamptz;
  v_started timestamptz;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;

  IF p_enabled THEN
    v_started := now();
    v_expires := now() + interval '7 days';
    UPDATE public.tenants
      SET trial_active = true,
          trial_started_at = v_started,
          trial_expires_at = v_expires,
          updated_at = now()
      WHERE id = p_tenant_id;
  ELSE
    UPDATE public.tenants
      SET trial_active = false,
          trial_expires_at = NULL,
          updated_at = now()
      WHERE id = p_tenant_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),
      CASE WHEN p_enabled THEN 'trial_enabled' ELSE 'trial_disabled' END,
      'tenant',
      p_tenant_id,
      jsonb_build_object('expires_at', v_expires)
    );

  RETURN jsonb_build_object(
    'ok', true,
    'trial_active', p_enabled,
    'trial_expires_at', v_expires
  );
END;
$$;

-- 3. Update debit_wallet to bypass on active trial
CREATE OR REPLACE FUNCTION public.debit_wallet(p_tenant_id uuid, p_amount_cents integer, p_description text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_balance integer;
  v_new_balance integer;
  v_tenant_exists boolean;
  v_trial_active boolean;
  v_trial_expires timestamptz;
begin
  if p_amount_cents <= 0 then
    raise exception 'amount must be positive';
  end if;

  select true, trial_active, trial_expires_at
    into v_tenant_exists, v_trial_active, v_trial_expires
    from public.tenants where id = p_tenant_id;

  if not v_tenant_exists then
    return jsonb_build_object('ok', false, 'error', 'tenant_not_found');
  end if;

  -- Trial bypass: if trial active and not expired, do not debit
  if coalesce(v_trial_active, false) and v_trial_expires is not null and v_trial_expires > now() then
    return jsonb_build_object('ok', true, 'debited', false, 'mode', 'trial');
  end if;

  -- Lazy auto-disable expired trial
  if coalesce(v_trial_active, false) and (v_trial_expires is null or v_trial_expires <= now()) then
    update public.tenants set trial_active = false, updated_at = now() where id = p_tenant_id;
  end if;

  select balance_cents into v_balance
    from public.wallets
    where tenant_id = p_tenant_id
    for update;

  if v_balance is null then
    insert into public.wallets (tenant_id, balance_cents) values (p_tenant_id, 0)
      on conflict (tenant_id) do nothing;
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_cents', 0);
  end if;

  if v_balance < p_amount_cents then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_cents', v_balance);
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

-- 4. Admin: set wallet to any balance
CREATE OR REPLACE FUNCTION public.admin_set_wallet_balance(p_tenant_id uuid, p_new_balance_cents integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old integer;
  v_delta integer;
  v_type text;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;
  IF p_new_balance_cents < 0 THEN
    RAISE EXCEPTION 'balance cannot be negative';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required (min 3 chars)';
  END IF;

  SELECT balance_cents INTO v_old FROM public.wallets WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_old IS NULL THEN
    INSERT INTO public.wallets (tenant_id, balance_cents) VALUES (p_tenant_id, p_new_balance_cents);
    v_old := 0;
  ELSE
    UPDATE public.wallets SET balance_cents = p_new_balance_cents, updated_at = now() WHERE tenant_id = p_tenant_id;
  END IF;

  v_delta := p_new_balance_cents - v_old;
  v_type := CASE WHEN v_delta >= 0 THEN 'adjustment' ELSE 'debit' END;

  INSERT INTO public.wallet_transactions
    (tenant_id, type, amount_cents, balance_after_cents, description, metadata)
    VALUES (
      p_tenant_id,
      v_type,
      abs(v_delta),
      p_new_balance_cents,
      'Admin set balance: ' || btrim(p_reason),
      jsonb_build_object('source', 'admin_set_balance', 'actor_user_id', auth.uid(), 'old_balance_cents', v_old, 'new_balance_cents', p_new_balance_cents)
    );

  INSERT INTO public.audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'wallet_set_balance', 'tenant', p_tenant_id,
      jsonb_build_object('old_balance_cents', v_old, 'new_balance_cents', p_new_balance_cents, 'reason', btrim(p_reason)));

  RETURN jsonb_build_object('ok', true, 'balance_cents', p_new_balance_cents, 'old_balance_cents', v_old);
END;
$$;
