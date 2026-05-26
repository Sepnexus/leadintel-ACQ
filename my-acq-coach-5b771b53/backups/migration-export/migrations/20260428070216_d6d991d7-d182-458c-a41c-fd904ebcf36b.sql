-- Per-tenant sync cursor (forward-only)
CREATE TABLE IF NOT EXISTS public.sync_state (
  account_id uuid PRIMARY KEY,
  cursor_ms bigint NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant view sync state"
ON public.sync_state FOR SELECT
USING (public.is_account_member(auth.uid(), account_id));

-- Audit log of every sync attempt
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  trigger text NOT NULL DEFAULT 'cron',  -- cron | manual
  status text NOT NULL DEFAULT 'running', -- running | success | error
  conversations_scanned int NOT NULL DEFAULT 0,
  conversations_saved int NOT NULL DEFAULT 0,
  messages_saved int NOT NULL DEFAULT 0,
  call_messages_found int NOT NULL DEFAULT 0,
  duration_ms int,
  error_message text,
  cursor_before_ms bigint,
  cursor_after_ms bigint,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS sync_runs_account_started_idx
  ON public.sync_runs (account_id, started_at DESC);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant view sync runs"
ON public.sync_runs FOR SELECT
USING (public.is_account_member(auth.uid(), account_id));