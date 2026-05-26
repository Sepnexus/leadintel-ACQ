-- ============================================================================
-- ACQ Coach — pg_cron jobs
-- Source: SELECT * FROM cron.job;  (2 active rows)
-- Generated: 2026-05-26
--
-- ⚠️  SECRETS IN PLAINTEXT:
--    - x-cron-secret (job 1)
--    - anon JWT      (job 2)
--    Both leaked into this file. ROTATE THEM after migration:
--      1. Mint new x-cron-secret (random 64 hex), update the cron-sync edge
--         function's CRON_SECRET env var, and replace below.
--      2. Re-issue the anon JWT (gen-keys.sh on self-host, or rotate in
--         Supabase dashboard → Settings → API), and replace below.
--
-- Replace the host (palblvwzgkmajmwquqah.supabase.co) with the new backend
-- URL before applying:
--    - self-host:  https://revenue-api.sepnexus.com  (or whatever you pick)
--    - new SB:     https://<new-ref>.supabase.co
-- ============================================================================

-- Job 1 — GHL conversation sync, every 5 minutes
SELECT cron.schedule(
  'cron-sync-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://palblvwzgkmajmwquqah.supabase.co/functions/v1/cron-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '9bb9b061720176cab6326f7f04d085df4b7a544e4e1212dc3524df2ec6ea12cb'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Job 2 — Stripe wallet auto-recharge, every 5 minutes
SELECT cron.schedule(
  'auto-recharge-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://palblvwzgkmajmwquqah.supabase.co/functions/v1/auto-recharge-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhbGJsdnd6Z2ttYWptd3F1cWFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNjUyNDUsImV4cCI6MjA5MDk0MTI0NX0.iOVMHQN-DPLpMacMChpSCJ9i57eDDvq8obTVwb03ak4"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
