import { useState } from "react";
import { COLORS } from "./theme";
import { changePasswordBothBackends, currentEmail } from "./auth";
import type { LauncherConfig } from "./config";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

type Status = { type: "success" | "error"; msg: string } | null;

function Field({
  label, value, onChange, type = "text", readOnly = false, placeholder,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; readOnly?: boolean; placeholder?: string;
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
        onChange={e => onChange?.(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: readOnly ? COLORS.S2 + "88" : COLORS.S2,
          border: `1px solid ${COLORS.B1}`,
          borderRadius: 8,
          padding: "10px 13px",
          color: readOnly ? COLORS.T2 : COLORS.TEXT,
          fontSize: 13,
          outline: "none",
          fontFamily: FONT,
          cursor: readOnly ? "default" : "text",
        }}
      />
    </div>
  );
}

export function AccountSettings({ cfg, onClose }: { cfg: LauncherConfig; onClose: () => void }) {
  const email = currentEmail();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  function validate(): string | null {
    if (!current) return "Enter your current password.";
    if (next.length < 6) return "New password must be at least 6 characters.";
    if (next !== confirm) return "New passwords don't match.";
    if (next === current) return "New password must differ from the current one.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const err = validate();
    if (err) { setStatus({ type: "error", msg: err }); return; }
    setLoading(true);
    const result = await changePasswordBothBackends(cfg, current, next);
    setLoading(false);
    if (result.ok) {
      setStatus({ type: "success", msg: "Password updated on all apps. Use your new password next time you sign in." });
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      setStatus({ type: "error", msg: result.error });
    }
  }

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: FONT,
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420,
          background: COLORS.S1,
          border: `1px solid ${COLORS.B2}`,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${COLORS.B1}` }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.TEXT, letterSpacing: "0.02em" }}>
            Account Settings
          </span>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: COLORS.T3, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          {/* Email (read-only) */}
          <Field label="Email" value={email} readOnly />

          <div style={{ height: 1, background: COLORS.B1, margin: "6px 0 18px" }} />

          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.TEXT, marginBottom: 14, letterSpacing: "0.02em" }}>
            Change Password
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.T3, marginBottom: 16, lineHeight: 1.6 }}>
            Your password is shared across ACQ Coach and Lead Intel. Changing it here updates both apps simultaneously.
          </div>

          <Field label="Current password"  value={current}  onChange={setCurrent}  type="password" placeholder="••••••••" />
          <Field label="New password"      value={next}     onChange={setNext}     type="password" placeholder="At least 6 characters" />
          <Field label="Confirm password"  value={confirm}  onChange={setConfirm}  type="password" placeholder="Repeat new password" />

          {status && (
            <div style={{
              background: status.type === "success" ? COLORS.GREEN + "18" : COLORS.RED + "18",
              border: `1px solid ${status.type === "success" ? COLORS.GREEN + "55" : COLORS.RED + "55"}`,
              color: status.type === "success" ? COLORS.GREEN : COLORS.RED,
              borderRadius: 8, padding: "10px 13px",
              fontSize: 12.5, lineHeight: 1.6, marginBottom: 14,
            }}>
              {status.type === "success" ? "✓ " : "⚠ "}{status.msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", background: COLORS.GREEN, border: "none",
              borderRadius: 8, padding: "12px",
              color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.65 : 1,
              letterSpacing: "0.04em",
            }}
          >
            {loading ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
