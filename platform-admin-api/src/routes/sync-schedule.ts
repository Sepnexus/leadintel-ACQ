// /admin-api/platform-settings/sync-schedule — super-admin control of the
// background sync cadence. Backs the "Sync Schedule" card in Platform
// Settings. The actual execution lives in lib/sync-scheduler.ts.
//
// GET    /admin-api/platform-settings/sync-schedule           → all jobs
// PUT    /admin-api/platform-settings/sync-schedule/:job      → { enabled?, interval_minutes? }
// POST   /admin-api/platform-settings/sync-schedule/:job/run  → fire immediately

import { sql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";
import { JOBS, runJob } from "../lib/sync-scheduler.ts";

export async function getSyncSchedule(_req: Request, _admin: AuthedAdmin): Promise<Response> {
  const rows = await sql`
    SELECT job_name, enabled, interval_minutes, last_run_at, last_status, last_duration_ms, updated_at
    FROM platform.sync_settings
    ORDER BY job_name
  `;
  const jobs = rows.map((r: Record<string, unknown>) => ({
    ...r,
    label: JOBS[r.job_name as string]?.label ?? r.job_name,
  }));
  return json({ jobs });
}

export async function updateSyncSchedule(req: Request, admin: AuthedAdmin, jobName: string): Promise<Response> {
  if (!JOBS[jobName]) return json({ error: "unknown_job", known: Object.keys(JOBS) }, 404);

  const body = await req.json().catch(() => ({})) as { enabled?: boolean; interval_minutes?: number };
  const wantsEnabled  = typeof body.enabled === "boolean";
  const wantsInterval = typeof body.interval_minutes === "number";
  if (!wantsEnabled && !wantsInterval) {
    return json({ error: "bad_request", reason: "expected { enabled?: boolean, interval_minutes?: number }" }, 400);
  }
  if (wantsInterval && (body.interval_minutes! < 1 || body.interval_minutes! > 1440)) {
    return json({ error: "bad_request", reason: "interval_minutes must be 1–1440" }, 400);
  }

  const rows = await sql`
    UPDATE platform.sync_settings
    SET enabled          = COALESCE(${wantsEnabled ? body.enabled! : null}, enabled),
        interval_minutes = COALESCE(${wantsInterval ? body.interval_minutes! : null}, interval_minutes),
        updated_at       = now(),
        updated_by       = ${admin.platformUserId}::uuid
    WHERE job_name = ${jobName}
    RETURNING job_name, enabled, interval_minutes, last_run_at, last_status
  `;

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, 'sync_schedule_updated',
            ${sql.json({ job: jobName, enabled: body.enabled, interval_minutes: body.interval_minutes })})
  `;

  return json({ ok: true, job: rows[0] });
}

export async function runSyncJobNow(_req: Request, admin: AuthedAdmin, jobName: string): Promise<Response> {
  if (!JOBS[jobName]) return json({ error: "unknown_job", known: Object.keys(JOBS) }, 404);

  const result = await runJob(jobName);

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, 'sync_run_now', ${sql.json({ job: jobName, ...result })})
  `;

  return json({ ok: result.ok, ...result });
}
