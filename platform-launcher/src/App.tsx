import { useEffect, useState } from "react";
import { loadConfig, type LauncherConfig } from "./config";
import {
  getSession, saveSession, clearSessions, buildSsoLink,
  refreshSession, jwtNeedsRefresh, type ProductKey,
} from "./auth";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { AdminShell } from "./admin/AdminShell";
import { AccountShell } from "./account/AccountShell";
import { COLORS } from "./theme";

type View = "dashboard" | "admin" | "account";

function viewFromHash(): View {
  const h = window.location.hash;
  if (h.startsWith("#/admin"))   return "admin";
  if (h.startsWith("#/account")) return "account";
  return "dashboard";
}

export function App() {
  const [cfg, setCfg] = useState<LauncherConfig | null>(null);
  const [authed, setAuthed] = useState<boolean>(
    () => !!getSession("acq") || !!getSession("leadintel")
  );
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => { loadConfig().then(setCfg); }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // ── Deep-link switch: ?goto=<product> ────────────────────────────────────────
  // Used by the Setup Checklist's "Open →" buttons and any other launcher-
  // mediated app-switch. Flow: pull saved session → refresh if access_token
  // is stale → handoff to the app via #cc_sso=<base64>. If refresh fails
  // entirely (refresh_token also dead), wipe local state and force re-login
  // — otherwise the receiving app would just bounce the user to its own
  // login page, which is exactly the bug we're fixing.
  useEffect(() => {
    if (!cfg) return;
    const goto = new URLSearchParams(window.location.search).get("goto");
    if (goto !== "acq" && goto !== "leadintel") return;
    const key = goto as ProductKey;

    (async () => {
      let session = getSession(key);
      if (!session) {
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      // Refresh-before-handoff: avoids the "expired token → login page" trap
      // when the user has been on the launcher for >1h.
      if (jwtNeedsRefresh(session.access_token)) {
        const fresh = await refreshSession(cfg.platformAuthUrl, session.refresh_token);
        if (fresh) {
          // Same JWT_SECRET + same session_id → both apps' SDKs accept it.
          // Store under both keys so the peer link in the receiving app's
          // AppSwitcher also has a non-stale token.
          saveSession("acq", fresh);
          saveSession("leadintel", fresh);
          session = fresh;
        } else {
          // refresh_token also dead → can't SSO. Wipe + force fresh login.
          clearSessions();
          setAuthed(false);
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }

      const url = key === "acq" ? cfg.acqUrl : cfg.leadintelUrl;
      const peerKey: ProductKey = key === "acq" ? "leadintel" : "acq";
      window.location.replace(buildSsoLink(url, session, { [peerKey]: getSession(peerKey) }));
    })().catch(e => {
      console.error("[launcher] goto handoff failed:", e);
      window.history.replaceState(null, "", window.location.pathname);
    });
  }, [cfg]);

  function backToDashboard() {
    window.location.hash = "";
    window.history.replaceState(null, "", window.location.pathname);
    setView("dashboard");
  }

  if (!cfg)    return <div style={{ minHeight: "100vh", background: COLORS.BG }} />;
  if (!authed) return <Login cfg={cfg} onAuthed={() => setAuthed(true)} />;

  if (view === "admin")   return <AdminShell onClose={backToDashboard} />;
  if (view === "account") return <AccountShell cfg={cfg} onClose={backToDashboard} />;

  return (
    <Dashboard
      cfg={cfg}
      onLogout={() => { clearSessions(); setAuthed(false); }}
      onOpenAdmin={() => {
        window.location.hash = "#/admin/users";
        setView("admin");
      }}
      onOpenAccount={() => {
        window.location.hash = "#/account/profile";
        setView("account");
      }}
    />
  );
}
