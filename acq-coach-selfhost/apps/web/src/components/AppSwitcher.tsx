/**
 * AppSwitcher — floating chip that lets the user jump to the sibling app or
 * back to the platform launcher.
 *
 * SSO-aware: when this app was opened via the unified launcher, a peer token
 * for the sibling app is stored in localStorage as cc_peer_leadintel. If that
 * key is present, "Switch to Lead Intel" opens with a proper SSO handoff link
 * (so the user lands already signed in). If absent, the option is hidden —
 * either the user has no Lead Intel access, or they loaded the app directly
 * rather than via the launcher.
 *
 * Reads build-time env vars:
 *   VITE_OTHER_APP_URL   — Lead Intel base URL
 *   VITE_OTHER_APP_NAME  — "Lead Intel"
 *   VITE_LAUNCHER_URL    — Platform launcher URL
 */
import { useEffect, useState } from "react";

const OTHER_APP_URL =  import.meta.env.VITE_OTHER_APP_URL  as string | undefined;
const OTHER_APP_NAME = (import.meta.env.VITE_OTHER_APP_NAME as string | undefined) ?? "Other App";
const LAUNCHER_URL =   import.meta.env.VITE_LAUNCHER_URL   as string | undefined;

function buildPeerSsoLink(peerKey: string, baseUrl: string): string | null {
  try {
    const raw = localStorage.getItem(`cc_peer_${peerKey}`);
    if (!raw) return null;
    const peer = JSON.parse(raw);
    if (!peer?.access_token) return null;
    const payload = btoa(JSON.stringify({
      access_token: peer.access_token,
      refresh_token: peer.refresh_token,
    }));
    return `${baseUrl}/#cc_sso=${encodeURIComponent(payload)}`;
  } catch {
    return null;
  }
}

export function AppSwitcher() {
  const [open, setOpen] = useState(false);
  // The link used for "Switch to Lead Intel":
  //   • If a peer SSO token is in localStorage → direct handoff (lands logged in).
  //   • Otherwise → route through the launcher (`?goto=leadintel`), which holds
  //     the canonical Lead Intel session and redirects with a fresh handoff.
  //     This keeps the option available even after the peer token is lost
  //     (e.g. a localStorage clear, or a direct login that bypassed the launcher).
  const [switchLink, setSwitchLink] = useState<string | null>(null);

  useEffect(() => {
    if (!OTHER_APP_URL) { setSwitchLink(null); return; }
    const direct = buildPeerSsoLink("leadintel", OTHER_APP_URL);
    if (direct) { setSwitchLink(direct); return; }
    // Fallback: launcher-mediated switch (launcher has the LI session).
    setSwitchLink(LAUNCHER_URL ? `${LAUNCHER_URL}/?goto=leadintel` : null);
  }, []);

  // Only render if there's something to show.
  if (!LAUNCHER_URL && !switchLink) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        title="Switch app"
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          color: "#222",
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 10px",
          borderRadius: 999,
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "#00b878", display: "inline-block" }} />
        ACQ Coach
        <span style={{ opacity: 0.5, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            minWidth: 200,
            background: "white",
            color: "#222",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 10,
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            padding: 6,
            fontSize: 13,
          }}
          onMouseLeave={() => setOpen(false)}
        >
          {/* Switch to Lead Intel — direct SSO if peer token present, else via launcher */}
          {OTHER_APP_URL && switchLink && (
            <a
              href={switchLink}
              style={{ display: "block", padding: "8px 10px", borderRadius: 6, color: "#222", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ↗ Switch to {OTHER_APP_NAME}
            </a>
          )}
          {LAUNCHER_URL && (
            <a
              href={LAUNCHER_URL}
              style={{ display: "block", padding: "8px 10px", borderRadius: 6, color: "#222", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ⌂ Platform launcher
            </a>
          )}
        </div>
      )}
    </div>
  );
}
