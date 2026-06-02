import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "./integrations/supabase/client";

// ── Logout chain ──────────────────────────────────────────────────────────────
// When the launcher signs out it navigates here with ?logout=true.
// We clear this app's auth, then pass the chain on to Lead Intel.
// Returns true if a redirect was issued (bootstrap should stop).
function handleLogoutChain(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("logout") !== "true") return false;

  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith("sb-") || k.startsWith("cc_"))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }

  const liUrl = (import.meta.env.VITE_OTHER_APP_URL as string | undefined) || "http://localhost:3101";
  window.location.replace(`${liUrl}/?logout=true`);
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
      if (decoded.peers?.leadintel?.access_token) {
        localStorage.setItem("cc_peer_leadintel", JSON.stringify(decoded.peers.leadintel));
      } else {
        localStorage.removeItem("cc_peer_leadintel");
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

function applySavedAdminTheme() {
  try {
    const t = localStorage.getItem("acqcoach_theme") || "dark";
    document.documentElement.classList.toggle("cc-theme-light", t === "light");
  } catch { /* noop */ }
}

async function bootstrap() {
  if (handleLogoutChain()) return; // redirect in progress — stop here
  await consumeSsoHandoff();
  applySavedAdminTheme();
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
