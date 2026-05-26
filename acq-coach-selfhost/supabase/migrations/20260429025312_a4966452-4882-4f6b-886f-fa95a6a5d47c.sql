
-- Replace Gemini/Anthropic rate columns with OpenAI GPT rates (only model we actually use).
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS openai_input_cents_per_1k numeric NOT NULL DEFAULT 0.025,
  ADD COLUMN IF NOT EXISTS openai_output_cents_per_1k numeric NOT NULL DEFAULT 0.10;

ALTER TABLE public.app_settings DROP COLUMN IF EXISTS gemini_input_cents_per_1k;
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS gemini_output_cents_per_1k;
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS anthropic_input_cents_per_1k;
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS anthropic_output_cents_per_1k;
