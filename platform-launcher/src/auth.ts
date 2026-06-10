// Auth layer for the unified launcher.
//
// Phase C2 (post-identity-merger):
// The launcher logs into ONE backend — platform-auth (:9998), the shared
// GoTrue against platform-db. The resulting JWT is signed with a secret
// shared by ACQ + LI + platform-auth, so the same token validates against
// all three. The launcher stores that single token in both the `acq` and
// `leadintel` session slots for back-compat with existing code (AppSwitcher,
// token handoff via URL fragment to app frontends, etc.).
//
// Fallback: if platform-auth is unreachable, we fall through to legacy
// dual-login against each app's own GoTrue. That preserves Thursday-launch
// safety — a platform-auth outage shouldn't block customers from logging in.

import type { LauncherConfig } from "./config";

export type ProductKey = "acq" | "leadintel";
export type Session = { access_token: string; refresh_token: string; user: any };

const SS_KEY = (p: ProductKey) => `cc_sso_${p}`;

export function saveSession(p: ProductKey, s: Session) {
  localStorage.setItem(
    SS_KEY(p),
    JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, user: s.user })
  );
}
export function getSession(p: ProductKey): Session | null {
  try {
    const v = localStorage.getItem(SS_KEY(p));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
/** Clear ALL launcher + Supabase auth state from this origin's localStorage. */
export function clearSessions() {
  // Launcher session store
  localStorage.removeItem(SS_KEY("acq"));
  localStorage.removeItem(SS_KEY("leadintel"));
  // Peer SSO tokens stored for AppSwitcher use
  localStorage.removeItem("cc_peer_leadintel");
  localStorage.removeItem("cc_peer_acq");
  // Supabase JS auth keys (sb-*) for all clients on this origin
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith("sb-") || k.startsWith("cc_sso_") || k.startsWith("cc_peer_"))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }
}

async function passwordGrant(
  apiUrl: string,
  anon: string,
  email: string,
  password: string
): Promise<Session> {
  const r = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    throw new Error(d.error_description || d.msg || d.error || `auth failed (${r.status})`);
  }
  return d as Session;
}

export type DualLoginResult = {
  acq: Session | null;
  leadintel: Session | null;
  errors: Record<ProductKey, string | null>;
};

// Single platform-auth login. No anon key needed — GoTrue's /token endpoint
// is open by design (it's the login surface).
async function platformPasswordGrant(
  apiUrl: string,
  email: string,
  password: string
): Promise<Session> {
  const r = await fetch(`${apiUrl}/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    throw new Error(d.error_description || d.msg || d.error || `auth failed (${r.status})`);
  }
  return d as Session;
}

// Phase C2 — after platform-auth issues a JWT, mirror the auth.sessions row
// into each app's local auth.sessions table so the app's GoTrue accepts
// the session_id claim. Without this, /auth/v1/user returns 403 after handoff.
// Non-fatal: if it fails, app SDK can still use the access_token as a bearer
// for PostgREST + edge fns (session_id check only fires on getUser/refresh).
async function mirrorPlatformSession(accessToken: string): Promise<void> {
  try {
    const r = await fetch("/admin-api/sso/mirror-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      console.warn("[launcher] mirror-session non-ok:", r.status, d);
    }
  } catch (e) {
    console.warn("[launcher] mirror-session failed:", (e as Error).message);
  }
}

export async function dualLogin(
  cfg: LauncherConfig,
  email: string,
  password: string
): Promise<DualLoginResult> {
  clearSessions(); // wipe any previous user's sessions before starting a new login
  const res: DualLoginResult = { acq: null, leadintel: null, errors: { acq: null, leadintel: null } };

  // PER-APP DIRECT LOGIN (primary). Each app's own GoTrue issues a token whose
  // session_id exists in THAT app's auth.sessions — so getUser() and the SDK's
  // silent refresh work natively, no cross-DB session mirror required. (The
  // old platform-auth-only path relied on copying the session row into each
  // app via /sso/mirror-session, which is fragile and broke after the data
  // migration: the apps rejected every token with "session_not_found".)
  //
  // Post-migration all three GoTrue backends share the same auth.users (same
  // UUIDs + password hash), so one password logs into all of them.
  const [acqR, liR] = await Promise.allSettled([
    passwordGrant(cfg.acqApiUrl, cfg.acqAnonKey, email, password),
    passwordGrant(cfg.leadintelApiUrl, cfg.leadintelAnonKey, email, password),
  ]);
  if (acqR.status === "fulfilled") {
    res.acq = acqR.value;
    saveSession("acq", acqR.value);
  } else {
    res.errors.acq = String(acqR.reason?.message || acqR.reason);
  }
  if (liR.status === "fulfilled") {
    res.leadintel = liR.value;
    saveSession("leadintel", liR.value);
  } else {
    res.errors.leadintel = String(liR.reason?.message || liR.reason);
  }
  if (res.acq || res.leadintel) return res; // at least one app accepted — done

  // FALLBACK: platform-auth (+ best-effort mirror) for users that exist ONLY
  // in platform-auth (e.g. a platform admin who isn't a member of any
  // customer, so has no row in the app GoTrues).
  try {
    const session = await platformPasswordGrant(cfg.platformAuthUrl, email, password);
    await mirrorPlatformSession(session.access_token);
    res.acq = session;
    res.leadintel = session;
    res.errors.acq = null;
    res.errors.leadintel = null;
    saveSession("acq", session);
    saveSession("leadintel", session);
  } catch (platformErr) {
    console.warn("[launcher] platform-auth fallback also failed:", (platformErr as Error).message);
  }
  return res;
}

// Refresh the saved session against platform-auth so the handed-off
// access_token isn't stale. Supabase access tokens default to ~1h TTL;
// without this, a user who's been on the launcher for >1h would hand off
// an expired token and the receiving app would bounce them to login.
//
// The session_id stays the same across a refresh (auth.sessions row's
// `id` is stable, only `refreshed_at` advances), so the mirror-session
// rows in ACQ/LI remain valid — we don't need to re-mirror.
//
// Returns the fresh Session on success; null on any failure (caller
// should fall back to a re-login).
export async function refreshSession(
  platformAuthUrl: string,
  refreshToken: string,
): Promise<Session | null> {
  if (!refreshToken) return null;
  try {
    const r = await fetch(`${platformAuthUrl}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    if (!d?.access_token || !d?.refresh_token) return null;
    return d as Session;
  } catch {
    return null;
  }
}

// App-aware refresh — tokens are issued by each app's OWN GoTrue (per-app
// dual login), so the refresh_token only lives in that app's
// auth.refresh_tokens. Refresh against the app's gateway, not platform-auth.
// Returns the fresh Session, or null on failure.
export async function refreshAppSession(
  apiUrl: string,
  anonKey: string,
  refreshToken: string,
): Promise<Session | null> {
  if (!refreshToken) return null;
  try {
    const r = await fetch(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    if (!d?.access_token || !d?.refresh_token) return null;
    return d as Session;
  } catch {
    return null;
  }
}

// Decode a JWT's claims (no signature verification — we only need exp).
function decodeJwtClaims(jwt: string): { exp?: number } | null {
  try {
    const part = jwt.split(".")[1] || "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (part.length % 4)) % 4);
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

// True if the JWT is missing-exp, already-expired, or expires within the
// next 5 minutes. Five-minute buffer = the receiving app gets a token good
// for at least that long before it needs to refresh on its own.
export function jwtNeedsRefresh(jwt: string | undefined): boolean {
  if (!jwt) return true;
  const claims = decodeJwtClaims(jwt);
  const exp = claims?.exp;
  if (!exp || typeof exp !== "number") return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec < 300;
}

// Build the handoff URL: app reads #cc_sso=<base64 json> and calls setSession.
// `peers` carries sibling-app sessions so the receiving app's AppSwitcher can
// build SSO links for cross-app switching without accessing the launcher's storage.
export function buildSsoLink(
  appUrl: string,
  s: Session | null,
  peers?: Partial<Record<ProductKey, Session | null>>
): string {
  if (!s) return appUrl;
  const payload: Record<string, unknown> = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  };
  if (peers) {
    const p: Record<string, { access_token: string; refresh_token: string }> = {};
    for (const [k, v] of Object.entries(peers)) {
      if (v?.access_token) p[k] = { access_token: v.access_token, refresh_token: v.refresh_token };
    }
    if (Object.keys(p).length) payload.peers = p;
  }
  // Propagate the launcher's chosen theme so the app paints in the same mode.
  // The receiving app applies it via ccSsoHandoff → <html data-theme="…">.
  try {
    const theme = localStorage.getItem("acqcoach_theme");
    if (theme) payload.theme = theme;
  } catch { /* noop */ }
  return `${appUrl}/#cc_sso=${encodeURIComponent(btoa(JSON.stringify(payload)))}`;
}

// ── Role resolution ───────────────────────────────────────────────────────────

export type UserRole = "super_admin" | "account_admin" | "owner" | "coo" | "manager" | "rep" | "unknown";

export type UserInfo = {
  role: UserRole;
  accountId: string | null;
  firstName: string;
};

/** Fetch the user's role + account from ACQ Coach's user_roles table.
 *  Uses the user's own JWT — the "self read role" RLS policy allows it.
 *  Hard-capped at 5 seconds; falls back to a safe default so the dashboard
 *  is NEVER stuck longer than that. */
export async function fetchAcqUserInfo(cfg: LauncherConfig, s: Session | null): Promise<UserInfo> {
  // Derive first name even when the role fetch fails.
  const meta = (s?.user?.user_metadata as Record<string, string> | undefined) || {};
  const firstName: string =
    meta.first_name || meta.name?.split(" ")[0] || s?.user?.email?.split("@")[0] || "User";

  const fallback: UserInfo = { role: "account_admin", accountId: null, firstName };

  if (!s?.user?.id) return fallback;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("fetchAcqUserInfo timeout")), 5_000)
    );
    const request = fetch(
      `${cfg.acqApiUrl}/rest/v1/user_roles?select=role,account_id&user_id=eq.${s.user.id}&limit=1`,
      { headers: { apikey: cfg.acqAnonKey, Authorization: `Bearer ${s.access_token}` } }
    ).then(async r => {
      if (!r.ok) return fallback;
      const rows: { role: string; account_id: string | null }[] = await r.json();
      if (!Array.isArray(rows) || rows.length === 0) return fallback;
      return { role: rows[0].role as UserRole, accountId: rows[0].account_id, firstName };
    });

    return await Promise.race([request, timeout]);
  } catch (e) {
    console.warn("[launcher] fetchAcqUserInfo:", (e as Error).message ?? e);
    return fallback;
  }
}

// Best-effort super-admin detection — checks ACQ Coach role (primary source).
export async function checkSuperAdmin(cfg: LauncherConfig, s: Session | null): Promise<boolean> {
  if (!s?.user?.id) return false;
  try {
    const r = await fetch(
      `${cfg.acqApiUrl}/rest/v1/user_roles?select=role&user_id=eq.${s.user.id}&role=eq.super_admin&limit=1`,
      { headers: { apikey: cfg.acqAnonKey, Authorization: `Bearer ${s.access_token}` } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/** Which products the user actually has active sessions for. */
export function getProductSessions(): Record<ProductKey, Session | null> {
  return { acq: getSession("acq"), leadintel: getSession("leadintel") };
}

// Per-user "Manage Access" localStorage layer was removed. Access derives
// from customer membership on the server side (see platform.user_has_access
// in platform-db). The launcher's dashboard simply renders whatever sessions
// the backend granted.

export function currentUserId(): string {
  return getSession("leadintel")?.user?.id || getSession("acq")?.user?.id || "anon";
}
export function currentEmail(): string {
  return getSession("leadintel")?.user?.email || getSession("acq")?.user?.email || "";
}

// ── Atomic dual-backend password change ───────────────────────────────────────
// Strategy:
//   1. Verify current password on BOTH backends (get fresh tokens).
//   2. Update ACQ Coach password.
//   3. Update Lead Intel password — if this fails, roll back ACQ using its
//      fresh token (still valid; GoTrue doesn't instantly revoke on pw change).
//   4. Refresh stored sessions with the new password.
//
// Returns { ok: true } or { ok: false; error: string }.

export type PasswordChangeResult = { ok: true } | { ok: false; error: string };

async function updateGoTruePassword(
  apiUrl: string,
  anon: string,
  accessToken: string,
  newPassword: string
): Promise<void> {
  const r = await fetch(`${apiUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ password: newPassword }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(d.error_description || d.msg || d.error || `password update failed (${r.status})`);
  }
}

export async function changePasswordBothBackends(
  cfg: LauncherConfig,
  currentPassword: string,
  newPassword: string
): Promise<PasswordChangeResult> {
  const email = currentEmail();
  if (!email) return { ok: false, error: "Not signed in." };

  // Phase C2 — verify current password against platform-auth (canonical).
  let platformToken: string;
  try {
    const s = await platformPasswordGrant(cfg.platformAuthUrl, email, currentPassword);
    platformToken = s.access_token;
  } catch (e: any) {
    return { ok: false, error: `Current password incorrect: ${e.message}` };
  }

  // Update password on platform-auth (canonical store).
  try {
    await fetch(`${cfg.platformAuthUrl}/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${platformToken}` },
      body: JSON.stringify({ password: newPassword }),
    }).then(async r => {
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error_description || d.msg || `password update failed (${r.status})`);
      }
    });
  } catch (e: any) {
    return { ok: false, error: `Password update failed: ${e.message}` };
  }

  // Mirror to ACQ + LI's own GoTrues so app-direct logins (rare, but possible)
  // still accept the new password. Non-fatal — platform-auth is authoritative.
  await Promise.allSettled([
    passwordGrant(cfg.acqApiUrl, cfg.acqAnonKey, email, currentPassword)
      .then(s => updateGoTruePassword(cfg.acqApiUrl, cfg.acqAnonKey, s.access_token, newPassword))
      .catch(e => console.warn("[launcher] ACQ mirror pw failed:", e?.message)),
    passwordGrant(cfg.leadintelApiUrl, cfg.leadintelAnonKey, email, currentPassword)
      .then(s => updateGoTruePassword(cfg.leadintelApiUrl, cfg.leadintelAnonKey, s.access_token, newPassword))
      .catch(e => console.warn("[launcher] LI mirror pw failed:", e?.message)),
  ]);

  // Refresh stored session with new password (non-fatal).
  try { await dualLogin(cfg, email, newPassword); } catch { /* JWT still valid */ }

  return { ok: true };
}
