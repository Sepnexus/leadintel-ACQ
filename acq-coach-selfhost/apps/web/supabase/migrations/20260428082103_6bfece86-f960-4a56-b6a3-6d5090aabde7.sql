-- Speed up dashboard hot paths
CREATE INDEX IF NOT EXISTS idx_call_scores_account_scored_at ON public.call_scores (account_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_scores_account_rep ON public.call_scores (account_id, rep_ghl_user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_calls_account_date ON public.ghl_calls (account_id, call_date DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_calls_account_status ON public.ghl_calls (account_id, status);
CREATE INDEX IF NOT EXISTS idx_ghl_messages_account_date ON public.ghl_messages (account_id, message_date DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_messages_account_user ON public.ghl_messages (account_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_account ON public.ghl_contacts (account_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_account_created ON public.usage_events (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON public.usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_account_created ON public.wallet_transactions (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON public.wallet_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_account_started ON public.sync_runs (account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON public.sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_account ON public.user_roles (account_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_rep_assignments_account ON public.rep_assignments (account_id);
CREATE INDEX IF NOT EXISTS idx_rep_assignments_user ON public.rep_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_users_account ON public.ghl_users (account_id);