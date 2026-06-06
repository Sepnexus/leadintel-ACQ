import { useEffect, useState } from "react";
import { COLORS, applyTheme, getInitialTheme } from "./theme";
import type { LauncherConfig } from "./config";
import {
  getSession,
  buildSsoLink,
  fetchAcqUserInfo,
  currentUserId,
  currentEmail,
  type ProductKey,
  type UserInfo,
} from "./auth";
import { AccountSettings } from "./AccountSettings";
import { WalletBanner } from "./WalletBanner";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

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

export function Dashboard({ cfg, onLogout, onOpenAdmin, onOpenAccount }: {
  cfg: LauncherConfig; onLogout: () => void;
  onOpenAdmin?: () => void; onOpenAccount?: () => void;
}) {
  const [theme, setTheme]               = useState(getInitialTheme());
  const [showSettings, setShowSettings] = useState(false);
  const [userInfo, setUserInfo]         = useState<UserInfo | null>(null);
  const [infoTimedOut, setInfoTimedOut] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Quietly check whether this user is a platform admin (controls the Admin nav button).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/admin-api/me", {
          headers: (() => {
            const sess = getSession("acq") ?? getSession("leadintel");
            return sess ? { Authorization: `Bearer ${sess.access_token}` } : {};
          })(),
        });
        if (!cancelled) setIsPlatformAdmin(r.ok);
      } catch { /* network error → no admin button */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const userId = currentUserId();
  const email  = currentEmail();
  const isSuperAdmin = userInfo?.role === "super_admin";

  // Per-user product toggles were removed. Access derives from customer
  // membership (see platform.user_has_access in platform-db). The launcher
  // simply shows what the backend allows.
  void userId; void email; void isSuperAdmin;

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
          {onOpenAdmin && isPlatformAdmin && (
            <button onClick={onOpenAdmin} title="Platform Admin" style={{
              background: "transparent", border: `1px solid ${COLORS.GREEN}`,
              borderRadius: 8, padding: "6px 12px", color: COLORS.GREEN,
              fontSize: 12, fontWeight: 600, cursor: "pointer", lineHeight: 1,
            }}>⚡ Admin</button>
          )}
          <button
            onClick={() => (onOpenAccount ? onOpenAccount() : setShowSettings(true))}
            title="Account settings"
            style={{
              background: "transparent", border: `1px solid ${COLORS.B1}`,
              borderRadius: 8, padding: "6px 12px", color: COLORS.T2,
              fontSize: 12, fontWeight: 600, cursor: "pointer", lineHeight: 1,
            }}
          >⚙ Account</button>
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
        <WalletBanner cfg={cfg} />

        {/* Visible CTAs to the unified Account areas — so customer admins
            don't hunt for where "team / billing / GHL" lives. */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10, marginBottom: 28,
        }}>
          {[
            { label: "Team",       hash: "team",        sub: "Invite & manage" },
            { label: "Billing",    hash: "billing",     sub: "Wallet · payment · usage" },
            { label: "Connections",hash: "connections", sub: "GHL location & token" },
            { label: "Activity",   hash: "activity",    sub: "Recent events" },
          ].map(item => (
            <a key={item.hash}
               href={`#/account/${item.hash}`}
               onClick={(e) => { e.preventDefault(); onOpenAccount?.(); window.location.hash = `#/account/${item.hash}`; }}
               style={{
                 display: "block", textDecoration: "none",
                 background: COLORS.S1, border: `1px solid ${COLORS.B2}`,
                 borderRadius: 10, padding: "12px 14px",
                 transition: "border-color 0.15s",
               }}
               onMouseEnter={e => (e.currentTarget.style.borderColor = COLORS.GREEN)}
               onMouseLeave={e => (e.currentTarget.style.borderColor = COLORS.B2)}
            >
              <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.TEXT }}>{item.label}</div>
              <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>{item.sub}</div>
            </a>
          ))}
        </div>

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
            // Access derives from customer membership now (platform-db).
            // If the user has a session for this product, the backend already
            // entitled them — no separate per-user toggle.
            const session   = getSession(p.key);
            const available = !!session;
            const active    = available;
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
                  {/* Per-card role badge removed — role is already shown once in the header chip. */}
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
                  link && (
                    <a href={link} style={{
                      display: "block", textAlign: "center", marginTop: 16,
                      background: p.accent, border: "none", color: "#fff",
                      borderRadius: 8, padding: "11px",
                      fontSize: 12.5, fontWeight: 700, textDecoration: "none", letterSpacing: "0.03em",
                    }}>
                      Open App →
                    </a>
                  )
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

        {/* Phase: per-user "Manage Access" panel was removed. Access now
            derives from customer membership — toggle on the Customer detail
            page in Platform Admin instead. */}
      </main>
    </div>
  );
}
