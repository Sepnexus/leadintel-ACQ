import { useEffect, useState } from "react";
import { loadConfig, type LauncherConfig } from "./config";
import { getSession, clearSessions, buildSsoLink, type ProductKey } from "./auth";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { AdminShell } from "./admin/AdminShell";
import { COLORS } from "./theme";

export function App() {
  const [cfg, setCfg] = useState<LauncherConfig | null>(null);
  const [authed, setAuthed] = useState<boolean>(
    () => !!getSession("acq") || !!getSession("leadintel")
  );
  const [showAdmin, setShowAdmin] = useState<boolean>(
    () => window.location.hash.startsWith("#/admin")
  );

  useEffect(() => {
    loadConfig().then(setCfg);
  }, []);

  // Reflect URL hash → admin view toggle (so Back/Forward + reload work)
  useEffect(() => {
    const onHash = () => setShowAdmin(window.location.hash.startsWith("#/admin"));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // ── Deep-link switch: ?goto=<product> ────────────────────────────────────────
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
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [cfg]);

  if (!cfg) {
    return <div style={{ minHeight: "100vh", background: COLORS.BG }} />;
  }
  if (!authed) {
    return <Login cfg={cfg} onAuthed={() => setAuthed(true)} />;
  }
  if (showAdmin) {
    return (
      <AdminShell
        onClose={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setShowAdmin(false);
        }}
      />
    );
  }
  return (
    <Dashboard
      cfg={cfg}
      onLogout={() => {
        clearSessions();
        setAuthed(false);
      }}
      onOpenAdmin={() => {
        window.location.hash = "#/admin/users";
        setShowAdmin(true);
      }}
    />
  );
}
