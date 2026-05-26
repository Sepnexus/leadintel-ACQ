-- ============================================================
-- Phase 7: Wallet billing for AI usage
-- ============================================================

-- 1. billing_mode on tenants
alter table public.tenants
  add column billing_mode text not null default 'closer_control'
  check (billing_mode in ('closer_control', 'tenant'));

-- 2. wallets
create table public.wallets (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. wallet_transactions (append-only ledger)
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('credit', 'debit', 'refund', 'adjustment')),
  amount_cents integer not null,
  balance_after_cents integer not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_wallet_tx_tenant_created
  on public.wallet_transactions(tenant_id, created_at desc);

-- 4. billing_settings
create table public.billing_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  stripe_customer_id text,
  default_payment_method_id text,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  auto_recharge_enabled boolean not null default false,
  threshold_cents integer not null default 500,
  topup_amount_cents integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. usage_events (per AI call)
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  operation text not null,
  provider text not null,
  model text,
  cost_cents integer not null,
  charged_cents integer not null,
  billing_mode text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_usage_tenant_created
  on public.usage_events(tenant_id, created_at desc);

-- ============================================================
-- Auto-create wallet when a tenant is inserted
-- ============================================================
create or replace function public.create_wallet_for_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (tenant_id, balance_cents)
    values (NEW.id, 0)
    on conflict (tenant_id) do nothing;
  return NEW;
end;
$$;

create trigger trg_tenants_create_wallet
  after insert on public.tenants
  for each row
  execute function public.create_wallet_for_new_tenant();

-- Backfill wallets for existing tenants
insert into public.wallets (tenant_id, balance_cents)
  select id, 0 from public.tenants
  on conflict (tenant_id) do nothing;

-- ============================================================
-- RLS
-- Note: NOT using FORCE on wallets/wallet_transactions so that
-- SECURITY DEFINER RPCs (running as owner) can mutate them.
-- service_role bypasses RLS regardless.
-- ============================================================
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.billing_settings enable row level security;
alter table public.billing_settings force row level security;
alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;

-- wallets: tenant_user reads own, super_admin reads all. No client writes.
create policy wallets_select on public.wallets
  for select to authenticated
  using (is_super_admin() or tenant_id = get_user_tenant_id());

-- wallet_transactions: read-only for tenant_user / super_admin
create policy wallet_tx_select on public.wallet_transactions
  for select to authenticated
  using (is_super_admin() or tenant_id = get_user_tenant_id());

-- billing_settings: read-only for tenant_user / super_admin
create policy billing_settings_select on public.billing_settings
  for select to authenticated
  using (is_super_admin() or tenant_id = get_user_tenant_id());

-- usage_events: read-only for tenant_user / super_admin
create policy usage_events_select on public.usage_events
  for select to authenticated
  using (is_super_admin() or tenant_id = get_user_tenant_id());

-- ============================================================
-- credit_wallet RPC
-- ============================================================
create or replace function public.credit_wallet(
  p_tenant_id uuid,
  p_amount_cents integer,
  p_type text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  if p_amount_cents <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_type not in ('credit', 'refund', 'adjustment') then
    raise exception 'invalid type for credit_wallet: %', p_type;
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
    values (p_tenant_id, p_type, p_amount_cents, v_new_balance, p_description, coalesce(p_metadata, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'balance_cents', v_new_balance);
end;
$$;

-- ============================================================
-- debit_wallet RPC
-- Respects billing_mode: closer_control => no debit, just signal.
-- ============================================================
create or replace function public.debit_wallet(
  p_tenant_id uuid,
  p_amount_cents integer,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_balance integer;
  v_new_balance integer;
begin
  if p_amount_cents <= 0 then
    raise exception 'amount must be positive';
  end if;

  select billing_mode into v_mode from public.tenants where id = p_tenant_id;
  if v_mode is null then
    return jsonb_build_object('ok', false, 'error', 'tenant_not_found');
  end if;

  if v_mode = 'closer_control' then
    return jsonb_build_object('ok', true, 'mode', 'closer_control', 'debited', false);
  end if;

  -- Tenant mode: lock wallet row, check, debit
  select balance_cents into v_balance
    from public.wallets
    where tenant_id = p_tenant_id
    for update;

  if v_balance is null or v_balance < p_amount_cents then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'balance_cents', coalesce(v_balance, 0)
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

  return jsonb_build_object('ok', true, 'mode', 'tenant', 'debited', true, 'balance_cents', v_new_balance);
end;
$$;

grant execute on function public.credit_wallet(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.debit_wallet(uuid, integer, text, jsonb) to service_role;

-- Revoke from authenticated as defense-in-depth (service_role bypasses anyway)
revoke execute on function public.credit_wallet(uuid, integer, text, text, jsonb) from public, authenticated;
revoke execute on function public.debit_wallet(uuid, integer, text, jsonb) from public, authenticated;

-- updated_at triggers
create trigger trg_wallets_updated_at
  before update on public.wallets
  for each row execute function public.update_updated_at_column();

create trigger trg_billing_settings_updated_at
  before update on public.billing_settings
  for each row execute function public.update_updated_at_column();