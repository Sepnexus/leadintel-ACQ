// Shared shell for the admin pages — top tabs + page slot.

import { ReactNode } from "react";
import { COLORS } from "../theme";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export type AdminTab = "users" | "customers" | "audit" | "settings";

export function AdminLayout({
  tab, onTab, onClose, children,
}: { tab: AdminTab; onTab: (t: AdminTab) => void; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.BG, color: COLORS.TEXT, fontFamily: FONT }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: `1px solid ${COLORS.B2}`, background: COLORS.S1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: `1px solid ${COLORS.B3}`,
              borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
              fontSize: 12, cursor: "pointer", fontFamily: FONT,
            }}
          >← Back</button>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.02em" }}>Platform Admin</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["users", "customers", "audit", "settings"] as AdminTab[]).map(t => (
            <button
              key={t}
              onClick={() => onTab(t)}
              style={{
                background: tab === t ? COLORS.B2 : "transparent",
                border: `1px solid ${tab === t ? COLORS.GREEN : COLORS.B3}`,
                color: tab === t ? COLORS.GREEN : COLORS.T2,
                borderRadius: 6, padding: "6px 14px", fontSize: 12,
                cursor: "pointer", fontFamily: FONT, fontWeight: 600,
                textTransform: "capitalize",
              }}
            >{t}</button>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>{children}</div>
    </div>
  );
}

// ── Shared bits ──
export function Pill({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 999,
      background: COLORS.B2, border: `1px solid ${color ?? COLORS.B3}`,
      color: color ?? COLORS.T2, fontFamily: "ui-monospace, monospace",
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>{children}</span>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (next: boolean) => void; label?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onChange(!value)}
        aria-label="toggle"
        style={{
          width: 36, height: 20, borderRadius: 999,
          background: value ? COLORS.GREEN : COLORS.B3, border: "none",
          position: "relative", cursor: "pointer", padding: 0,
          transition: "background 0.15s ease",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.15s ease",
        }}/>
      </button>
      {label && <span style={{ fontSize: 12, color: COLORS.T2 }}>{label}</span>}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: "10px 14px", border: "1px solid #c34", borderRadius: 6,
      color: "#fee", background: "#3a1414", fontSize: 13, marginBottom: 16,
    }}>{children}</div>
  );
}
