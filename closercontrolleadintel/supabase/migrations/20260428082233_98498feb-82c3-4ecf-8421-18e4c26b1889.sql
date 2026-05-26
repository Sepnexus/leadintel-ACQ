-- =========================================================
-- audit_log: immutable record of sensitive admin events
-- =========================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_audit_actor on public.audit_log (actor_user_id, occurred_at desc);
create index idx_audit_target on public.audit_log (target_type, target_id, occurred_at desc);
create index idx_audit_recent on public.audit_log (occurred_at desc);

alter table public.audit_log enable row level security;

-- Only super admins can SELECT
create policy "audit_log_select_super_admin"
on public.audit_log
for select
to authenticated
using (is_super_admin());

-- No INSERT/UPDATE/DELETE policies => denied for `authenticated` role.
-- Belt-and-braces: explicitly revoke write privileges from authenticated.
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.audit_log from anon;

-- =========================================================
-- sync_history: historical sync runs
-- =========================================================
create table public.sync_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource text not null,
  mode text not null,
  triggered_by_user_id uuid references public.users(id) on delete set null,
  triggered_by_email text,
  trigger_source text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  stats jsonb,
  error_message text,
  duration_ms integer
);

create index idx_sync_history_tenant on public.sync_history (tenant_id, started_at desc);
create index idx_sync_history_status on public.sync_history (status, started_at desc)
  where status in ('running', 'failed');

alter table public.sync_history enable row level security;

-- Super admin sees all; tenant_user sees only their tenant's rows.
create policy "sync_history_select_scoped"
on public.sync_history
for select
to authenticated
using (is_super_admin() or tenant_id = get_user_tenant_id());

-- No write policies => only service_role can mutate.
revoke insert, update, delete on public.sync_history from authenticated;
revoke insert, update, delete on public.sync_history from anon;

-- =========================================================
-- admin_tenants_overview: list view for the admin tenants page
-- Returns all tenants regardless of status, plus last successful sync
-- timestamp and current contact count. Self-gates to super admins.
-- =========================================================
create or replace function public.admin_tenants_overview()
returns table (
  id uuid,
  name text,
  status text,
  plan_type text,
  ghl_location_id text,
  created_at timestamptz,
  updated_at timestamptz,
  last_sync_at timestamptz,
  contact_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'super_admin required';
  end if;

  return query
  select
    t.id,
    t.name,
    t.status,
    t.plan_type,
    t.ghl_location_id,
    t.created_at,
    t.updated_at,
    (
      select max(sh.completed_at)
      from public.sync_history sh
      where sh.tenant_id = t.id and sh.status = 'success'
    ) as last_sync_at,
    (
      select count(*)::bigint
      from public.ghl_contacts c
      where c.tenant_id = t.id
    ) as contact_count
  from public.tenants t
  order by t.name asc;
end;
$$;

revoke all on function public.admin_tenants_overview() from public;
grant execute on function public.admin_tenants_overview() to authenticated;