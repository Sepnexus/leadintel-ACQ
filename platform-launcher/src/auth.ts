// Auth layer for the unified launcher.
//
// Because ACQ Coach (:54421) and Lead Intel (:54422) are TWO independent
// Supabase/GoTrue backends with DIFFERENT JWT secrets, a single token cannot
// authenticate both. Instead the launcher logs into BOTH backends with the same
// email+password (dual login), stores each token, and hands each app ITS OWN
// token via a URL fragment on "Open App" (token handoff). Cross-origin
// localStorage cannot be shared (different ports = different origins), which is
// why the fragment-handoff approach is required.

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

export async function dualLogin(
  cfg: LauncherConfig,
  email: string,
  password: string
): Promise<DualLoginResult> {
  clearSessions(); // wipe any previous user's sessions before starting a new login
  const res: DualLoginResult = { acq: null, leadintel: null, errors: { acq: null, leadintel: null } };
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
  return res;
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

// ── Per-user product access (enable/disable), stored in localStorage ──────────
export type Access = { acq: boolean; leadintel: boolean };

export function getAccess(userId: string): Access {
  try {
    const v = localStorage.getItem(`cc_product_access_${userId}`);
    if (v) return { acq: true, leadintel: true, ...JSON.parse(v) };
  } catch { /* noop */ }
  return { acq: true, leadintel: true };
}
export function setAccess(userId: string, a: Access) {
  localStorage.setItem(`cc_product_access_${userId}`, JSON.stringify(a));
}

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

  // Determine which backends this user is signed into — only operate on those.
  const hasAcq = !!getSession("acq");
  const hasLi  = !!getSession("leadintel");
  if (!hasAcq && !hasLi) return { ok: false, error: "Not signed in to any product." };

  // Step 1 — verify current password on all active backends and get fresh tokens.
  const acqVerify = hasAcq
    ? await passwordGrant(cfg.acqApiUrl, cfg.acqAnonKey, email, currentPassword).catch(e => e as Error)
    : null;
  const liVerify = hasLi
    ? await passwordGrant(cfg.leadintelApiUrl, cfg.leadintelAnonKey, email, currentPassword).catch(e => e as Error)
    : null;

  if (acqVerify instanceof Error) {
    return { ok: false, error: `Current password incorrect on ACQ Coach: ${acqVerify.message}` };
  }
  if (liVerify instanceof Error) {
    return { ok: false, error: `Current password incorrect on Lead Intel: ${liVerify.message}` };
  }

  const acqToken = acqVerify?.access_token ?? null;
  const liToken  = liVerify?.access_token  ?? null;

  // Step 2 — update ACQ Coach (if signed in).
  if (acqToken) {
    try {
      await updateGoTruePassword(cfg.acqApiUrl, cfg.acqAnonKey, acqToken, newPassword);
    } catch (e: any) {
      return { ok: false, error: `ACQ Coach update failed: ${e.message}` };
    }
  }

  // Step 3 — update Lead Intel; roll back ACQ on failure.
  if (liToken) {
    try {
      await updateGoTruePassword(cfg.leadintelApiUrl, cfg.leadintelAnonKey, liToken, newPassword);
    } catch (liErr: any) {
      // Rollback ACQ if we updated it (token still valid for a short window).
      if (acqToken) {
        try {
          await updateGoTruePassword(cfg.acqApiUrl, cfg.acqAnonKey, acqToken, currentPassword);
        } catch {
          return {
            ok: false,
            error:
              "Lead Intel update failed AND the ACQ Coach rollback also failed — both backends may now have different passwords. Update them manually (see README).",
          };
        }
      }
      return {
        ok: false,
        error: `Lead Intel update failed (ACQ Coach was successfully rolled back): ${liErr.message}`,
      };
    }
  }

  // Step 4 — refresh stored sessions with the new password (non-fatal).
  try { await dualLogin(cfg, email, newPassword); } catch { /* JWT still valid */ }

  return { ok: true };
}
