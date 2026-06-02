import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "./integrations/supabase/client";

// ── Logout chain ──────────────────────────────────────────────────────────────
// ACQ Coach forwards here with ?logout=true after clearing its own session.
// We clear Lead Intel's session then redirect back to the launcher.
// Returns true if a redirect was issued (bootstrap should stop).
function handleLogoutChain(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("logout") !== "true") return false;

  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith("sb-") || k.startsWith("cc_"))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }

  const launcherUrl = (import.meta.env.VITE_LAUNCHER_URL as string | undefined) || "http://localhost:8080";
  window.location.replace(launcherUrl);
  return true;
}

// ── Unified-launcher SSO handoff ──────────────────────────────────────────────
async function consumeSsoHandoff() {
  try {
    const m = window.location.hash.match(/cc_sso=([^&]+)/);
    if (!m) return;

    const decoded = JSON.parse(atob(decodeURIComponent(m[1])));
    if (!decoded?.access_token || !decoded?.refresh_token) return;

    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("sb-"))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* noop */ }

    const { error } = await supabase.auth.setSession({
      access_token: decoded.access_token,
      refresh_token: decoded.refresh_token,
    });
    if (error) console.warn("[sso] setSession failed:", error.message);

    try {
      if (decoded.peers?.acq?.access_token) {
        localStorage.setItem("cc_peer_acq", JSON.stringify(decoded.peers.acq));
      } else {
        localStorage.removeItem("cc_peer_acq");
      }
    } catch { /* noop */ }

  } catch (e) {
    console.warn("[sso] handoff failed:", e);
  } finally {
    if (window.location.hash.includes("cc_sso")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }
}

async function bootstrap() {
  if (handleLogoutChain()) return; // redirect in progress — stop here
  await consumeSsoHandoff();
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
