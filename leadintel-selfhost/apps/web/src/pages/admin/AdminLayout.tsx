import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { COLORS } from "@/utils/leadUtils";
import { useAdminGate } from "@/hooks/useAdminGate";
import { UserMenu } from "@/components/auth/UserMenu";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { ready, loading } = useAdminGate();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading || !ready) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.BG, color: COLORS.T2,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Open Sans', sans-serif", fontSize: 13 }}>
        Checking permissions…
      </div>
    );
  }

  const tabs = [
    { to: "/admin/tenants", label: "Tenants" },
    { to: "/admin/billing-customers", label: "Billing Customers" },
    { to: "/admin/audit", label: "Audit Log" },
    { to: "/admin/provider-costs", label: "Provider Costs" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.BG, color: COLORS.TEXT,
      fontFamily: "'Open Sans', sans-serif" }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid " + COLORS.B1,
        background: COLORS.S1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "transparent", border: "1px solid " + COLORS.B2,
              color: COLORS.T2, padding: "5px 10px", borderRadius: 8,
              fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ← Back to app
          </button>
          <h1 style={{
            margin: 0, fontFamily: "'League Spartan', sans-serif",
            fontSize: 20, color: COLORS.GRN, letterSpacing: 0.5,
          }}>
            Super Admin
          </h1>
          <nav style={{ display: "flex", gap: 6, marginLeft: 20 }}>
            {tabs.map((t) => {
              const active = location.pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12,
                    color: active ? COLORS.GRN : COLORS.T2,
                    background: active ? COLORS.S2 : "transparent",
                    border: "1px solid " + (active ? COLORS.GRN + "40" : "transparent"),
                    textDecoration: "none",
                  }}
                >{t.label}</Link>
              );
            })}
          </nav>
        </div>
        <UserMenu />
      </header>
      <main style={{ padding: "20px" }}>
        <PlatformAdminBanner />
        {children}
      </main>
    </div>
  );
}

// ─── Phase C3 — Platform Admin redirect banner ──────────────────────────────
// Customer / billing / audit CRUD lives in Platform Admin now. These LI-local
// tabs stay as read-only during the migration window.
function PlatformAdminBanner() {
  const launcherUrl = (() => {
    if (typeof window === "undefined") return "http://localhost:8080/#/admin";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? "http://localhost:8080/#/admin" : "/#/admin";
  })();
  return (
    <div style={{
      marginBottom: 16, padding: "12px 14px", borderRadius: 8,
      border: "1px solid " + COLORS.B2 + "80",
      background: "rgba(180,120,20,0.08)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap", fontSize: 13,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
        <span style={{
          background: "rgba(220,160,40,0.25)", color: "#f5d68a",
          padding: "2px 8px", borderRadius: 4, fontSize: 10,
          fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
          flexShrink: 0, marginTop: 1,
        }}>Moved</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#f1dca7" }}>
            <strong>Tenants · billing · audit · invites</strong> are now managed in <strong>Platform Admin</strong>.
          </div>
          <div style={{ color: "#cfb985", fontSize: 11, marginTop: 4 }}>
            This Lead Intel view is read-only during the transition. Make changes in Platform Admin so they apply to both products.
          </div>
        </div>
      </div>
      <a
        href={launcherUrl}
        style={{
          flexShrink: 0, border: "1px solid #b8902a80",
          background: "rgba(220,160,40,0.18)",
          padding: "6px 12px", borderRadius: 6, fontSize: 12,
          color: "#f5d68a", textDecoration: "none", fontWeight: 500,
        }}
      >
        Open Platform Admin →
      </a>
    </div>
  );
}