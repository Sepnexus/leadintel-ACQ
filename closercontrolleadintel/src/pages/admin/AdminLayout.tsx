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
      <main style={{ padding: "20px" }}>{children}</main>
    </div>
  );
}