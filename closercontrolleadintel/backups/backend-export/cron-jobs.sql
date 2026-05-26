-- pg_cron jobs (re-create on the new Postgres after enabling pg_cron + pg_net).
-- Replace the URL host with your new Edge Function host before running.

SELECT cron.schedule(
  'resume-partial-syncs',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wgnlnorxhfephwshuzvr.supabase.co/functions/v1/sync-resume-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'auto-sync-all-tenants',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wgnlnorxhfephwshuzvr.supabase.co/functions/v1/sync-all-tenants-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'LI_CRON_2026_xK9mPqR7vNs3wYbT'
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);
