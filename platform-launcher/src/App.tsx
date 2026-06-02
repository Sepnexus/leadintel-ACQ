import { useEffect, useState } from "react";
import { loadConfig, type LauncherConfig } from "./config";
import { getSession, clearSessions, buildSsoLink, type ProductKey } from "./auth";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { COLORS } from "./theme";

export function App() {
  const [cfg, setCfg] = useState<LauncherConfig | null>(null);
  const [authed, setAuthed] = useState<boolean>(
    () => !!getSession("acq") || !!getSession("leadintel")
  );

  useEffect(() => {
    loadConfig().then(setCfg);
  }, []);

  // ── Deep-link switch: ?goto=<product> ────────────────────────────────────────
  // The apps' AppSwitcher routes here when they don't hold a peer token.
  // We hold the canonical sessions, so redirect straight into the target app
  // with a fresh SSO handoff. If we have no session for it, fall through to the
  // normal dashboard/login (so the user isn't stuck on a broken link).
  useEffect(() => {
    if (!cfg) return;
    const goto = new URLSearchParams(window.location.search).get("goto");
    if (goto !== "acq" && goto !== "leadintel") return;
    const key = goto as ProductKey;
    const session = getSession(key);
    if (session) {
      const url = key === "acq" ? cfg.acqUrl : cfg.leadintelUrl;
      const peerKey: ProductKey = key === "acq" ? "leadintel" : "acq";
      window.location.replace(buildSsoLink(url, session, { [peerKey]: getSession(peerKey) }));
    } else {
      // No session for that product — strip the param and show the dashboard/login.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [cfg]);

  if (!cfg) {
    return <div style={{ minHeight: "100vh", background: COLORS.BG }} />;
  }
  if (!authed) {
    return <Login cfg={cfg} onAuthed={() => setAuthed(true)} />;
  }
  return (
    <Dashboard
      cfg={cfg}
      onLogout={() => {
        clearSessions();
        setAuthed(false);
      }}
    />
  );
}
