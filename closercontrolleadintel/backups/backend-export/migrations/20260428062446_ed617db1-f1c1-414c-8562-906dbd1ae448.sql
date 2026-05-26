-- =====================================================
-- PHASE 2: Multi-tenant data isolation
-- =====================================================

-- ---------- STEP 1: WIPE EXISTING DATA ----------
do $$
begin
  if to_regclass('public.ghl_messages')      is not null then truncate table public.ghl_messages cascade; end if;
  if to_regclass('public.ghl_tasks')         is not null then truncate table public.ghl_tasks cascade; end if;
  if to_regclass('public.ghl_conversations') is not null then truncate table public.ghl_conversations cascade; end if;
  if to_regclass('public.ghl_opportunities') is not null then truncate table public.ghl_opportunities cascade; end if;
  if to_regclass('public.ghl_contact_tags')  is not null then truncate table public.ghl_contact_tags cascade; end if;
  if to_regclass('public.ghl_contacts')      is not null then truncate table public.ghl_contacts cascade; end if;
  if to_regclass('public.ghl_users')         is not null then truncate table public.ghl_users cascade; end if;
  if to_regclass('public.lead_intelligence') is not null then truncate table public.lead_intelligence cascade; end if;
  if to_regclass('public.day_briefing_cache') is not null then truncate table public.day_briefing_cache cascade; end if;
  if to_regclass('public.sync_state')        is not null then truncate table public.sync_state cascade; end if;
end $$;

-- ---------- STEP 2: ADD tenant_id ----------
alter table public.ghl_contacts       add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.ghl_contact_tags   add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.ghl_opportunities  add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.ghl_conversations  add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.ghl_messages       add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.ghl_tasks          add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.ghl_users          add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.lead_intelligence  add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.day_briefing_cache add column tenant_id uuid not null references public.tenants(id) on delete cascade;
alter table public.sync_state         add column tenant_id uuid not null references public.tenants(id) on delete cascade;

create index idx_ghl_contacts_tenant       on public.ghl_contacts(tenant_id);
create index idx_ghl_contact_tags_tenant   on public.ghl_contact_tags(tenant_id);
create index idx_ghl_opportunities_tenant  on public.ghl_opportunities(tenant_id);
create index idx_ghl_conversations_tenant  on public.ghl_conversations(tenant_id);
create index idx_ghl_messages_tenant       on public.ghl_messages(tenant_id);
create index idx_ghl_tasks_tenant          on public.ghl_tasks(tenant_id);
create index idx_ghl_users_tenant          on public.ghl_users(tenant_id);
create index idx_lead_intelligence_tenant  on public.lead_intelligence(tenant_id);
create index idx_day_briefing_cache_tenant on public.day_briefing_cache(tenant_id);
create index idx_sync_state_tenant         on public.sync_state(tenant_id);

-- ---------- STEP 3: COMPOSITE UNIQUE CONSTRAINTS ----------
alter table public.ghl_contacts       add constraint uq_ghl_contacts_tenant_contact      unique (tenant_id, ghl_contact_id);
alter table public.ghl_opportunities  add constraint uq_ghl_opps_tenant_opp              unique (tenant_id, ghl_opportunity_id);
alter table public.ghl_conversations  add constraint uq_ghl_convs_tenant_conv            unique (tenant_id, ghl_conversation_id);
alter table public.ghl_messages       add constraint uq_ghl_messages_tenant_msg          unique (tenant_id, ghl_message_id);
alter table public.ghl_tasks          add constraint uq_ghl_tasks_tenant_task            unique (tenant_id, ghl_task_id);
alter table public.ghl_users          add constraint uq_ghl_users_tenant_user            unique (tenant_id, ghl_user_id);
alter table public.ghl_contact_tags   add constraint uq_ghl_contact_tags_tenant_ct_tag   unique (tenant_id, ghl_contact_id, tag);
alter table public.sync_state         add constraint uq_sync_state_tenant_resource       unique (tenant_id, resource);
alter table public.lead_intelligence  add constraint uq_lead_intel_tenant_contact        unique (tenant_id, ghl_contact_id);
alter table public.day_briefing_cache add constraint uq_day_briefing_tenant_cache        unique (tenant_id, cache_key);

-- ---------- STEP 4: RLS — drop old open policies, add tenant-scoped ----------
do $$
declare t text;
declare pol record;
begin
  for t in select unnest(array[
    'ghl_contacts','ghl_contact_tags','ghl_opportunities','ghl_conversations',
    'ghl_messages','ghl_tasks','ghl_users','lead_intelligence',
    'day_briefing_cache','sync_state'
  ]) loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($f$
      create policy "tenant_select" on public.%I
        for select to authenticated
        using (is_super_admin() or tenant_id = get_user_tenant_id())
    $f$, t);

    execute format($f$
      create policy "tenant_insert" on public.%I
        for insert to authenticated
        with check (is_super_admin())
    $f$, t);
    execute format($f$
      create policy "tenant_update" on public.%I
        for update to authenticated
        using (is_super_admin()) with check (is_super_admin())
    $f$, t);
    execute format($f$
      create policy "tenant_delete" on public.%I
        for delete to authenticated
        using (is_super_admin())
    $f$, t);

    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;