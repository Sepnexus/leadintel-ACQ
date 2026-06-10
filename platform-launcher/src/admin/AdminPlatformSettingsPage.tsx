// /admin/settings — platform-wide configuration.
//
// Two panels:
//   1) Master Keys — editable from this UI (OPENAI / ANTHROPIC / STRIPE / ...).
//      Stored in platform.master_keys; edge fns read via getEnvOrMasterKey().
//      Changes take effect within 60s (cache TTL) without container restart.
//   2) Per-stack env status — read-only listing of what's configured at
//      deployment time per container (admin-api, ACQ edge, LI edge).

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { adminApi, MasterKey, SyncJob } from "./adminApi";
import { Pill, ErrorBanner } from "./AdminLayout";
import { useToast } from "./Toast";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

interface KeyStatus { name: string; set: boolean; length: number }
interface ProductReport {
  product: "acq_coach" | "lead_intel" | "admin_api";
  keys: KeyStatus[];
  fetched: boolean;
  error?: string;
}

function productLabel(p: string): string {
  if (p === "acq_coach") return "ACQ Coach (edge runtime)";
  if (p === "lead_intel") return "Lead Intel (edge runtime)";
  if (p === "admin_api") return "Admin API (platform-admin-api)";
  return p;
}

export function AdminPlatformSettingsPage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Platform Settings</h2>
        <div style={{ color: COLORS.T3, fontSize: 12, marginTop: 4 }}>
          Master API keys & secrets · editable below · changes apply within ~60s
        </div>
      </div>

      <SyncSchedulePanel />
      <MasterKeysPanel />
      <EnvStatusPanel />
    </div>
  );
}

// ── Master Keys (editable) ─────────────────────────────────────────────────

function MasterKeysPanel() {
  const [keys, setKeys] = useState<MasterKey[]>([]);
  const [editing, setEditing] = useState<MasterKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await adminApi.listMasterKeys();
    setLoading(false);
    if (r.ok) { setKeys(r.data.keys); setError(null); }
    else      setError(r.error);
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <div style={{
        background: COLORS.S1, border: `1px solid ${COLORS.B2}`,
        borderRadius: 10, marginBottom: 18, overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Master Keys</div>
            <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3 }}>
              Stored in platform-db · edge fns read via cache (60s TTL)
            </div>
          </div>
          <button onClick={load} style={btnGhost}>↻ Reload</button>
        </div>

        {error && <div style={{ padding: 16 }}><ErrorBanner>{error}</ErrorBanner></div>}

        {loading && keys.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: COLORS.T3 }}>Loading…</div>
        ) : keys.map((k, i) => (
          <div key={k.name} style={{
            display: "grid", gridTemplateColumns: "260px 1fr 140px 90px",
            padding: "12px 20px", borderTop: i === 0 ? "none" : `1px solid ${COLORS.B2}`,
            alignItems: "center", gap: 12,
          }}>
            <div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: COLORS.TEXT }}>{k.name}</div>
              {k.updated_at && (
                <div style={{ fontSize: 10, color: COLORS.T3, marginTop: 2 }}>
                  Set {new Date(k.updated_at).toLocaleString()} by {k.updated_by_email ?? "—"}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: COLORS.T2 }}>{k.description}</div>
            <div>
              {k.set
                ? <Pill color={COLORS.GREEN}>set · {k.length} chars</Pill>
                : <Pill color="#ff7a7a">missing</Pill>}
            </div>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => setEditing(k)} style={btnPrimary}>
                {k.set ? "Edit" : "Set"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditKeyModal
          k={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function EditKeyModal({ k, onClose, onSaved }: { k: MasterKey; onClose: () => void; onSaved: () => void }) {
  const [value, setValue]   = useState("");
  const [showVal, setShow]  = useState(false);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setBusy(true); setErr(null);
    const r = await adminApi.setMasterKey(k.name, value);
    setBusy(false);
    if (!r.ok) { setErr(r.error); toast.error(`Save failed: ${r.error}`); return; }
    toast.success(`${k.name} saved (${r.data.length} chars). Edge fns pick up within 60s.`);
    onSaved();
  }

  async function clear() {
    if (!confirm(`Delete ${k.name}? Edge fns will fall back to .env values.`)) return;
    setBusy(true); setErr(null);
    const r = await adminApi.deleteMasterKey(k.name);
    setBusy(false);
    if (!r.ok) { setErr(r.error); toast.error(`Delete failed: ${r.error}`); return; }
    toast.success(`${k.name} cleared.`);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 12,
        padding: 24, width: 480, maxWidth: "92vw", fontFamily: FONT,
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{k.name}</div>
          <div style={{ fontSize: 12, color: COLORS.T3, marginTop: 4 }}>{k.description}</div>
        </div>

        <label style={{ fontSize: 11, color: COLORS.T3, display: "block", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          New value
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input
            type={showVal ? "text" : "password"}
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={k.set ? "(enter new value to replace)" : "paste the API key…"}
            style={{
              flex: 1, background: COLORS.B2, color: COLORS.TEXT,
              border: `1px solid ${COLORS.B3}`, borderRadius: 6,
              padding: "10px 12px", fontSize: 13, fontFamily: "ui-monospace, monospace",
              outline: "none",
            }}
          />
          <button onClick={() => setShow(s => !s)} style={btnGhost}>
            {showVal ? "Hide" : "Show"}
          </button>
        </div>

        {err && <div style={{ marginBottom: 10 }}><ErrorBanner>{err}</ErrorBanner></div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {k.set && (
              <button onClick={clear} disabled={busy} style={btnDanger}>
                Clear
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={busy} style={btnGhost}>Cancel</button>
            <button onClick={save} disabled={busy || value.length === 0} style={btnPrimary}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Per-stack env status (read-only) ───────────────────────────────────────

function EnvStatusPanel() {
  const [reports, setReports] = useState<ProductReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote]       = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await adminApi.listPlatformKeys();
    setLoading(false);
    if (r.ok) { setReports(r.data.reports); setNote(r.data.note); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{
      background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18, overflow: "hidden",
    }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}` }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Container Env Status (read-only)</div>
        <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3 }}>
          What's configured in each container's .env at deployment time. To edit at this layer, SSH and{" "}
          <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>docker compose restart</code>.
          Master Keys above are preferred (no restart needed).
        </div>
      </div>

      {loading && reports.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: COLORS.T3, fontSize: 13 }}>Loading…</div>
      ) : reports.map((r, ri) => (
        <div key={r.product} style={{ borderTop: ri === 0 ? "none" : `1px solid ${COLORS.B2}` }}>
          <div style={{
            padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: COLORS.B2 + "40",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{productLabel(r.product)}</div>
            {r.fetched
              ? <Pill color={COLORS.GREEN}>reachable</Pill>
              : <Pill color="#ff7a7a">unreachable</Pill>}
          </div>
          {r.keys.map((k, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 120px 100px",
              padding: "8px 28px", borderTop: `1px solid ${COLORS.B2}`,
              alignItems: "center", gap: 12,
            }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: COLORS.TEXT }}>{k.name}</div>
              <div>{k.set ? <Pill color={COLORS.GREEN}>configured</Pill> : <Pill color="#ff7a7a">missing</Pill>}</div>
              <div style={{ fontSize: 10, color: COLORS.T3, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>
                {k.set ? `${k.length} chars` : "—"}
              </div>
            </div>
          ))}
        </div>
      ))}

      {note && (
        <div style={{ padding: "12px 20px", color: COLORS.T2, fontSize: 11, borderTop: `1px solid ${COLORS.B2}`, lineHeight: 1.6 }}>
          {note}
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  background: COLORS.B2, border: `1px solid ${COLORS.B3}`,
  borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
  fontSize: 12, cursor: "pointer", fontFamily: FONT,
};
const btnPrimary: React.CSSProperties = {
  background: COLORS.GREEN, border: `1px solid ${COLORS.GREEN}`,
  borderRadius: 6, padding: "6px 14px", color: "#fff",
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
};
const btnDanger: React.CSSProperties = {
  background: "transparent", border: "1px solid #ff7a7a55",
  borderRadius: 6, padding: "6px 12px", color: "#ff7a7a",
  fontSize: 12, cursor: "pointer", fontFamily: FONT,
};

// ── Sync Schedule (scheduler runs inside admin-api; settings in platform-db) ─

function SyncSchedulePanel() {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // job_name being acted on
  const [draftIntervals, setDraftIntervals] = useState<Record<string, string>>({});

  async function load() {
    const r = await adminApi.getSyncSchedule();
    setLoading(false);
    if (r.ok) { setJobs(r.data.jobs); setError(null); }
    else      setError(r.error);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // keep last-run status fresh
    return () => clearInterval(t);
  }, []);

  async function toggle(job: SyncJob) {
    setBusy(job.job_name);
    const r = await adminApi.updateSyncJob(job.job_name, { enabled: !job.enabled });
    setBusy(null);
    if (!r.ok) setError(r.error); else load();
  }

  async function saveInterval(job: SyncJob) {
    const raw = draftIntervals[job.job_name];
    const v = parseInt(raw ?? "", 10);
    if (!Number.isFinite(v) || v < 1 || v > 1440) { setError("Interval must be 1–1440 minutes"); return; }
    setBusy(job.job_name);
    const r = await adminApi.updateSyncJob(job.job_name, { interval_minutes: v });
    setBusy(null);
    if (!r.ok) setError(r.error);
    else { setDraftIntervals(d => { const c = { ...d }; delete c[job.job_name]; return c; }); load(); }
  }

  async function runNow(job: SyncJob) {
    setBusy(job.job_name);
    const r = await adminApi.runSyncJobNow(job.job_name);
    setBusy(null);
    if (!r.ok) setError("error" in r ? r.error : "run failed");
    load();
  }

  const fmtAgo = (ts: string | null) => {
    if (!ts) return "never";
    const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
  };

  return (
    <div style={{
      background: COLORS.S1, border: `1px solid ${COLORS.B2}`,
      borderRadius: 10, marginBottom: 18, overflow: "hidden",
    }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}` }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Sync Schedule</div>
        <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3 }}>
          Background GHL sync cadence · runs inside the platform (no server cron) · changes apply within 30s
        </div>
      </div>

      {error && <div style={{ padding: 16 }}><ErrorBanner>{error}</ErrorBanner></div>}

      {loading && jobs.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: COLORS.T3 }}>Loading…</div>
      ) : jobs.map((j, i) => {
        const statusOk = j.last_status === "ok";
        const statusRunning = j.last_status === "running";
        return (
          <div key={j.job_name} style={{
            display: "grid", gridTemplateColumns: "minmax(220px,1.2fr) 150px 1fr 200px",
            padding: "13px 20px", borderTop: i === 0 ? "none" : `1px solid ${COLORS.B2}`,
            alignItems: "center", gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{j.label}</div>
              <div style={{ fontSize: 10, color: COLORS.T3, fontFamily: "ui-monospace, monospace", marginTop: 2 }}>{j.job_name}</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: COLORS.T3 }}>every</span>
              <input
                type="number" min={1} max={1440}
                value={draftIntervals[j.job_name] ?? String(j.interval_minutes)}
                onChange={e => setDraftIntervals(d => ({ ...d, [j.job_name]: e.target.value }))}
                style={{
                  width: 56, padding: "5px 8px", background: COLORS.BG,
                  border: `1px solid ${COLORS.B3}`, borderRadius: 6,
                  color: COLORS.TEXT, fontSize: 12, textAlign: "center",
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.T3 }}>min</span>
              {draftIntervals[j.job_name] !== undefined && draftIntervals[j.job_name] !== String(j.interval_minutes) && (
                <button onClick={() => saveInterval(j)} disabled={busy === j.job_name} style={{ ...btnPrimary, padding: "4px 8px", fontSize: 11 }}>Save</button>
              )}
            </div>

            <div style={{ fontSize: 11, color: COLORS.T3, lineHeight: 1.5 }}>
              Last run: {fmtAgo(j.last_run_at)}
              {j.last_status && (
                <span style={{
                  marginLeft: 8,
                  color: statusOk ? COLORS.GREEN : statusRunning ? "#ffc966" : "#ff7a7a",
                }} title={j.last_status}>
                  {statusOk ? "✓ ok" : statusRunning ? "⏳ running" : `✗ ${j.last_status.slice(0, 60)}`}
                </span>
              )}
              {j.last_duration_ms != null && <span style={{ marginLeft: 6 }}>· {j.last_duration_ms}ms</span>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => runNow(j)} disabled={busy === j.job_name} style={btnGhost}>
                {busy === j.job_name ? "…" : "▶ Run now"}
              </button>
              <button
                onClick={() => toggle(j)}
                disabled={busy === j.job_name}
                style={{
                  ...btnPrimary,
                  background: j.enabled ? "rgba(192,57,43,0.15)" : undefined,
                  border: j.enabled ? "1px solid #c0392b" : (btnPrimary as Record<string, string>).border,
                  color: j.enabled ? "#ff7a7a" : (btnPrimary as Record<string, string>).color,
                  minWidth: 76,
                }}
              >
                {j.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
