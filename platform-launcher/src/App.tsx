import { useEffect, useState } from "react";
import { loadConfig, type LauncherConfig } from "./config";
import { getSession, clearSessions, buildSsoLink, type ProductKey } from "./auth";
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
