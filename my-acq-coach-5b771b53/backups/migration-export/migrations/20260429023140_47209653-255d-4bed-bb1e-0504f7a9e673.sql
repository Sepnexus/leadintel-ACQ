-- 1. Per-customer billing rule overrides
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS markup_multiplier numeric NULL,
  ADD COLUMN IF NOT EXISTS min_call_seconds_for_ai integer NULL;

-- 2. Global settings (single-row)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  default_markup_multiplier numeric NOT NULL DEFAULT 2.0,
  default_min_call_seconds_for_ai integer NOT NULL DEFAULT 300,
  whisper_cents_per_minute numeric NOT NULL DEFAULT 0.6,        -- $0.006/min
  gemini_input_cents_per_1k numeric NOT NULL DEFAULT 0.0125,    -- $0.000125/1K tokens (flash)
  gemini_output_cents_per_1k numeric NOT NULL DEFAULT 0.05,     -- $0.0005/1K tokens (flash)
  anthropic_input_cents_per_1k numeric NOT NULL DEFAULT 0.3,    -- $0.003/1K tokens (haiku-ish)
  anthropic_output_cents_per_1k numeric NOT NULL DEFAULT 1.5,   -- $0.015/1K tokens
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super read app settings" ON public.app_settings;
CREATE POLICY "super read app settings"
  ON public.app_settings FOR SELECT
  USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super update app settings" ON public.app_settings;
CREATE POLICY "super update app settings"
  ON public.app_settings FOR UPDATE
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- 3. Usage events: extra detail column
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS effective_seconds integer NULL,
  ADD COLUMN IF NOT EXISTS markup_multiplier numeric NULL;

-- 4. Indexes for paginated admin queries
CREATE INDEX IF NOT EXISTS idx_usage_events_account_created
  ON public.usage_events (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_operation
  ON public.usage_events (operation);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_account_created
  ON public.wallet_transactions (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_account_started
  ON public.sync_runs (account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_accounts_name
  ON public.ghl_accounts (lower(name));
