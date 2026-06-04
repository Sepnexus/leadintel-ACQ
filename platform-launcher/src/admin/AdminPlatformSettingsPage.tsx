// /admin/settings — read-only listing of platform master keys.
// Shows whether each key is set per stack (admin-api, ACQ, Lead Intel).
// Never shows values. Editing is SSH-only — documented below.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { adminApi } from "./adminApi";
import { Pill, ErrorBanner } from "./AdminLayout";

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

function envLocation(p: string): string {
  if (p === "acq_coach") return "acq-coach-selfhost/.env";
  if (p === "lead_intel") return "leadintel-selfhost/.env";
  if (p === "admin_api") return "platform-admin-api/.env";
  return "(unknown)";
}

export function AdminPlatformSettingsPage() {
  const [reports, setReports] = useState<ProductReport[]>([]);
  const [note, setNote]       = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await adminApi.listPlatformKeys();
    setLoading(false);
    if (r.ok) { setReports(r.data.reports); setNote(r.data.note); setError(null); }
    else setError(r.error);
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Platform Settings</h2>
          <div style={{ color: COLORS.T3, fontSize: 12, marginTop: 4 }}>
            Master API keys & secrets · read-only · edit via SSH then{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>docker compose restart</code>
          </div>
        </div>
        <button onClick={load} style={{
          background: COLORS.B2, border: `1px solid ${COLORS.B3}`, borderRadius: 6,
          padding: "6px 12px", color: COLORS.T2, fontSize: 12, cursor: "pointer",
        }}>↻ Re-check</button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading && reports.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: COLORS.T3 }}>Loading…</div>
      ) : reports.map(r => (
        <div key={r.product} style={{
          background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18, overflow: "hidden",
        }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{productLabel(r.product)}</div>
              <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3, fontFamily: "ui-monospace, monospace" }}>
                edit: <span style={{ color: COLORS.T2 }}>{envLocation(r.product)}</span>
              </div>
            </div>
            {r.fetched
              ? <Pill color={COLORS.GREEN}>reachable</Pill>
              : <Pill color="#ff7a7a">unreachable</Pill>
            }
          </div>

          {!r.fetched && r.error && (
            <div style={{ padding: "10px 20px", color: "#ff7a7a", fontSize: 12, borderBottom: `1px solid ${COLORS.B2}` }}>
              {r.error}
            </div>
          )}

          {r.keys.length > 0 ? (
            <div>
              {r.keys.map((k, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 120px 100px",
                  padding: "10px 20px", borderTop: i === 0 ? "none" : `1px solid ${COLORS.B2}`,
                  alignItems: "center", gap: 12,
                }}>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: COLORS.TEXT }}>
                    {k.name}
                  </div>
                  <div>
                    {k.set
                      ? <Pill color={COLORS.GREEN}>configured</Pill>
                      : <Pill color="#ff7a7a">missing</Pill>
                    }
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.T3, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>
                    {k.set ? `${k.length} chars` : "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : r.fetched && (
            <div style={{ padding: 24, textAlign: "center", color: COLORS.T3, fontSize: 13 }}>No keys reported.</div>
          )}
        </div>
      ))}

      {note && (
        <div style={{
          background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10,
          padding: "14px 20px", color: COLORS.T2, fontSize: 12, lineHeight: 1.6,
        }}>
          <strong style={{ color: COLORS.TEXT }}>How to rotate</strong>
          <div style={{ marginTop: 6 }}>{note}</div>
          <div style={{ marginTop: 12, color: COLORS.T3, fontSize: 11 }}>
            Per-customer secrets (GHL tokens) are managed per-customer on the Customers page,
            not here. This page is for platform-wide master keys only.
          </div>
        </div>
      )}
    </div>
  );
}
