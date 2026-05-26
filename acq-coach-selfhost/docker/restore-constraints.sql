-- ACQ Coach: restore PKs / UNIQUEs after Lovable data import.
-- ACQ's Lovable export does include PRIMARY KEY constraints inline with
-- CREATE TABLE, but pg_dump (used by Lovable) doesn't always emit them as
-- ADD CONSTRAINT statements when reloading. This file is the safety net.
--
-- ACQ specifics that simplify this vs metrics-loom:
--   - NO foreign keys anywhere — tenant isolation is RLS-only via the
--     is_super_admin / is_account_admin / is_account_member / rep_ghl_user_ids
--     SECURITY DEFINER helper functions. So nothing to restore here.
--   - NO sequences (every PK is gen_random_uuid()).
--   - All tables use uuid PKs except app_settings (PK = boolean true singleton).
--
-- The try_constraint() helper is reused from metrics-loom: it swallows
-- "constraint already exists" errors so this script is idempotent.

\set ON_ERROR_STOP off

CREATE OR REPLACE FUNCTION pg_temp.try_constraint(stmt text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
EXCEPTION
  WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN
    -- constraint already exists; ignore
    RAISE NOTICE 'already exists: %', stmt;
  WHEN others THEN
    RAISE NOTICE 'skip: % (%)', SQLERRM, stmt;
END
$$;

-- ─── Primary keys (uuid) ─────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_accounts        ADD CONSTRAINT ghl_accounts_pkey         PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.profiles            ADD CONSTRAINT profiles_pkey             PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.user_roles          ADD CONSTRAINT user_roles_pkey           PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.rep_assignments     ADD CONSTRAINT rep_assignments_pkey      PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_users           ADD CONSTRAINT ghl_users_pkey            PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contacts        ADD CONSTRAINT ghl_contacts_pkey         PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_conversations   ADD CONSTRAINT ghl_conversations_pkey    PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_messages        ADD CONSTRAINT ghl_messages_pkey         PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_calls           ADD CONSTRAINT ghl_calls_pkey            PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.call_scores         ADD CONSTRAINT call_scores_pkey          PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.wallets             ADD CONSTRAINT wallets_pkey              PRIMARY KEY (account_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_pkey  PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.billing_settings    ADD CONSTRAINT billing_settings_pkey     PRIMARY KEY (account_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.app_settings        ADD CONSTRAINT app_settings_pkey         PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.usage_events        ADD CONSTRAINT usage_events_pkey         PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.sync_runs           ADD CONSTRAINT sync_runs_pkey            PRIMARY KEY (id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.sync_state          ADD CONSTRAINT sync_state_pkey           PRIMARY KEY (account_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.blocked_numbers     ADD CONSTRAINT blocked_numbers_pkey      PRIMARY KEY (id)');
END $$;

-- ─── Uniques (per ER_SUMMARY.md) ────────────────────────
DO $$ BEGIN
  -- ghl_users.ghl_user_id is unique per account (composite uniqueness)
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_users           ADD CONSTRAINT ghl_users_account_ghl_user_id_key       UNIQUE (account_id, ghl_user_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_contacts        ADD CONSTRAINT ghl_contacts_account_ghl_contact_id_key UNIQUE (account_id, ghl_contact_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_conversations   ADD CONSTRAINT ghl_conversations_account_ghl_conv_key  UNIQUE (account_id, ghl_conversation_id)');
  PERFORM pg_temp.try_constraint('ALTER TABLE public.ghl_messages        ADD CONSTRAINT ghl_messages_account_ghl_message_id_key UNIQUE (account_id, ghl_message_id)');
  -- wallet_transactions.stripe_session_id is unique for idempotent webhook handling
  PERFORM pg_temp.try_constraint('ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_stripe_session_key  UNIQUE (stripe_session_id)');
END $$;

-- Tell PostgREST to reload its schema cache so the imported tables become
-- visible to the REST API immediately (no container restart needed).
NOTIFY pgrst, 'reload schema';
