import { useEffect, useState } from "react";
import { COLORS, applyTheme, getInitialTheme } from "./theme";
import type { LauncherConfig } from "./config";
import {
  getSession,
  buildSsoLink,
  fetchAcqUserInfo,
  getAccess,
  setAccess,
  currentUserId,
  currentEmail,
  type Access,
  type ProductKey,
  type UserInfo,
} from "./auth";
import { AccountSettings } from "./AccountSettings";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

// ── Per-user per-product enable preference ─────────────────────────────────────
// Stored as "cc_product_enabled_{email}_{key}" → "1" | "0"
// Defaults to enabled (true) on first login.
function getProductEnabled(email: string, key: ProductKey): boolean {
  try {
    const v = localStorage.getItem(`cc_product_enabled_${email}_${key}`);
    return v === null ? true : v !== "0";
  } catch { return true; }
}
function setProductEnabled(email: string, key: ProductKey, enabled: boolean) {
  try { localStorage.setItem(`cc_product_enabled_${email}_${key}`, enabled ? "1" : "0"); } catch { /* noop */ }
}

// ── Role display helpers ───────────────────────────────────────────────────────

function roleLabel(role: UserInfo["role"]): string {
  switch (role) {
    case "super_admin":   return "Super Admin";
    case "account_admin": return "Account Admin";
    case "owner":         return "Owner";
    case "coo":           return "COO";
    case "manager":       return "Manager";
    case "rep":           return "Sales Rep";
    default:              return "";
  }
}

function greeting(firstName: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return firstName ? `${time}, ${firstName}` : time;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Product = {
  key: ProductKey;
  name: string;
  tagline: string;
  desc: string;
  url: string;
  accent: string;
};

// Both cards use green — consistent brand colour.
const ALL_PRODUCTS: Product[] = [
  {
    key: "acq",
    name: "ACQ Coach",
    tagline: "By Closer Control",
    desc: "Call coaching & rep training. Live roleplay, call scoring, and team leaderboards.",
    url: "",
    accent: COLORS.GREEN,
  },
  {
    key: "leadintel",
    name: "Lead Intel",
    tagline: "By Closer Control",
    desc: "Lead intelligence & CRM insights. AI prioritization, daily briefings, pipeline view.",
    url: "",
    accent: COLORS.GREEN,   // changed from COLORS.BLU → GREEN for consistency
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function Dashboard({ cfg, onLogout }: { cfg: LauncherConfig; onLogout: () => void }) {
  const [theme, setTheme]               = useState(getInitialTheme());
  const [showSettings, setShowSettings] = useState(false);
  const [userInfo, setUserInfo]         = useState<UserInfo | null>(null);
  const [infoTimedOut, setInfoTimedOut] = useState(false);

  const userId = currentUserId();
  const email  = currentEmail();
  const isSuperAdmin = userInfo?.role === "super_admin";

  // Super-admin bulk-access state (existing system, unchanged)
  const [access, setAccessState] = useState<Access>(() => getAccess(userId));

  // Per-user per-product enabled state — loaded from localStorage, keyed to email
  const [enabledMap, setEnabledMap] = useState<Record<ProductKey, boolean>>(() => ({
    acq:       getProductEnabled(email, "acq"),
    leadintel: getProductEnabled(email, "leadintel"),
  }));

  function toggleProduct(key: ProductKey) {
    const next = !enabledMap[key];
    setEnabledMap(prev => ({ ...prev, [key]: next }));
    setProductEnabled(email, key, next);
    // Super-admin also syncs the shared access state
    if (isSuperAdmin) {
      const nextAccess = { ...access, [key]: next };
      setAccessState(nextAccess);
      setAccess(userId, nextAccess);
    }
  }

  // Fetch role once on mount — fetchAcqUserInfo has a 5s internal timeout.
  useEffect(() => {
    const t = setTimeout(() => setInfoTimedOut(true), 5_500);
    fetchAcqUserInfo(cfg, getSession("acq")).then(info => {
      clearTimeout(t);
      setUserInfo(info);
    });
    return () => clearTimeout(t);
  }, [cfg]);

  useEffect(() => {
    if (infoTimedOut && userInfo === null) {
      setUserInfo({ role: "account_admin", accountId: null, firstName: "User" });
    }
  }, [infoTimedOut, userInfo]);

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (userInfo === null) {
    return (
      <div style={{
        minHeight: "100vh", background: COLORS.BG, fontFamily: FONT,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20,
      }}>
        <div style={{ fontSize: 13, color: COLORS.T2, letterSpacing: "0.04em" }}>Setting up your account…</div>
        <div style={{
          width: 28, height: 28, border: `3px solid ${COLORS.B2}`,
          borderTopColor: COLORS.GREEN, borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <button
          onClick={() => {
            Object.keys(localStorage).forEach(k => {
              if (k.startsWith('sb-') || k.startsWith('cc_')) localStorage.removeItem(k);
            });
            localStorage.clear();
            window.location.href = '/';
          }}
          style={{
            marginTop: 12, background: "transparent", border: `1px solid ${COLORS.B3}`,
            borderRadius: 8, padding: "7px 18px", color: COLORS.T3,
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
          }}
        >Sign Out</button>
      </div>
    );
  }

  function toggleTheme() {
    const n = theme === "dark" ? "light" : "dark";
    applyTheme(n);
    setTheme(n);
  }

  // Always show BOTH product cards. Whether a product is "available" is decided
  // by whether the dual-login actually obtained a session for that backend —
  // i.e. the user genuinely has access. Products without a session render in a
  // greyed "contact your admin" state rather than a broken Open-App link.
  const products: Product[] = ALL_PRODUCTS.map(p => ({
    ...p,
    url: p.key === "acq" ? cfg.acqUrl : cfg.leadintelUrl,
  }));
  const availableCount = products.filter(p => !!getSession(p.key)).length;

  const label = roleLabel(userInfo.role);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.BG, fontFamily: FONT }}>
      {showSettings && <AccountSettings cfg={cfg} onClose={() => setShowSettings(false)} />}

      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: `1px solid ${COLORS.B1}`, background: COLORS.S1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${COLORS.B2}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: COLORS.GREEN, letterSpacing: "0.04em",
          }}>CC</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.TEXT, letterSpacing: "0.04em" }}>CLOSER CONTROL</div>
            <div style={{ fontSize: 10.5, color: COLORS.T3 }}>Platform</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {email && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 4 }}>
              <span style={{ fontSize: 12, color: COLORS.T2 }}>{email}</span>
              {label && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
                  color: COLORS.GREEN, background: COLORS.GREEN + "1e", borderRadius: 5, padding: "2px 7px",
                }}>{label}</span>
              )}
            </div>
          )}
          <button onClick={() => setShowSettings(true)} title="Account settings" style={{
            background: "transparent", border: `1px solid ${COLORS.B1}`,
            borderRadius: 8, padding: "6px 12px", color: COLORS.T2,
            fontSize: 12, fontWeight: 600, cursor: "pointer", lineHeight: 1,
          }}>⚙ Account</button>
          <button onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "transparent", border: `1px solid ${COLORS.B1}`,
              borderRadius: 8, padding: "6px 10px", color: COLORS.T2,
              fontSize: 15, cursor: "pointer", lineHeight: 1,
            }}>{theme === "dark" ? "☀️" : "🌙"}</button>
          <button
            onClick={() => {
              Object.keys(localStorage).forEach(k => {
                if (k.startsWith('sb-') || k.startsWith('cc_')) localStorage.removeItem(k);
              });
              localStorage.clear();
              window.location.href = `${cfg.acqUrl}/?logout=true`;
            }}
            style={{
              background: "transparent", border: `1px solid ${COLORS.B3}`,
              borderRadius: 8, padding: "6px 14px", color: COLORS.T2,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >Sign Out</button>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 60px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.TEXT, margin: "0 0 6px", letterSpacing: "0.02em" }}>
          {greeting(userInfo.firstName)}
        </h1>
        <p style={{ fontSize: 13, color: COLORS.T3, margin: "0 0 28px" }}>
          {availableCount > 1
            ? "You're signed in across the platform. Choose an app to open."
            : availableCount === 1
            ? "Open your product below."
            : "No products available yet. Contact your administrator for access."}
        </p>

        {/* Product cards — both products always shown */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
        }}>
          {products.map(p => {
            const session   = getSession(p.key);
            const available = !!session;                       // login succeeded for this backend
            const enabled   = available && enabledMap[p.key];  // user has it toggled on
            const active    = available && enabled;            // → show Open App
            const peerKey: ProductKey = p.key === "acq" ? "leadintel" : "acq";
            const link = session ? buildSsoLink(p.url, session, { [peerKey]: getSession(peerKey) }) : null;

            return (
              <div key={p.key} style={{
                background: COLORS.S1,
                border: `1px solid ${active ? COLORS.B1 : COLORS.B2}`,
                borderTop: `3px solid ${active ? p.accent : COLORS.B3}`,
                borderRadius: 14, padding: 22,
                opacity: active ? 1 : 0.6,
                transition: "opacity .2s, border-color .2s",
                display: "flex", flexDirection: "column", minHeight: 220,
              }}>
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.TEXT, letterSpacing: "0.02em" }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>{p.tagline}</div>
                  </div>
                  {available && label && p.key === "acq" && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
                      color: p.accent, background: p.accent + "1e", borderRadius: 5, padding: "3px 8px",
                    }}>{label}</span>
                  )}
                  {!available && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
                      color: COLORS.T3, background: COLORS.B3, borderRadius: 5, padding: "3px 8px",
                    }}>No access</span>
                  )}
                </div>

                <p style={{ fontSize: 12.5, color: COLORS.T2, lineHeight: 1.6, margin: "14px 0 0", flex: 1 }}>
                  {p.desc}
                </p>

                {available ? (
                  <>
                    {/* Enable/disable toggle — only for products the user can access */}
                    <label style={{
                      display: "flex", alignItems: "center", gap: 9, marginTop: 16,
                      cursor: "pointer", userSelect: "none",
                    }}>
                      <span
                        onClick={() => toggleProduct(p.key)}
                        style={{
                          display: "inline-flex", alignItems: "center",
                          width: 36, height: 20, borderRadius: 10,
                          background: enabled ? COLORS.GREEN : COLORS.B3,
                          position: "relative", transition: "background .2s",
                          flexShrink: 0, cursor: "pointer",
                        }}
                      >
                        <span style={{
                          width: 14, height: 14, borderRadius: "50%", background: "#fff",
                          position: "absolute", left: enabled ? 19 : 3,
                          transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                        }} />
                      </span>
                      <span
                        onClick={() => toggleProduct(p.key)}
                        style={{ fontSize: 11.5, fontWeight: 600, color: enabled ? COLORS.GREEN : COLORS.RED }}
                      >
                        {enabled ? "Enabled" : "Disabled"}
                      </span>
                    </label>

                    {/* Open App — only when enabled */}
                    {enabled && link && (
                      <a href={link} style={{
                        display: "block", textAlign: "center", marginTop: 12,
                        background: p.accent, border: "none", color: "#fff",
                        borderRadius: 8, padding: "11px",
                        fontSize: 12.5, fontWeight: 700, textDecoration: "none", letterSpacing: "0.03em",
                      }}>
                        Open App →
                      </a>
                    )}
                  </>
                ) : (
                  /* No session for this product — user has no access. */
                  <div style={{
                    marginTop: 16, display: "flex", alignItems: "center", gap: 8,
                    background: COLORS.S2, border: `1px solid ${COLORS.B2}`,
                    borderRadius: 8, padding: "11px 13px",
                  }}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>🔒</span>
                    <span style={{ fontSize: 11.5, color: COLORS.T3, lineHeight: 1.5 }}>
                      Contact your admin to get access to {p.name}.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Super-admin: Manage Access panel */}
        {isSuperAdmin && (
          <div style={{
            marginTop: 32, background: COLORS.S1,
            border: `1px solid ${COLORS.B1}`, borderRadius: 14, padding: 22,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.TEXT, letterSpacing: "0.02em" }}>
                Manage Access
              </span>
              <span style={{
                fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
                color: COLORS.GREEN, background: COLORS.GREEN + "1e", borderRadius: 5, padding: "2px 7px",
              }}>Super Admin</span>
            </div>
            <p style={{ fontSize: 11.5, color: COLORS.T3, margin: "0 0 16px" }}>
              Toggle which products are available on this account. Stored locally per account.
            </p>
            {ALL_PRODUCTS.map(p => (
              <div key={p.key} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 0", borderTop: `1px solid ${COLORS.B1}`,
              }}>
                <div style={{ fontSize: 13, color: COLORS.TEXT, fontWeight: 600 }}>{p.name}</div>
                <button onClick={() => toggleProduct(p.key)} style={{
                  background: enabledMap[p.key] ? p.accent : "transparent",
                  border: `1px solid ${enabledMap[p.key] ? p.accent : COLORS.B3}`,
                  color: enabledMap[p.key] ? "#fff" : COLORS.T2,
                  borderRadius: 999, padding: "5px 14px",
                  fontSize: 11.5, fontWeight: 700, cursor: "pointer", minWidth: 86,
                }}>{enabledMap[p.key] ? "Enabled" : "Disabled"}</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
