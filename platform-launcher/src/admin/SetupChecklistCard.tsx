// Customer onboarding checklist on the Platform Admin → Customer detail page.
// Shows green-check / red-dot for each post-creation step + deep-links into
// the app to finish the module-specific config (pipelines in LI, reps in ACQ).
// Polls every 8s while not-done so admins see sync progress without refresh.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { adminApi } from "./adminApi";

type Step = { id: string; label: string; done: boolean; detail: string; deep_link?: string };

export function SetupChecklistCard({ customerId }: { customerId: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [allDone, setAllDone] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await adminApi.setupStatus(customerId);
    if (r.ok) { setSteps(r.data.steps); setAllDone(r.data.all_done); }
    setLoading(false);
  }
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!allDone) load(); }, 8_000);
    return () => clearInterval(t);
  }, [customerId, allDone]);

  if (loading && steps.length === 0) return null;

  const doneCount = steps.filter(s => s.done).length;

  return (
    <div style={{
      background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10,
      marginBottom: 18, overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Setup checklist</div>
          <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3 }}>
            {allDone
              ? "✓ All onboarding steps complete. Customer is fully wired."
              : `${doneCount} of ${steps.length} steps complete. Polling every 8s while sync runs.`}
          </div>
        </div>
        <button onClick={load} style={{
          background: COLORS.B2, border: `1px solid ${COLORS.B3}`, borderRadius: 6,
          padding: "6px 12px", color: COLORS.T2, fontSize: 12, cursor: "pointer",
        }}>↻ Refresh</button>
      </div>
      {steps.map((s, i) => (
        <div key={s.id} style={{
          display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 20px",
          borderTop: i === 0 ? "none" : `1px solid ${COLORS.B2}`,
        }}>
          <div style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: 999,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: s.done ? COLORS.GREEN : COLORS.B2,
            color: s.done ? "#fff" : COLORS.T3,
            fontSize: 13, fontWeight: 700, border: `1px solid ${s.done ? COLORS.GREEN : COLORS.B3}`,
          }}>{s.done ? "✓" : "○"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: s.done ? COLORS.TEXT : COLORS.TEXT,
              textDecoration: s.done ? "line-through" : "none",
              textDecorationColor: COLORS.T3,
            }}>{s.label}</div>
            <div style={{ fontSize: 11.5, color: COLORS.T3, marginTop: 3, lineHeight: 1.5 }}>{s.detail}</div>
          </div>
          {s.deep_link && !s.done && (
            <a href={s.deep_link} target="_blank" rel="noreferrer" style={{
              flexShrink: 0, background: COLORS.B2, border: `1px solid ${COLORS.B3}`,
              borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
              fontSize: 11, textDecoration: "none", fontWeight: 600,
              alignSelf: "center",
            }}>Open →</a>
          )}
        </div>
      ))}
    </div>
  );
}
