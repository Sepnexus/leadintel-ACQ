// Profile tab — email (read-only), password change.
// Inline form (NOT a modal) so it renders properly inside AccountShell.

import { useState } from "react";
import { COLORS } from "../theme";
import type { LauncherConfig } from "../config";
import { changePasswordBothBackends, currentEmail } from "../auth";
import { Pill, ErrorBanner } from "../admin/AdminLayout";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

type Status = { type: "success" | "error"; msg: string } | null;

export function ProfileTab({ cfg }: { cfg: LauncherConfig }) {
  const email = currentEmail();
  const [currentPw, setCurrent] = useState("");
  const [newPw, setNew]         = useState("");
  const [confirmPw, setConfirm] = useState("");
  const [busy, setBusy]         = useState(false);
  const [status, setStatus]     = useState<Status>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (newPw.length < 6)     { setStatus({ type: "error", msg: "New password must be at least 6 characters." }); return; }
    if (newPw !== confirmPw)  { setStatus({ type: "error", msg: "Confirmation doesn't match." }); return; }
    setBusy(true);
    const r = await changePasswordBothBackends(cfg, currentPw, newPw);
    setBusy(false);
    if (r.ok) {
      setStatus({ type: "success", msg: "Password updated everywhere (platform + ACQ + LI)." });
      setCurrent(""); setNew(""); setConfirm("");
    } else {
      setStatus({ type: "error", msg: r.error });
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ margin: 0, fontSize: 22 }}>Profile</h2>
      <div style={{ color: COLORS.T3, fontSize: 12, marginTop: 4, marginBottom: 22 }}>
        Your platform identity — used to sign in to ACQ Coach + Lead Intel.
      </div>

      {/* Identity card */}
      <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, padding: 22, marginBottom: 18 }}>
        <Field label="Email" value={email} readOnly />
        <div style={{ fontSize: 11, color: COLORS.T3, marginTop: -8, marginBottom: 6 }}>
          To change your email, contact your platform admin.
        </div>
      </div>

      {/* Password card */}
      <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Change password</div>
          <Pill color={COLORS.GREEN}>shared</Pill>
        </div>
        <div style={{ fontSize: 11, color: COLORS.T3, marginBottom: 16 }}>
          Updates platform-auth, ACQ Coach, and Lead Intel — all three at once.
        </div>

        <form onSubmit={submit}>
          <Field label="Current password" value={currentPw} onChange={setCurrent} type="password" autoComplete="current-password" />
          <Field label="New password"     value={newPw}     onChange={setNew}     type="password" autoComplete="new-password" placeholder="≥ 6 characters" />
          <Field label="Confirm new"      value={confirmPw} onChange={setConfirm} type="password" autoComplete="new-password" />

          {status && (
            status.type === "error"
              ? <ErrorBanner>{status.msg}</ErrorBanner>
              : <div style={{ marginBottom: 12, padding: "10px 14px", border: "1px solid #2c5", borderRadius: 6, color: "#cfe", background: "#143a14", fontSize: 13 }}>{status.msg}</div>
          )}

          <button type="submit" disabled={busy} style={{
            background: COLORS.GREEN, color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.5 : 1, fontFamily: FONT,
          }}>{busy ? "Updating…" : "Update password"}</button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", readOnly, placeholder, autoComplete,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; readOnly?: boolean; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.T3, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 5 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={e => onChange?.(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          background: readOnly ? COLORS.B2 + "88" : COLORS.B2,
          border: `1px solid ${COLORS.B3}`, borderRadius: 8,
          padding: "10px 13px",
          color: readOnly ? COLORS.T2 : COLORS.TEXT,
          fontSize: 13, outline: "none", fontFamily: FONT,
          cursor: readOnly ? "default" : "text",
        }}
      />
    </div>
  );
}
