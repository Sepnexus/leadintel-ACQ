// Account → Activity — recent audit-log entries scoped to this customer.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { accountApi, ActivityEvent, MyCustomer } from "./accountApi";
import { Pill, ErrorBanner } from "../admin/AdminLayout";

export function ActivityTab({ cid, customer }: { cid: string; customer: MyCustomer }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const r = await accountApi.activity(cid);
      setLoading(false);
      if (r.ok) setEvents(r.data.events); else setError(r.error);
    })();
  }, [cid]);

  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: 4, fontSize: 22 }}>Activity</h2>
      <div style={{ color: COLORS.T3, fontSize: 12, marginBottom: 18 }}>
        Recent platform events for {customer.name} — wallet, team, GHL, access changes.
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, overflow: "hidden" }}>
        {loading ? <div style={{ padding: 24, textAlign: "center", color: COLORS.T3 }}>Loading…</div>
          : events.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: COLORS.T3 }}>No recent activity.</div>
          : events.map((e, i) => (
            <div key={e.id} style={{
              display: "grid", gridTemplateColumns: "190px 220px 1fr 160px",
              padding: "10px 18px", borderTop: i === 0 ? "none" : `1px solid ${COLORS.B2}`,
              fontSize: 12, alignItems: "center", gap: 10,
            }}>
              <div style={{ fontFamily: "ui-monospace, monospace", color: COLORS.T3 }}>{new Date(e.created_at).toLocaleString()}</div>
              <div>
                <Pill color={actionColor(e.action)}>{e.action.replace(/_/g, " ")}</Pill>
              </div>
              <div style={{ color: COLORS.T2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {summary(e)}
              </div>
              <div style={{ fontSize: 11, color: COLORS.T3, textAlign: "right" }}>
                {e.actor_email || (e.product ? `from ${e.product}` : "—")}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function actionColor(action: string): string {
  if (action.includes("revoked") || action.includes("removed") || action.includes("deleted")) return "#ff7a7a";
  if (action.includes("granted") || action.includes("created") || action.includes("invited")) return "#7eb56a";
  if (action.includes("wallet") || action.includes("topup") || action.includes("billing")) return "#f5d68a";
  if (action.includes("ghl")) return "#5fb1c9";
  return "#888";
}

function summary(e: ActivityEvent): string {
  const m = e.metadata || {};
  const parts: string[] = [];
  if (m.product)        parts.push(String(m.product));
  if (m.amount_cents != null) parts.push(`$${(Number(m.amount_cents) / 100).toFixed(2)}`);
  if (m.email)          parts.push(String(m.email));
  if (m.token_last_4)   parts.push(`token ending ${m.token_last_4}`);
  if (parts.length === 0) return Object.keys(m).length === 0 ? "—" : JSON.stringify(m).slice(0, 100);
  return parts.join(" · ");
}
