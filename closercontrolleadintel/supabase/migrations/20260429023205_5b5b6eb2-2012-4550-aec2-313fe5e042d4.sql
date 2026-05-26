create table public.tenant_pipelines (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ghl_pipeline_id text not null,
  pipeline_name text not null,
  selected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, ghl_pipeline_id)
);

create index idx_tenant_pipelines_tenant on public.tenant_pipelines(tenant_id);

alter table public.tenant_pipelines enable row level security;
alter table public.tenant_pipelines force row level security;

create policy "tenant_pipelines_select" on public.tenant_pipelines
  for select to authenticated
  using (is_super_admin() or tenant_id = get_user_tenant_id());

create policy "tenant_pipelines_insert" on public.tenant_pipelines
  for insert to authenticated
  with check (is_super_admin() or tenant_id = get_user_tenant_id());

create policy "tenant_pipelines_update" on public.tenant_pipelines
  for update to authenticated
  using (is_super_admin() or tenant_id = get_user_tenant_id())
  with check (is_super_admin() or tenant_id = get_user_tenant_id());

create policy "tenant_pipelines_delete" on public.tenant_pipelines
  for delete to authenticated
  using (is_super_admin() or tenant_id = get_user_tenant_id());

create trigger tenant_pipelines_updated_at
  before update on public.tenant_pipelines
  for each row execute procedure public.update_updated_at_column();