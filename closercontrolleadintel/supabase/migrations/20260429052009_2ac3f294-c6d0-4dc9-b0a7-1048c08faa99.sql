-- Phase 5: User Invitations
create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  token_hash text not null,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial unique index: blocks duplicate active pending invites
create unique index idx_user_invitations_pending
  on public.user_invitations (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Token lookup
create index idx_user_invitations_token_hash on public.user_invitations (token_hash);
create index idx_user_invitations_tenant on public.user_invitations (tenant_id);

-- RLS
alter table public.user_invitations enable row level security;
alter table public.user_invitations force row level security;

create policy "user_invitations_select_admin"
  on public.user_invitations for select
  to authenticated
  using (is_super_admin());

create policy "user_invitations_insert_admin"
  on public.user_invitations for insert
  to authenticated
  with check (is_super_admin());

create policy "user_invitations_update_admin"
  on public.user_invitations for update
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

create policy "user_invitations_delete_admin"
  on public.user_invitations for delete
  to authenticated
  using (is_super_admin());