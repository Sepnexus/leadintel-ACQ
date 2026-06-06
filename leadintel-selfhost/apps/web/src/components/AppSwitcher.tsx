/**
 * AppSwitcher — floating chip top-right.
 * Reads peer JWT from localStorage (stashed by the launcher's cc_sso handoff)
 * and builds proper #cc_sso= URLs so switching apps does NOT trigger a re-login.
 *
 * Env vars (VITE_*, baked at build time):
 *   VITE_OTHER_APP_URL   — the sibling app's frontend URL
 *   VITE_OTHER_APP_NAME  — friendly name shown in the dropdown
 *   VITE_OTHER_APP_KEY   — "acq" | "leadintel" — used to read cc_peer_<key>
 *   VITE_LAUNCHER_URL    — the platform launcher URL
 *   VITE_THIS_APP_KEY    — "acq" | "leadintel" — used to read the SDK token
 */
import { useState } from "react";

const OTHER_APP_URL =  import.meta.env.VITE_OTHER_APP_URL  as string | undefined;
const OTHER_APP_NAME = (import.meta.env.VITE_OTHER_APP_NAME as string | undefined) ?? "Other App";
const OTHER_APP_KEY  = (import.meta.env.VITE_OTHER_APP_KEY  as string | undefined) ?? "acq";
const LAUNCHER_URL =   import.meta.env.VITE_LAUNCHER_URL   as string | undefined;
const THIS_APP_KEY  =  (import.meta.env.VITE_THIS_APP_KEY  as string | undefined) ?? "leadintel";

interface StoredSession {
  access_token: string;
  refresh_token: string;
}

// Build the #cc_sso= handoff URL the launcher uses. Mirrors auth.ts:buildSsoLink.
function buildHandoff(appUrl: string, primary: StoredSession, peer: StoredSession | null): string {
  const payload: any = {
    access_token: primary.access_token,
    refresh_token: primary.refresh_token,
  };
  if (peer?.access_token) {
    payload.peers = { [THIS_APP_KEY]: { access_token: peer.access_token, refresh_token: peer.refresh_token } };
  }
  // Propagate theme so switching apps doesn't flip to the wrong mode.
  try {
    const t = document.documentElement.getAttribute("data-theme") || localStorage.getItem("acqcoach_theme");
    if (t) payload.theme = t;
  } catch { /* noop */ }
  return `${appUrl}/#cc_sso=${encodeURIComponent(btoa(JSON.stringify(payload)))}`;
}

function readJsonItem(key: string): StoredSession | null {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

// SDK's storage key — the launcher writes here on cc_sso consume.
// "sb-<hostname-first-segment>-auth-token". For VPS this is the API subdomain.
function getThisAppSession(): StoredSession | null {
  const apiUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  let projectRef = "localhost";
  try {
    const u = new URL(apiUrl);
    projectRef = u.hostname.split(".")[0] || "localhost";
  } catch { /* keep default */ }
  return readJsonItem(`sb-${projectRef}-auth-token`);
}

function getOtherAppSession(): StoredSession | null {
  return readJsonItem(`cc_peer_${OTHER_APP_KEY}`);
}

export function AppSwitcher() {
  const [open, setOpen] = useState(false);

  if (!OTHER_APP_URL && !LAUNCHER_URL) return null;

  function switchToOther() {
    if (!OTHER_APP_URL) return;
    const peer = getOtherAppSession();
    const self = getThisAppSession();
    if (peer) {
      // peer token is what the OTHER app will use as its primary session
      window.location.href = buildHandoff(OTHER_APP_URL, peer, self);
    } else {
      // No peer token (user might not have access to the other app or
      // came here from outside the launcher). Fall back to launcher
      // so they re-handoff cleanly instead of seeing a login form.
      window.location.href = LAUNCHER_URL ? `${LAUNCHER_URL}?goto=${OTHER_APP_KEY}` : OTHER_APP_URL;
    }
  }

  function goToAccount() {
    if (!LAUNCHER_URL) return;
    window.location.href = `${LAUNCHER_URL}/#/account`;
  }

  function goToLauncher() {
    if (!LAUNCHER_URL) return;
    window.location.href = LAUNCHER_URL;
  }

  function signOut() {
    try {
      // Clear this app's SDK storage + any peer tokens
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith("sb-") || k.startsWith("cc_peer_") || k.startsWith("cc_sso_")) {
          localStorage.removeItem(k);
        }
      });
    } catch { /* noop */ }
    // Bounce to the launcher's login screen.
    window.location.href = LAUNCHER_URL || "/";
  }

  return (
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 9999,
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Switch app"
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)",
          color: "#222", fontSize: 12, fontWeight: 600,
          padding: "6px 10px", borderRadius: 999, cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "#00b878", display: "inline-block" }} />
        Lead Intel
        <span style={{ opacity: 0.5, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 220,
            background: "white", color: "#222",
            border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)", padding: 6, fontSize: 13,
          }}
        >
          {OTHER_APP_URL && (
            <button
              onClick={switchToOther}
              style={menuRowStyle}
              onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >↗ Switch to {OTHER_APP_NAME}</button>
          )}
          {LAUNCHER_URL && (
            <button
              onClick={goToAccount}
              style={menuRowStyle}
              onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >⚙ Your Account (team · billing · GHL)</button>
          )}
          {LAUNCHER_URL && (
            <button
              onClick={goToLauncher}
              style={menuRowStyle}
              onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >⌂ Platform launcher</button>
          )}
          <div style={{ height: 1, background: "#eee", margin: "4px 0" }} />
          <button
            onClick={signOut}
            style={{ ...menuRowStyle, color: "#c33" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >↪ Sign out</button>
        </div>
      )}
    </div>
  );
}

const menuRowStyle: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "8px 10px", borderRadius: 6, border: "none",
  background: "transparent", color: "#222",
  fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
