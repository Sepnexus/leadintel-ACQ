import { useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { useSyncHistory, type SyncHistoryRow } from "@/hooks/useSyncHistory";

function StatusPill({ status }: { status: SyncHistoryRow["status"] }) {
  const map: Record<SyncHistoryRow["status"], { bg: string; fg: string }> = {
    success: { bg: COLORS.GRN + "30", fg: COLORS.GRN },
    failed:  { bg: COLORS.RED + "30", fg: COLORS.RED },
    partial: { bg: COLORS.AMB + "30", fg: COLORS.AMB },
    running: { bg: COLORS.BLU + "30", fg: COLORS.BLU },
  };
  const s = map[status];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      background: s.bg, color: s.fg, fontSize: 10, fontWeight: 600,
      letterSpacing: 0.4, textTransform: "uppercase",
    }}>{status}</span>
  );
}

function fmtDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function TenantSyncHistoryTab({ tenantId }: { tenantId: string }) {
  const { rows, loading } = useSyncHistory(tenantId, 50);
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) return <div style={{ color: COLORS.T2, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{
      background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 10, overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: COLORS.S2, color: COLORS.T2, textAlign: "left" }}>
            {["Started", "Resource", "Mode", "Source", "By", "Status", "Duration"].map((h) => (
              <th key={h} style={{ padding: "10px 12px", fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = openId === r.id;
            return (
              <>
                <tr key={r.id}
                    onClick={() => setOpenId(open ? null : r.id)}
                    style={{ borderTop: "1px solid " + COLORS.B1, cursor: "pointer", color: COLORS.TEXT }}>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{new Date(r.started_at).toLocaleString()}</td>
                  <td style={{ padding: "10px 12px" }}>{r.resource}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{r.mode}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{r.trigger_source}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2, fontSize: 11 }}>{r.triggered_by_email ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}><StatusPill status={r.status} /></td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{fmtDuration(r.duration_ms)}</td>
                </tr>
                {open && (
                  <tr key={r.id + "-detail"}>
                    <td colSpan={7} style={{ background: COLORS.S2, padding: 16, borderTop: "1px solid " + COLORS.B1 }}>
                      {r.error_message && (
                        <div style={{ color: COLORS.RED, fontSize: 12, marginBottom: 10 }}>
                          <strong>Error:</strong> {r.error_message}
                        </div>
                      )}
                      <pre style={{
                        margin: 0, fontSize: 11, color: COLORS.T2,
                        background: COLORS.S1, padding: 10, borderRadius: 6,
                        maxHeight: 300, overflow: "auto",
                      }}>{JSON.stringify(r.stats ?? {}, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: COLORS.T3 }}>No sync history yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}