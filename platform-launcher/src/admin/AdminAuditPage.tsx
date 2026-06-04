// /admin/audit — cross-product activity stream.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { adminApi, AuditEvent } from "./adminApi";
import { Pill, ErrorBanner } from "./AdminLayout";

export function AdminAuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await adminApi.listAudit(200);
    if (r.ok) { setEvents(r.data.events); setError(null); }
    else setError(r.error);
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Activity</h2>
        <button onClick={load} style={{
          background: COLORS.B2, border: `1px solid ${COLORS.B3}`, borderRadius: 6,
          padding: "6px 12px", color: COLORS.T2, fontSize: 12, cursor: "pointer",
        }}>↻ Refresh</button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ border: `1px solid ${COLORS.B2}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "170px 220px 100px 1fr 1fr",
          padding: "10px 14px", background: COLORS.B2, fontSize: 11,
          color: COLORS.T3, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700,
        }}>
          <div>When</div>
          <div>Action</div>
          <div>Product</div>
          <div>Actor</div>
          <div>Target / Context</div>
        </div>
        {events.map(e => (
          <div key={e.id} style={{
            display: "grid",
            gridTemplateColumns: "170px 220px 100px 1fr 1fr",
            padding: "10px 14px", borderTop: `1px solid ${COLORS.B2}`,
            fontSize: 12, alignItems: "center",
          }}>
            <div style={{ color: COLORS.T3, fontFamily: "ui-monospace, monospace" }}>
              {new Date(e.created_at).toLocaleString()}
            </div>
            <div style={{ color: COLORS.TEXT }}>{e.action}</div>
            <div>{e.product ? <Pill>{e.product === "acq_coach" ? "ACQ" : "LI"}</Pill> : <span style={{ color: COLORS.T3 }}>—</span>}</div>
            <div style={{ color: COLORS.T2 }}>{e.actor_email ?? <span style={{ color: COLORS.T3 }}>(system)</span>}</div>
            <div style={{ color: COLORS.T2, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
              {e.target_email ?? formatMeta(e.metadata)}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: COLORS.T3, fontSize: 13 }}>No activity yet.</div>
        )}
      </div>
    </div>
  );
}

function formatMeta(m: Record<string, unknown> | null): string {
  if (!m) return "";
  if (typeof m === "string") return m;
  const interesting = ["customer_name", "user_email", "valid_until"];
  const parts: string[] = [];
  for (const k of interesting) if (m[k]) parts.push(`${k}=${m[k]}`);
  return parts.join("  ");
}
