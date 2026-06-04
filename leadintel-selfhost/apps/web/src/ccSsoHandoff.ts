// Phase A8/C2 — Token handoff from the platform launcher.
//
// When the launcher's "Open App" link is clicked, the user lands here at:
//   http://acq.host/#cc_sso=<base64 of {access_token, refresh_token, peers?}>
//
// We need to consume that BEFORE Supabase tries to hydrate from localStorage,
// so the platform-issued JWT becomes the active session.
//
// Why we DON'T use supabase.auth.setSession():
//   The Supabase SDK's setSession() validates the JWT's `session_id` claim
//   against the LOCAL GoTrue's auth.sessions table. Since the token was
//   issued by platform-auth (a different GoTrue), the session row only
//   exists there — local GoTrue replies "Session from session_id claim
//   in JWT does not exist". The SDK then rejects the session.
//
//   Workaround: write the token directly to the SDK's storage key
//   (`sb-<hostname>-auth-token`). On the next page load the SDK reads it
//   and uses the JWT as a Bearer header for API calls. JWT signature
//   validation still works (shared secret). The session_id check only
//   fires on explicit refresh / getUser — by then the 1h token has
//   expired and the user re-handoffs via the launcher.
//
// Idempotent: clears the hash after consuming.

import { supabase as _supabase } from "./integrations/supabase/client";
void _supabase; // keep import for side-effects (SDK init)

const HASH_KEY = "cc_sso=";

type SsoPayload = {
  access_token: string;
  refresh_token: string;
  peers?: Record<string, { access_token: string; refresh_token: string }>;
};

function readPayload(): SsoPayload | null {
  const h = window.location.hash || "";
  const i = h.indexOf(HASH_KEY);
  if (i < 0) return null;
  const raw = h.slice(i + HASH_KEY.length).split("&")[0];
  try {
    const decoded = atob(decodeURIComponent(raw));
    const parsed = JSON.parse(decoded);
    if (parsed?.access_token && parsed?.refresh_token) return parsed as SsoPayload;
  } catch (e) {
    console.warn("[cc-sso] bad payload:", (e as Error).message);
  }
  return null;
}

function decodeJwt(jwt: string): any {
  try {
    const part = jwt.split(".")[1] || "";
    // base64url → base64
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (part.length % 4)) % 4);
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

function clearHash() {
  const { pathname, search } = window.location;
  history.replaceState(null, "", pathname + search);
}

export function consumeSsoHandoff(): boolean {
  const payload = readPayload();
  if (!payload) return false;

  // Stash peer tokens so AppSwitcher can build cross-app links from inside this app.
  if (payload.peers) {
    for (const [key, s] of Object.entries(payload.peers)) {
      if (s?.access_token) {
        try {
          localStorage.setItem(`cc_peer_${key}`, JSON.stringify({
            access_token: s.access_token,
            refresh_token: s.refresh_token,
          }));
        } catch { /* quota — non-fatal */ }
      }
    }
  }

  const claims = decodeJwt(payload.access_token);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = typeof claims.exp === "number" ? claims.exp : nowSec + 3600;

  const sessionShape = {
    access_token: payload.access_token,
    token_type: "bearer",
    expires_in: Math.max(60, expSec - nowSec),
    expires_at: expSec,
    refresh_token: payload.refresh_token,
    user: {
      id: claims.sub || "",
      aud: claims.aud || "authenticated",
      role: claims.role || "authenticated",
      email: claims.email || "",
      email_confirmed_at: new Date(nowSec * 1000).toISOString(),
      phone: claims.phone || "",
      confirmed_at: new Date(nowSec * 1000).toISOString(),
      last_sign_in_at: new Date(nowSec * 1000).toISOString(),
      app_metadata: claims.app_metadata || { provider: "email", providers: ["email"] },
      user_metadata: claims.user_metadata || { email_verified: true },
      identities: [],
      created_at: new Date(nowSec * 1000).toISOString(),
      updated_at: new Date(nowSec * 1000).toISOString(),
      is_anonymous: false,
    },
  };

  // SDK derives storage key as `sb-<projectRef>-auth-token`.
  // For non-Supabase-cloud URLs, projectRef is the URL's first hostname segment.
  // Our local URL is http://localhost:54421 → hostname `localhost` → key `sb-localhost-auth-token`.
  // On VPS this is e.g. `acq-api.sepnexus.com` → `acq-api` → `sb-acq-api-auth-token`.
  // We mirror the SDK's logic against the configured API URL (from import.meta.env).
  const apiUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  let projectRef = "localhost";
  try {
    const u = new URL(apiUrl);
    projectRef = u.hostname.split(".")[0] || "localhost";
  } catch { /* keep default */ }
  const storageKey = `sb-${projectRef}-auth-token`;

  try {
    localStorage.setItem(storageKey, JSON.stringify(sessionShape));
    console.log(`[cc-sso] session stored at ${storageKey} for ${claims.email}`);
  } catch (e) {
    console.error("[cc-sso] storage write failed:", (e as Error).message);
    return false;
  }

  clearHash();

  // Reload so the SDK picks up the freshly-stored session on init.
  // Without this, the SDK already initialized with empty storage and would
  // need a getSession() trigger to notice. Reload is the simplest, most
  // predictable path.
  setTimeout(() => window.location.reload(), 50);
  return true;
}
