-- Lead Intel: restore PKs / UNIQUEs / FKs after Lovable data import.
-- Lead Intel HAS foreign keys (30 of them, all cascading on tenant delete)
-- — unlike ACQ which is RLS-only. Restore order matters:
--   1. PKs / composite PKs on every table.
--   2. FKs to tenants (parent-most table).
--   3. FKs to users / auth.users.
--   4. Composite FKs back to ghl_contacts (tenant_id, ghl_contact_id).
--
-- All idempotent via pg_temp.try_constraint().

\set ON_ERROR_STOP off

CREATE OR REPLACE FUNCTION pg_temp.try_constraint(stmt text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
EXCEPTION
  WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN
    RAISE NOTICE 'already exists: %', stmt;
  WHEN others THEN
    RAISE NOTICE 'skip: % (%)', SQLERRM, stmt;
END
$$;

-- ─── Primary keys (uuid, except composite for GHL tables) ──
DO $$ BEGIN
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenants                       ADD CONSTRAINT tenants_pkey                       PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.users                         ADD CONSTRAINT users_pkey                         PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenant_users                  ADD CONSTRAINT tenant_users_pkey                  PRIMARY KEY (tenant_id, user_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.user_invitations              ADD CONSTRAINT user_invitations_pkey              PRIMARY KEY (id)');

  -- GHL tables: composite natural PKs
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contacts                  ADD CONSTRAINT ghl_contacts_pkey                  PRIMARY KEY (tenant_id, ghl_contact_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contact_tags              ADD CONSTRAINT ghl_contact_tags_pkey              PRIMARY KEY (tenant_id, ghl_contact_id, tag)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contact_notes             ADD CONSTRAINT ghl_contact_notes_pkey             PRIMARY KEY (tenant_id, ghl_note_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_conversations             ADD CONSTRAINT ghl_conversations_pkey             PRIMARY KEY (tenant_id, ghl_conversation_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_messages                  ADD CONSTRAINT ghl_messages_pkey                  PRIMARY KEY (tenant_id, ghl_message_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_opportunities             ADD CONSTRAINT ghl_opportunities_pkey             PRIMARY KEY (tenant_id, ghl_opportunity_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_tasks                     ADD CONSTRAINT ghl_tasks_pkey                     PRIMARY KEY (tenant_id, ghl_task_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_users                     ADD CONSTRAINT ghl_users_pkey                     PRIMARY KEY (tenant_id, ghl_user_id)');

  PERFORM pg_temp.try_constraint('ALTER TABLE public.lead_intelligence             ADD CONSTRAINT lead_intelligence_pkey             PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.day_briefing_cache            ADD CONSTRAINT day_briefing_cache_pkey            PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenant_pipelines              ADD CONSTRAINT tenant_pipelines_pkey              PRIMARY KEY (tenant_id, pipeline_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenant_custom_field_mappings  ADD CONSTRAINT tenant_custom_field_mappings_pkey  PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.sync_state                    ADD CONSTRAINT sync_state_pkey                    PRIMARY KEY (tenant_id, resource)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.sync_history                  ADD CONSTRAINT sync_history_pkey                  PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.wallets                       ADD CONSTRAINT wallets_pkey                       PRIMARY KEY (tenant_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.wallet_transactions           ADD CONSTRAINT wallet_transactions_pkey           PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.billing_settings              ADD CONSTRAINT billing_settings_pkey              PRIMARY KEY (tenant_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.usage_events                  ADD CONSTRAINT usage_events_pkey                  PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.audit_log                     ADD CONSTRAINT audit_log_pkey                     PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.platform_settings             ADD CONSTRAINT platform_settings_pkey             PRIMARY KEY (id)');
END $$;

-- ─── Foreign keys — to tenants (parent-most) ──
DO $$ BEGIN
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenant_users                  ADD CONSTRAINT tenant_users_tenant_id_fkey                  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.user_invitations              ADD CONSTRAINT user_invitations_tenant_id_fkey              FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contacts                  ADD CONSTRAINT ghl_contacts_tenant_id_fkey                  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contact_tags              ADD CONSTRAINT ghl_contact_tags_tenant_id_fkey              FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contact_notes             ADD CONSTRAINT ghl_contact_notes_tenant_id_fkey             FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_conversations             ADD CONSTRAINT ghl_conversations_tenant_id_fkey             FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_messages                  ADD CONSTRAINT ghl_messages_tenant_id_fkey                  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_opportunities             ADD CONSTRAINT ghl_opportunities_tenant_id_fkey             FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_tasks                     ADD CONSTRAINT ghl_tasks_tenant_id_fkey                     FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_users                     ADD CONSTRAINT ghl_users_tenant_id_fkey                     FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.lead_intelligence             ADD CONSTRAINT lead_intelligence_tenant_id_fkey             FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.day_briefing_cache            ADD CONSTRAINT day_briefing_cache_tenant_id_fkey            FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenant_pipelines              ADD CONSTRAINT tenant_pipelines_tenant_id_fkey              FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenant_custom_field_mappings  ADD CONSTRAINT tenant_custom_field_mappings_tenant_id_fkey  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.sync_state                    ADD CONSTRAINT sync_state_tenant_id_fkey                    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.sync_history                  ADD CONSTRAINT sync_history_tenant_id_fkey                  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.wallets                       ADD CONSTRAINT wallets_tenant_id_fkey                       FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.wallet_transactions           ADD CONSTRAINT wallet_transactions_tenant_id_fkey           FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.billing_settings              ADD CONSTRAINT billing_settings_tenant_id_fkey              FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.usage_events                  ADD CONSTRAINT usage_events_tenant_id_fkey                  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE');
END $$;

-- ─── FKs to users / auth.users ──
DO $$ BEGIN
  PERFORM pg_temp.try_constraint('ALTER TABLE public.users                ADD CONSTRAINT users_id_fkey                          FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.tenant_users         ADD CONSTRAINT tenant_users_user_id_fkey               FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.user_invitations     ADD CONSTRAINT user_invitations_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.user_invitations     ADD CONSTRAINT user_invitations_accepted_user_id_fkey   FOREIGN KEY (accepted_user_id)   REFERENCES auth.users(id) ON DELETE SET NULL');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.usage_events         ADD CONSTRAINT usage_events_user_id_fkey                FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.audit_log            ADD CONSTRAINT audit_log_actor_user_id_fkey            FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.sync_history         ADD CONSTRAINT sync_history_triggered_by_user_id_fkey  FOREIGN KEY (triggered_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL');
END $$;

-- ─── Composite FKs back to ghl_contacts ──
DO $$ BEGIN
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contact_tags     ADD CONSTRAINT ghl_contact_tags_contact_fkey     FOREIGN KEY (tenant_id, ghl_contact_id) REFERENCES public.ghl_contacts(tenant_id, ghl_contact_id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_conversations    ADD CONSTRAINT ghl_conversations_contact_fkey    FOREIGN KEY (tenant_id, ghl_contact_id) REFERENCES public.ghl_contacts(tenant_id, ghl_contact_id) ON DELETE CASCADE');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_opportunities    ADD CONSTRAINT ghl_opportunities_contact_fkey    FOREIGN KEY (tenant_id, ghl_contact_id) REFERENCES public.ghl_contacts(tenant_id, ghl_contact_id) ON DELETE CASCADE');
END $$;

-- Tell PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
