import { useMemo, useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { AdminLayout } from "./AdminLayout";
import { useAuditLog, type AuditLogRow } from "@/hooks/useAuditLog";

const ACTION_LABELS: Record<string, string> = {
  "tenant.created": "Created tenant",
  "tenant.updated": "Updated tenant",
  "tenant.disabled": "Disabled tenant",
  "tenant.reactivated": "Reactivated tenant",
  "tenant.token_rotated": "Rotated GHL token",
  "sync.triggered": "Triggered sync",
  "role.changed": "Changed user role",
  "login.super_admin": "Super admin sign-in",
};

const ACTION_FILTER_OPTIONS = Object.keys(ACTION_LABELS);

function fmtRelative(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function MetadataView({ md }: { md: Record<string, any> | null }) {
  if (!md || Object.keys(md).length === 0) return <span style={{ color: COLORS.T3 }}>—</span>;
  return (
    <div style={{ fontSize: 11, color: COLORS.T2 }}>
      {Object.entries(md).map(([k, v]) => (
        <div key={k}><span style={{ color: COLORS.T3 }}>{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}</div>
      ))}
    </div>
  );
}

export default function AdminAuditPage() {
  const [from, setFrom] = useState<string>(defaultFromDate());
  const [to, setTo] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filters = useMemo(() => ({
    fromDate: from || undefined,
    toDate: to || undefined,
    action: action || undefined,
    page,
    pageSize,
  }), [from, to, action, page]);

  const { rows, count, loading } = useAuditLog(filters);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const inputStyle: React.CSSProperties = {
    background: COLORS.S2, border: "1px solid " + COLORS.B2, color: COLORS.TEXT,
    padding: "6px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none",
  };

  return (
    <AdminLayout>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ color: COLORS.T2, fontSize: 11 }}>From
          <input
            type="datetime-local"
            value={from ? new Date(from).toISOString().slice(0, 16) : ""}
            onChange={(e) => { setFrom(e.target.value ? new Date(e.target.value).toISOString() : ""); setPage(0); }}
            style={{ ...inputStyle, marginLeft: 6 }}
          />
        </label>
        <label style={{ color: COLORS.T2, fontSize: 11 }}>To
          <input
            type="datetime-local"
            value={to ? new Date(to).toISOString().slice(0, 16) : ""}
            onChange={(e) => { setTo(e.target.value ? new Date(e.target.value).toISOString() : ""); setPage(0); }}
            style={{ ...inputStyle, marginLeft: 6 }}
          />
        </label>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0); }}
          style={inputStyle}
        >
          <option value="">All actions</option>
          {ACTION_FILTER_OPTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>
      </div>

      {loading && <div style={{ color: COLORS.T2, fontSize: 13 }}>Loading…</div>}
      {!loading && (
        <>
          <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: COLORS.S2, color: COLORS.T2, textAlign: "left" }}>
                  {["When", "Actor", "Action", "Target", "Details"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: AuditLogRow) => (
                  <tr key={r.id} style={{ borderTop: "1px solid " + COLORS.B1, color: COLORS.TEXT }}>
                    <td style={{ padding: "10px 12px", color: COLORS.T2 }} title={new Date(r.occurred_at).toLocaleString()}>
                      {fmtRelative(r.occurred_at)}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 11 }}>{r.actor_email ?? "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{ACTION_LABELS[r.action] ?? r.action}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.T2, fontFamily: "monospace", fontSize: 11 }}>
                      {r.target_type ? `${r.target_type}:${(r.target_id ?? "").slice(0, 8)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}><MetadataView md={r.metadata} /></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: COLORS.T3 }}>No entries.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: COLORS.T2, fontSize: 12 }}>
            <div>{count} total · page {page + 1} of {totalPages}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ ...inputStyle, cursor: page === 0 ? "not-allowed" : "pointer", opacity: page === 0 ? 0.5 : 1 }}
              >Prev</button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ ...inputStyle, cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", opacity: page >= totalPages - 1 ? 0.5 : 1 }}
              >Next</button>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}