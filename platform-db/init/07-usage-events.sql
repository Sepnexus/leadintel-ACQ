-- Phase B2 — Single usage_events ledger across both products.
--
-- Each row = one AI call (transcribe, score, chat, analyze, briefing, tts).
-- Product-specific fields (ACQ's audio_seconds/tokens_in/etc., LI's billing_mode)
-- go into metadata jsonb to keep the schema lean.

CREATE TABLE IF NOT EXISTS platform.usage_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES platform.customers(id) ON DELETE CASCADE,
  product              platform.product NOT NULL,
  user_id              uuid REFERENCES platform.users(id) ON DELETE SET NULL,
  operation            text NOT NULL,    -- 'transcribe' | 'score' | 'chat' | 'tts' | 'analyze' | 'briefing'
  provider             text NOT NULL,    -- 'openai' | 'anthropic' | 'deepgram'
  model                text,
  provider_cost_cents  numeric(12, 4),   -- what we paid the provider
  billed_cents         integer,          -- what we charged the customer's wallet
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- product-specific (audio_seconds, tokens_in, ...)
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_customer_recent
  ON platform.usage_events (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_product_recent
  ON platform.usage_events (product, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_user
  ON platform.usage_events (user_id) WHERE user_id IS NOT NULL;

-- ── Grants ──
GRANT SELECT, INSERT ON platform.usage_events TO platform_app;
GRANT SELECT         ON platform.usage_events TO platform_admin;
