-- Shared updated_at trigger function
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- TENANTS
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ghl_location_id text unique,
  ghl_pit_token text,
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  plan_type text not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

create trigger tenants_updated_at
before update on public.tenants
for each row execute function public.update_updated_at_column();

-- USERS (profile)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'tenant_user' check (role in ('super_admin', 'tenant_user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create trigger users_updated_at
before update on public.users
for each row execute function public.update_updated_at_column();

-- TENANT_USERS
create table public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.tenant_users enable row level security;

-- Helper functions
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.users where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.get_user_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_users where user_id = auth.uid() limit 1;
$$;

-- Prevent role self-escalation
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'Only super_admins can change user roles';
  end if;
  return new;
end;
$$;

create trigger users_role_guard
before update on public.users
for each row execute function public.prevent_role_self_escalation();

-- Auto-create profile on auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'tenant_user')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS POLICIES

-- users
create policy "users_select_own_or_admin"
on public.users for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

create policy "users_update_own_or_admin"
on public.users for update
to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

create policy "users_insert_admin"
on public.users for insert
to authenticated
with check (public.is_super_admin());

create policy "users_delete_admin"
on public.users for delete
to authenticated
using (public.is_super_admin());

-- tenant_users
create policy "tenant_users_select_own_or_admin"
on public.tenant_users for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "tenant_users_insert_admin"
on public.tenant_users for insert
to authenticated
with check (public.is_super_admin());

create policy "tenant_users_update_admin"
on public.tenant_users for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "tenant_users_delete_admin"
on public.tenant_users for delete
to authenticated
using (public.is_super_admin());

-- tenants
create policy "tenants_select_own_or_admin"
on public.tenants for select
to authenticated
using (public.is_super_admin() or id = public.get_user_tenant_id());

create policy "tenants_insert_admin"
on public.tenants for insert
to authenticated
with check (public.is_super_admin());

create policy "tenants_update_admin"
on public.tenants for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "tenants_delete_admin"
on public.tenants for delete
to authenticated
using (public.is_super_admin());