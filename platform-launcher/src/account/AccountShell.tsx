// Customer-self-service Account shell.
// Replaces the inline AccountSettings popover. Opens at /#/account.
// Tabs: Profile · Team · Billing · Connections · Activity.
// Each tab is scoped to the user's "active" customer (the one they're an
// account_admin of, or the first they belong to). If they belong to multiple,
// a dropdown lets them switch.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import type { LauncherConfig } from "../config";
import { ToastProvider } from "../admin/Toast";
import { accountApi, MyCustomer } from "./accountApi";
import { ProfileTab } from "./ProfileTab";
import { TeamTab } from "./TeamTab";
import { BillingTab } from "./BillingTab";
import { ConnectionsTab } from "./ConnectionsTab";
import { ActivityTab } from "./ActivityTab";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export type AccountTab = "profile" | "team" | "billing" | "connections" | "activity";

function tabFromHash(): AccountTab {
  const h = window.location.hash || "";
  const m = h.match(/^#\/account\/(profile|team|billing|connections|activity)/);
  return (m?.[1] as AccountTab) ?? "profile";
}

export function AccountShell({ cfg, onClose }: { cfg: LauncherConfig; onClose: () => void }) {
  const [tab, setTabState] = useState<AccountTab>(tabFromHash);
  const [customers, setCustomers] = useState<MyCustomer[]>([]);
  const [activeCid, setActiveCid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function setTab(t: AccountTab) {
    setTabState(t);
    window.location.hash = `#/account/${t}`;
  }

  // Reflect hash → tab so back/forward works.
  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    (async () => {
      const r = await accountApi.listMyCustomers();
      setLoading(false);
      if (!r.ok) { setError(r.error); return; }
      setCustomers(r.data.customers);
      setActiveCid(r.data.customers[0]?.id ?? null);
    })();
  }, []);

  const active = customers.find(c => c.id === activeCid);

  return (
    <ToastProvider>
      <div style={{ minHeight: "100vh", background: COLORS.BG, color: COLORS.TEXT, fontFamily: FONT }}>
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px", borderBottom: `1px solid ${COLORS.B2}`, background: COLORS.S1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button onClick={onClose} style={btnGhost}>← Back</button>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.02em" }}>Account</div>
            {customers.length > 1 && active && (
              <select
                value={activeCid ?? ""}
                onChange={e => setActiveCid(e.target.value)}
                style={{
                  background: COLORS.B2, color: COLORS.TEXT,
                  border: `1px solid ${COLORS.B3}`, borderRadius: 6,
                  padding: "5px 10px", fontSize: 12, fontFamily: FONT,
                }}
              >
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {customers.length === 1 && active && (
              <div style={{ fontSize: 12, color: COLORS.T2 }}>{active.name}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["profile", "team", "billing", "connections", "activity"] as AccountTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                disabled={t !== "profile" && !activeCid}
                style={{
                  background: tab === t ? COLORS.B2 : "transparent",
                  border: `1px solid ${tab === t ? COLORS.GREEN : COLORS.B3}`,
                  color: tab === t ? COLORS.GREEN : COLORS.T2,
                  borderRadius: 6, padding: "6px 14px", fontSize: 12,
                  cursor: (t !== "profile" && !activeCid) ? "not-allowed" : "pointer",
                  opacity: (t !== "profile" && !activeCid) ? 0.4 : 1,
                  fontFamily: FONT, fontWeight: 600, textTransform: "capitalize",
                }}
              >{t}</button>
            ))}
          </div>
        </header>

        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
          {loading && <div style={{ padding: 32, textAlign: "center", color: COLORS.T3 }}>Loading…</div>}
          {error  && <div style={{ padding: 14, color: "#ff7a7a", fontSize: 13 }}>{error}</div>}

          {!loading && tab === "profile" && <ProfileTab cfg={cfg} />}
          {!loading && tab === "team"        && activeCid && <TeamTab        cid={activeCid} customer={active!} />}
          {!loading && tab === "billing"     && activeCid && <BillingTab     cid={activeCid} customer={active!} />}
          {!loading && tab === "connections" && activeCid && <ConnectionsTab cid={activeCid} customer={active!} />}
          {!loading && tab === "activity"    && activeCid && <ActivityTab    cid={activeCid} customer={active!} />}
        </main>
      </div>
    </ToastProvider>
  );
}

const btnGhost: React.CSSProperties = {
  background: "transparent", border: `1px solid ${COLORS.B3}`,
  borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
  fontSize: 12, cursor: "pointer", fontFamily: FONT,
};
