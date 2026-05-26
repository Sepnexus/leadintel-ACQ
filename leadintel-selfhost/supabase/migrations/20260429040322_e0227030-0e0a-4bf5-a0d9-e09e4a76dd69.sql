BEGIN;

-- Step A: Drop 3 cross-table FKs that depend on old singular PKs
ALTER TABLE public.ghl_contact_tags  DROP CONSTRAINT ghl_contact_tags_ghl_contact_id_fkey;
ALTER TABLE public.ghl_conversations DROP CONSTRAINT ghl_conversations_ghl_contact_id_fkey;
ALTER TABLE public.ghl_opportunities DROP CONSTRAINT ghl_opportunities_ghl_contact_id_fkey;

-- Step B: Drop 10 old PKs
ALTER TABLE public.ghl_contacts       DROP CONSTRAINT ghl_contacts_pkey;
ALTER TABLE public.ghl_contact_tags   DROP CONSTRAINT ghl_contact_tags_pkey;
ALTER TABLE public.ghl_opportunities  DROP CONSTRAINT ghl_opportunities_pkey;
ALTER TABLE public.ghl_conversations  DROP CONSTRAINT ghl_conversations_pkey;
ALTER TABLE public.ghl_messages       DROP CONSTRAINT ghl_messages_pkey;
ALTER TABLE public.ghl_tasks          DROP CONSTRAINT ghl_tasks_pkey;
ALTER TABLE public.ghl_users          DROP CONSTRAINT ghl_users_pkey;
ALTER TABLE public.lead_intelligence  DROP CONSTRAINT lead_intelligence_pkey;
ALTER TABLE public.day_briefing_cache DROP CONSTRAINT day_briefing_cache_pkey;
ALTER TABLE public.sync_state         DROP CONSTRAINT sync_state_pkey;

-- Step C: Add new composite PKs (ghl_contacts first since FKs reference it)
ALTER TABLE public.ghl_contacts       ADD PRIMARY KEY (tenant_id, ghl_contact_id);
ALTER TABLE public.ghl_contact_tags   ADD PRIMARY KEY (tenant_id, ghl_contact_id, tag);
ALTER TABLE public.ghl_opportunities  ADD PRIMARY KEY (tenant_id, ghl_opportunity_id);
ALTER TABLE public.ghl_conversations  ADD PRIMARY KEY (tenant_id, ghl_conversation_id);
ALTER TABLE public.ghl_messages       ADD PRIMARY KEY (tenant_id, ghl_message_id);
ALTER TABLE public.ghl_tasks          ADD PRIMARY KEY (tenant_id, ghl_task_id);
ALTER TABLE public.ghl_users          ADD PRIMARY KEY (tenant_id, ghl_user_id);
ALTER TABLE public.lead_intelligence  ADD PRIMARY KEY (tenant_id, ghl_contact_id);
ALTER TABLE public.day_briefing_cache ADD PRIMARY KEY (tenant_id, cache_key);
ALTER TABLE public.sync_state         ADD PRIMARY KEY (tenant_id, resource);

-- Step D (was E): Drop 10 redundant uq_* UNIQUE constraints BEFORE adding FKs,
-- so the new FKs bind to the new PK indexes rather than the old unique indexes.
ALTER TABLE public.ghl_contacts       DROP CONSTRAINT uq_ghl_contacts_tenant_contact;
ALTER TABLE public.ghl_contact_tags   DROP CONSTRAINT uq_ghl_contact_tags_tenant_ct_tag;
ALTER TABLE public.ghl_opportunities  DROP CONSTRAINT uq_ghl_opps_tenant_opp;
ALTER TABLE public.ghl_conversations  DROP CONSTRAINT uq_ghl_convs_tenant_conv;
ALTER TABLE public.ghl_messages       DROP CONSTRAINT uq_ghl_messages_tenant_msg;
ALTER TABLE public.ghl_tasks          DROP CONSTRAINT uq_ghl_tasks_tenant_task;
ALTER TABLE public.ghl_users          DROP CONSTRAINT uq_ghl_users_tenant_user;
ALTER TABLE public.lead_intelligence  DROP CONSTRAINT uq_lead_intel_tenant_contact;
ALTER TABLE public.day_briefing_cache DROP CONSTRAINT uq_day_briefing_tenant_cache;
ALTER TABLE public.sync_state         DROP CONSTRAINT uq_sync_state_tenant_resource;

-- Step E (was D): Add 3 composite FKs referencing new ghl_contacts PK
ALTER TABLE public.ghl_contact_tags
  ADD CONSTRAINT ghl_contact_tags_contact_fkey
  FOREIGN KEY (tenant_id, ghl_contact_id)
  REFERENCES public.ghl_contacts (tenant_id, ghl_contact_id) ON DELETE CASCADE;

ALTER TABLE public.ghl_conversations
  ADD CONSTRAINT ghl_conversations_contact_fkey
  FOREIGN KEY (tenant_id, ghl_contact_id)
  REFERENCES public.ghl_contacts (tenant_id, ghl_contact_id) ON DELETE CASCADE;

ALTER TABLE public.ghl_opportunities
  ADD CONSTRAINT ghl_opportunities_contact_fkey
  FOREIGN KEY (tenant_id, ghl_contact_id)
  REFERENCES public.ghl_contacts (tenant_id, ghl_contact_id) ON DELETE CASCADE;

COMMIT;