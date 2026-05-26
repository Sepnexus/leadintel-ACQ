
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  operation text NOT NULL,                -- 'transcription' | 'scoring'
  provider text NOT NULL,                 -- 'deepgram' | 'lovable_ai' | 'anthropic'
  model text,                             -- e.g. 'nova-2', 'google/gemini-2.5-flash'
  call_id uuid,
  ghl_message_id text,
  audio_seconds integer DEFAULT 0,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  provider_cost_cents numeric(10,4) NOT NULL DEFAULT 0,  -- what we pay (fractional cents)
  billed_cents integer NOT NULL DEFAULT 0,               -- what customer pays
  margin_cents numeric(10,4) GENERATED ALWAYS AS (billed_cents - provider_cost_cents) STORED,
  status text NOT NULL DEFAULT 'success', -- 'success' | 'failed'
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_account_created ON public.usage_events(account_id, created_at DESC);
CREATE INDEX idx_usage_events_operation ON public.usage_events(operation, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own usage events"
ON public.usage_events FOR SELECT
USING (is_super_admin(auth.uid()) OR is_account_admin(auth.uid(), account_id));

-- Convenience view for per-customer totals
CREATE OR REPLACE VIEW public.usage_summary_by_account AS
SELECT
  account_id,
  count(*)                              AS event_count,
  count(*) FILTER (WHERE operation='transcription') AS transcription_count,
  count(*) FILTER (WHERE operation='scoring')        AS scoring_count,
  coalesce(sum(audio_seconds),0)        AS total_audio_seconds,
  coalesce(sum(tokens_in),0)            AS total_tokens_in,
  coalesce(sum(tokens_out),0)           AS total_tokens_out,
  coalesce(sum(provider_cost_cents),0)  AS total_provider_cost_cents,
  coalesce(sum(billed_cents),0)         AS total_billed_cents,
  coalesce(sum(margin_cents),0)         AS total_margin_cents,
  max(created_at)                       AS last_event_at
FROM public.usage_events
GROUP BY account_id;

GRANT SELECT ON public.usage_summary_by_account TO authenticated;
