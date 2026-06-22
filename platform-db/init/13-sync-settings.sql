-- Sync schedule settings — drives the scheduler loop inside platform-admin-api.
--
-- One row per job. The admin-api scheduler ticks every 30s, reads this table,
-- and fires the matching app cron endpoint when now() - last_run_at exceeds
-- interval_minutes. The launcher's Platform Settings page edits these rows,
-- so a super admin controls sync cadence entirely from the UI — no crontab.
--
-- Jobs:
--   acq_sync       → ACQ  /functions/v1/cron-sync           (calls + scoring sweep)
--   li_full_sync   → LI   /functions/v1/sync-all-tenants-cron (delta GHL sweep, all tenants)
--   li_resume_sync → LI   /functions/v1/sync-resume-cron      (resume stuck/partial syncs)
--   li_reconcile   → LI   /functions/v1/sync-reconcile-cron   (periodic FULL contacts sweep; prunes deleted-in-GHL contacts)

CREATE TABLE IF NOT EXISTS platform.sync_settings (
  job_name         text PRIMARY KEY,
  enabled          boolean     NOT NULL DEFAULT false,
  interval_minutes integer     NOT NULL DEFAULT 30 CHECK (interval_minutes BETWEEN 1 AND 1440),
  last_run_at      timestamptz,
  last_status      text,                -- 'ok' | 'error: ...'
  last_duration_ms integer,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES platform.users(id)
);

INSERT INTO platform.sync_settings (job_name, enabled, interval_minutes) VALUES
  ('acq_sync',       false, 30),
  ('li_full_sync',   false, 30),
  ('li_resume_sync', false, 10),
  ('li_reconcile',   false, 720)
ON CONFLICT (job_name) DO NOTHING;

-- admin-api connects as platform_admin; the scheduler + UI routes need RW.
GRANT SELECT, UPDATE ON platform.sync_settings TO platform_admin;
GRANT SELECT ON platform.sync_settings TO platform_app;
