CREATE TABLE public.day_briefing_cache (
  cache_key TEXT PRIMARY KEY,
  briefing JSONB NOT NULL,
  rep_id TEXT,
  lead_ids JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '4 hours')
);

CREATE INDEX idx_day_briefing_expires ON public.day_briefing_cache(expires_at);

ALTER TABLE public.day_briefing_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "day_briefing_cache_select_anon"
  ON public.day_briefing_cache FOR SELECT TO anon USING (true);

CREATE POLICY "day_briefing_cache_select_authenticated"
  ON public.day_briefing_cache FOR SELECT TO authenticated USING (true);