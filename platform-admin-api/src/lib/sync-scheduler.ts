// In-process sync scheduler — replaces the host crontab.
//
// Ticks every 30s. For each enabled job in platform.sync_settings whose
// interval has elapsed since last_run_at, fires the matching app cron
// endpoint with the x-cron-secret header and records the outcome
// (last_run_at / last_status / last_duration_ms) back into the table.
//
// Why here and not cron(8): admin-api is already a long-running process on
// the same docker network as both apps, the schedule becomes data a super
// admin edits from the UI, and last-run health is visible in the same place.
// Restart-safe: last_run_at lives in the DB, so a container bounce never
// double-fires or loses the cadence.
//
// Claim semantics: the UPDATE ... WHERE clause re-checks elapsed time, so
// even if two admin-api instances ever ran, only one would claim a tick.

import { sql } from "../db.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// Internal docker-network URLs to each app's Supabase gateway (nginx :54321
// proxies /functions/v1/* to the edge runtime). Same hostnames local + VPS.
const ACQ_BASE = Deno.env.get("ACQ_FUNCTIONS_BASE_URL") ?? "http://acq-coach:54321";
const LI_BASE  = Deno.env.get("LI_FUNCTIONS_BASE_URL")  ?? "http://leadintel:54321";

export const JOBS: Record<string, { url: string; label: string }> = {
  acq_sync:       { url: `${ACQ_BASE}/functions/v1/cron-sync`,             label: "ACQ Coach — calls + scoring sync" },
  li_full_sync:   { url: `${LI_BASE}/functions/v1/sync-all-tenants-cron`,  label: "Lead Intel — full sweep (all tenants)" },
  li_resume_sync: { url: `${LI_BASE}/functions/v1/sync-resume-cron`,       label: "Lead Intel — resume stuck syncs" },
};

interface JobRow {
  job_name: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
}

// Fire one job and persist the outcome. Exported so the "Run now" route can
// reuse the exact same execution path the scheduler uses.
export async function runJob(jobName: string): Promise<{ ok: boolean; status: string; duration_ms: number }> {
  const job = JOBS[jobName];
  if (!job) return { ok: false, status: "error: unknown job", duration_ms: 0 };
  if (!CRON_SECRET) {
    const status = "error: CRON_SECRET not set in admin-api env";
    await sql`UPDATE platform.sync_settings SET last_run_at = now(), last_status = ${status} WHERE job_name = ${jobName}`;
    return { ok: false, status, duration_ms: 0 };
  }

  const started = Date.now();
  let status: string;
  try {
    const r = await fetch(job.url, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET, "Content-Type": "application/json" },
      // Cron endpoints fan work out internally; cap our wait so a slow sweep
      // doesn't stall the scheduler loop. The endpoint keeps running after
      // we stop waiting — this is a dispatch, not a join.
      signal: AbortSignal.timeout(60_000),
    });
    status = r.ok ? "ok" : `error: HTTP ${r.status} ${(await r.text()).slice(0, 180)}`;
  } catch (e) {
    status = `error: ${(e as Error).message}`.slice(0, 200);
  }
  const duration_ms = Date.now() - started;

  await sql`
    UPDATE platform.sync_settings
    SET last_run_at = now(), last_status = ${status}, last_duration_ms = ${duration_ms}
    WHERE job_name = ${jobName}
  `;
  return { ok: status === "ok", status, duration_ms };
}

async function tick(): Promise<void> {
  let due: JobRow[];
  try {
    // Atomic claim: only rows whose interval has truly elapsed get their
    // last_run_at bumped, and we only fire the ones we claimed.
    due = await sql<JobRow[]>`
      UPDATE platform.sync_settings
      SET last_run_at = now(), last_status = 'running'
      WHERE enabled = true
        AND (last_run_at IS NULL OR last_run_at < now() - (interval_minutes || ' minutes')::interval)
      RETURNING job_name, enabled, interval_minutes, last_run_at
    `;
  } catch (e) {
    console.error("[sync-scheduler] tick query failed:", (e as Error).message);
    return;
  }

  for (const row of due) {
    console.log(`[sync-scheduler] firing ${row.job_name}`);
    // Sequential on purpose — avoids hammering both apps at the same instant.
    const result = await runJob(row.job_name);
    console.log(`[sync-scheduler] ${row.job_name} → ${result.status} (${result.duration_ms}ms)`);
  }
}

export function startSyncScheduler(): void {
  console.log("[sync-scheduler] started (30s tick). Jobs:", Object.keys(JOBS).join(", "));
  // First tick shortly after boot so "Run now"-less deploys still catch up fast.
  setTimeout(() => tick().catch(() => {}), 5_000);
  setInterval(() => tick().catch(() => {}), 30_000);
}
