import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import ACQCoach from "../ACQCoach";
import RepView from "../RepView";
import Login from "./Login";
import SuperAdmin from "./SuperAdmin";
import TeamPage from "./Team";
import Billing from "./Billing";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const { session, loading, who, refreshWho, signOut } = useAuth();
  const [view, setView] = useState<"home" | "team" | "billing" | "rep-as">(() => {
    // If returning from Stripe top-up, land directly on the billing page.
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("topup") === "success" || p.get("topup") === "canceled" || p.get("view") === "billing") {
        return "billing";
      }
    }
    return "home";
  });
  const [impersonateAcc, setImpersonateAcc] = useState<string | null>(null);

  // Listen for back/forward navigation that might re-add the topup flag
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      if (p.get("topup") || p.get("view") === "billing") setView("billing");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#000", color: "#777", fontFamily: "'Open Sans', sans-serif" }}>
        Loading…
      </div>
    );
  }

  if (!session) return <Login />;

  if (!who) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#000", color: "#f4f4f4", fontFamily: "'Open Sans', sans-serif", gap: 14 }}>
        <div>Setting up your account…</div>
        <div style={{ fontSize: 12, color: "#777" }}>Taking longer than usual? Try again or sign out below.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => refreshWho()} style={{ background: "#4e7d3d", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Retry</button>
          <button onClick={signOut} style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#999", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Sign out</button>
        </div>
      </div>
    );
  }

  // SUPER ADMIN — self-contained admin panel. Impersonation is explicit.
  if (who.is_super_admin) {
    if (!impersonateAcc) {
      return <SuperAdmin onImpersonate={setImpersonateAcc} />;
    }
    // Impersonating a tenant: show owner dashboard with a clear banner to return.
    return (
      <ImpersonationFrame onExit={() => { setImpersonateAcc(null); setView("home"); }} tenantId={impersonateAcc}>
        {view === "team"
          ? <TeamPage accountId={impersonateAcc} onBack={() => setView("home")} />
          : view === "billing"
          ? <Billing onBack={() => setView("home")} accountId={impersonateAcc} />
          : view === "rep-as"
          ? <RepView accountId={impersonateAcc} onBack={() => setView("home")} />
          : <ACQCoachWithTeamButton accountId={impersonateAcc} onTeam={() => setView("team")} onBilling={() => setView("billing")} onRepAs={() => setView("rep-as")} isSuperAdmin />}
      </ImpersonationFrame>
    );
  }

  // ACCOUNT ADMIN — owner dashboard with Team button
  if (who.admin_account_ids.length > 0) {
    const accId = who.admin_account_ids[0];
    if (view === "team") {
      return <TeamPage accountId={accId} onBack={() => setView("home")} />;
    }
    if (view === "billing") {
      return <Billing onBack={() => setView("home")} />;
    }
    if (view === "rep-as") {
      return <RepView accountId={accId} onBack={() => setView("home")} />;
    }
    return <ACQCoachWithTeamButton accountId={accId} onTeam={() => setView("team")} onBilling={() => setView("billing")} onRepAs={() => setView("rep-as")} onSignOut={signOut} />;
  }

  // REP
  if (who.rep_account_ids.length > 0) {
    return <RepView accountId={who.rep_account_ids[0]} repGhlUserIds={who.rep_ghl_user_ids} onBack={signOut} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#000", color: "#f4f4f4", fontFamily: "'Open Sans', sans-serif", gap: 14 }}>
      <div>Your account has no roles assigned. Contact your administrator.</div>
      <button onClick={signOut} style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#999", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Sign out</button>
    </div>
  );
};

function ACQCoachWithTeamButton({ accountId, onTeam, onBilling, onRepAs, onSignOut, isSuperAdmin }: { accountId?: string; onTeam: () => void; onBilling?: () => void; onRepAs?: () => void; onSignOut?: () => void; isSuperAdmin?: boolean }) {
  const [isDemoCustomer, setIsDemoCustomer] = useState(false);

  useEffect(() => {
    if (!accountId) { setIsDemoCustomer(false); return; }
    let cancelled = false;
    supabase.from("ghl_accounts").select("demo_mode").eq("id", accountId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsDemoCustomer(!!data?.demo_mode); });
    return () => { cancelled = true; };
  }, [accountId]);

  const itemBase: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#d4d4d4",
    padding: "7px 14px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'Open Sans', sans-serif",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    transition: "color 0.15s, background 0.15s",
    borderRadius: 0,
  };
  const divider: React.CSSProperties = { width: 1, background: "#1c1c1c", alignSelf: "stretch" };
  const onHover = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => {
    e.currentTarget.style.background = on ? "rgba(78,125,61,0.08)" : "transparent";
    e.currentTarget.style.color = on ? "#7eb56a" : "#d4d4d4";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Context sub-row ────────────────────────────────────────────────────
          In-flow row that sits directly above the ACQCoach header.
          Removed position:fixed — that caused collisions with header controls
          because the two elements were completely independent in the layout.
          Now everything stacks naturally: banner (sticky) → sub-row → ACQCoach header.
      ────────────────────────────────────────────────────────────────────────── */}
      <div style={{
        height: 34,
        background: "#060606",
        borderBottom: "1px solid #1c1c1c",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        flexShrink: 0,
      }}>
        {isDemoCustomer && onRepAs && (
          <>
            <button
              onClick={onRepAs}
              style={{ ...itemBase, color: "#7eb56a", height: "100%" }}
              title="Open the rep-facing training UI (demo customer only)"
              onMouseEnter={e => onHover(e, true)}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#7eb56a"; }}
            >
              Rep View
            </button>
            <div style={divider} />
          </>
        )}
        {onBilling && (
          <>
            <button onClick={onBilling} style={{ ...itemBase, height: "100%" }} onMouseEnter={e => onHover(e, true)} onMouseLeave={e => onHover(e, false)}>Billing</button>
            <div style={divider} />
          </>
        )}
        <button onClick={onTeam} style={{ ...itemBase, height: "100%" }} onMouseEnter={e => onHover(e, true)} onMouseLeave={e => onHover(e, false)}>Team</button>
        {!isSuperAdmin && onSignOut && (
          <>
            <div style={divider} />
            <button onClick={onSignOut} style={{ ...itemBase, height: "100%" }} onMouseEnter={e => onHover(e, true)} onMouseLeave={e => onHover(e, false)}>Sign out</button>
          </>
        )}
      </div>

      <ACQCoach isSuperAdmin={isSuperAdmin} impersonateAccountId={accountId} />
    </div>
  );
}

function ImpersonationFrame({ children, onExit, tenantId }: { children: React.ReactNode; onExit: () => void; tenantId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Sticky — takes 32px in the document flow so nothing below it gets hidden.
          position:fixed was the old value and caused the banner to float over the
          ACQCoach header nav buttons. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 1000,
        height: 32, background: "#4e7d3d", flexShrink: 0,
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        fontSize: 11, fontFamily: "'Open Sans', sans-serif", letterSpacing: "0.04em", fontWeight: 600,
      }}>
        <span>SUPER ADMIN · Viewing customer {tenantId.slice(0, 8)}…</span>
        <button onClick={onExit} style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          ← Back to admin
        </button>
      </div>
      {/* No paddingTop needed — the sticky banner occupies its own 32px in flow. */}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export default Index;
