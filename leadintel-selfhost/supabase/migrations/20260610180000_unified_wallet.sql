-- Unified wallet for Lead Intel — redefine debit_wallet/credit_wallet to drive
-- the SHARED platform ledger (platform.customer_wallet) via postgres_fdw,
-- mirroring into local public.wallets for the app's own UI. Preserves the
-- trial-bypass logic and the exact return shapes the call sites expect.
--
-- Requires scripts/setup-wallet-fdw.sh first. Unlinked tenants fall back to
-- the original local-only behaviour.

CREATE OR REPLACE FUNCTION public.debit_wallet(p_tenant_id uuid, p_amount_cents integer, p_description text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_customer uuid;
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

  -- Trial bypass (unchanged).
  if coalesce(v_trial_active, false) and v_trial_expires is not null and v_trial_expires > now() then
    return jsonb_build_object('ok', true, 'debited', false, 'mode', 'trial');
  end if;
  if coalesce(v_trial_active, false) and (v_trial_expires is null or v_trial_expires <= now()) then
    update public.tenants set trial_active = false, updated_at = now() where id = p_tenant_id;
  end if;

  select id into v_customer from platform_fdw.customers where leadintel_tenant_id = p_tenant_id;

  if v_customer is null then
    -- Unlinked tenant: original local-only behaviour.
    select balance_cents into v_new_balance from public.wallets where tenant_id = p_tenant_id for update;
    if v_new_balance is null then
      insert into public.wallets (tenant_id, balance_cents) values (p_tenant_id, 0) on conflict (tenant_id) do nothing;
      return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_cents', 0);
    end if;
    if v_new_balance < p_amount_cents then
      return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_cents', v_new_balance);
    end if;
    update public.wallets set balance_cents = balance_cents - p_amount_cents, updated_at = now()
      where tenant_id = p_tenant_id returning balance_cents into v_new_balance;
    insert into public.wallet_transactions (tenant_id, type, amount_cents, balance_after_cents, description, metadata)
      values (p_tenant_id, 'debit', p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));
    return jsonb_build_object('ok', true, 'debited', true, 'balance_cents', v_new_balance);
  end if;

  -- Shared ledger: conditional UPDATE is race-safe.
  update platform_fdw.customer_wallet set balance_cents = balance_cents - p_amount_cents, refreshed_at = now()
    where customer_id = v_customer and balance_cents >= p_amount_cents
    returning balance_cents into v_new_balance;
  if v_new_balance is null then
    -- read current shared balance for the error payload
    select balance_cents into v_new_balance from platform_fdw.customer_wallet where customer_id = v_customer;
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_cents', coalesce(v_new_balance, 0));
  end if;

  -- Platform-level ledger (launcher billing history) + local mirror.
  insert into platform_fdw.wallet_transactions (customer_id, product, type, amount_cents, balance_after_cents, reason, metadata)
    values (v_customer, 'lead_intel', 'debit', p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));
  insert into public.wallets (tenant_id, balance_cents) values (p_tenant_id, v_new_balance)
    on conflict (tenant_id) do update set balance_cents = excluded.balance_cents, updated_at = now();
  insert into public.wallet_transactions (tenant_id, type, amount_cents, balance_after_cents, description, metadata)
    values (p_tenant_id, 'debit', p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'debited', true, 'balance_cents', v_new_balance);
end;
$function$;

CREATE OR REPLACE FUNCTION public.credit_wallet(p_tenant_id uuid, p_amount_cents integer, p_type text, p_description text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_customer uuid;
  v_new_balance integer;
begin
  if p_amount_cents <= 0 then raise exception 'amount must be positive'; end if;
  if p_type not in ('credit', 'refund', 'adjustment') then
    raise exception 'invalid type for credit_wallet: %', p_type;
  end if;

  select id into v_customer from platform_fdw.customers where leadintel_tenant_id = p_tenant_id;

  if v_customer is null then
    update public.wallets set balance_cents = balance_cents + p_amount_cents, updated_at = now()
      where tenant_id = p_tenant_id returning balance_cents into v_new_balance;
    if not found then
      insert into public.wallets (tenant_id, balance_cents) values (p_tenant_id, p_amount_cents)
        returning balance_cents into v_new_balance;
    end if;
    insert into public.wallet_transactions (tenant_id, type, amount_cents, balance_after_cents, description, metadata)
      values (p_tenant_id, p_type, p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));
    return jsonb_build_object('ok', true, 'balance_cents', v_new_balance);
  end if;

  -- Shared ledger credit.
  update platform_fdw.customer_wallet set balance_cents = balance_cents + p_amount_cents, refreshed_at = now()
    where customer_id = v_customer returning balance_cents into v_new_balance;
  if v_new_balance is null then
    insert into platform_fdw.customer_wallet (customer_id, balance_cents, refreshed_at)
      values (v_customer, p_amount_cents, now());
    v_new_balance := p_amount_cents;
  end if;

  -- Platform-level ledger + local mirror.
  insert into platform_fdw.wallet_transactions (customer_id, product, type, amount_cents, balance_after_cents, reason, metadata)
    values (v_customer, 'lead_intel', p_type, p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));
  insert into public.wallets (tenant_id, balance_cents) values (p_tenant_id, v_new_balance)
    on conflict (tenant_id) do update set balance_cents = excluded.balance_cents, updated_at = now();
  insert into public.wallet_transactions (tenant_id, type, amount_cents, balance_after_cents, description, metadata)
    values (p_tenant_id, p_type, p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'balance_cents', v_new_balance);
end;
$function$;
