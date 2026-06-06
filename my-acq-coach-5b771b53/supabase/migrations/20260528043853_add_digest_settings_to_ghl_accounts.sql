-- Add digest_settings JSONB column to ghl_accounts.
-- Used by send-digest edge function for batch sends.
-- Schema: { enabled: boolean, email: string, last_sent: string | null }

ALTER TABLE ghl_accounts
  ADD COLUMN IF NOT EXISTS digest_settings JSONB DEFAULT NULL;

COMMENT ON COLUMN ghl_accounts.digest_settings IS
  'Weekly digest email config. Schema: { enabled: boolean, email: string, last_sent: ISO-string | null }';
