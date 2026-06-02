import { useState } from "react";
import { COLORS, applyTheme, getInitialTheme } from "./theme";
import { dualLogin } from "./auth";
import type { LauncherConfig } from "./config";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export function Login({ cfg, onAuthed }: { cfg: LauncherConfig; onAuthed: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [theme, setTheme] = useState(getInitialTheme());

  function toggleTheme() {
    const n = theme === "dark" ? "light" : "dark";
    applyTheme(n);
    setTheme(n);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await dualLogin(cfg, email.trim(), password);
      if (!r.acq && !r.leadintel) {
        setErr(r.errors.acq || r.errors.leadintel || "Login failed");
        setLoading(false);
        return;
      }
      onAuthed();
    } catch (ex: any) {
      setErr(String(ex?.message || ex));
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        padding: 20,
      }}
    >
      <button
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          background: "transparent",
          border: `1px solid ${COLORS.B1}`,
          borderRadius: 8,
          padding: "6px 10px",
          color: COLORS.T2,
          fontSize: 15,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              border: `1px solid ${COLORS.B2}`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
              color: COLORS.GREEN,
              letterSpacing: "0.04em",
              marginBottom: 14,
            }}
          >
            CC
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: COLORS.TEXT, letterSpacing: "0.04em" }}>
            CLOSER CONTROL
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.T3, marginTop: 4 }}>
            Sign in to your platform
          </div>
        </div>

        <form
          onSubmit={submit}
          style={{
            background: COLORS.S1,
            border: `1px solid ${COLORS.B1}`,
            borderRadius: 14,
            padding: 22,
          }}
        >
          <label style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.T3, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 6,
              marginBottom: 16,
              background: COLORS.S2,
              border: `1px solid ${COLORS.B1}`,
              borderRadius: 8,
              padding: "11px 13px",
              color: COLORS.TEXT,
              fontSize: 13,
              outline: "none",
              fontFamily: FONT,
            }}
          />
          <label style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.T3, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 6,
              marginBottom: 18,
              background: COLORS.S2,
              border: `1px solid ${COLORS.B1}`,
              borderRadius: 8,
              padding: "11px 13px",
              color: COLORS.TEXT,
              fontSize: 13,
              outline: "none",
              fontFamily: FONT,
            }}
          />

          {err && (
            <div
              style={{
                background: COLORS.RED + "18",
                border: `1px solid ${COLORS.RED}40`,
                color: COLORS.RED,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: "100%",
              background: COLORS.GREEN,
              border: "none",
              borderRadius: 8,
              padding: "12px",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              opacity: loading || !email || !password ? 0.6 : 1,
              letterSpacing: "0.04em",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: COLORS.T3, lineHeight: 1.6 }}>
          One login for ACQ Coach &amp; Lead Intel.
        </div>
      </div>
    </div>
  );
}
