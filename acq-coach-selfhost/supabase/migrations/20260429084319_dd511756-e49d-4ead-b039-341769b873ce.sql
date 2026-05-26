ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS default_payment_method_id text;

-- Make account_id unique so we can upsert on it from the webhook.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_settings_account_id_key'
  ) THEN
    ALTER TABLE public.billing_settings
      ADD CONSTRAINT billing_settings_account_id_key UNIQUE (account_id);
  END IF;
END $$;