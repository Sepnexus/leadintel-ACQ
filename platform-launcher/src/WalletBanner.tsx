// Unified wallet banner. Pulls from platform.customer_wallet via /admin-api/me
// — one number, one source of truth. The per-product split is shown small +
// secondary so the eye lands on the combined Platform Balance.
//
// (The old version summed per-app PostgREST calls which double-counted and
// triggered the HTTP 401 issues when the stored JWT was stale.)

import { useEffect, useState } from "react";
import type { LauncherConfig } from "./config";
import { getSession } from "./auth";
import { COLORS } from "./theme";

function fmt(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function WalletBanner({ cfg: _cfg }: { cfg: LauncherConfig }) {
  const [combined, setCombined] = useState<number | null>(null);
  const [acq, setAcq]   = useState<number | null>(null);
  const [li, setLi]     = useState<number | null>(null);
  const [adminScope, setAdminScope] = useState(false);  // platform-wide total?
  const [custCount, setCustCount]   = useState(0);

  useEffect(() => {
    const tok = getSession("acq")?.access_token || getSession("leadintel")?.access_token;
    if (!tok) return;
    let cancelled = false;
    const H = { Authorization: `Bearer ${tok}` };

    (async () => {
      try {
        const r = await fetch(`/admin-api/me/customers`, { headers: H });
        if (!r.ok) return;
        const { customers, is_platform_admin } = await r.json();
        if (cancelled) return;

        if (is_platform_admin) {
          // Platform-wide total in ONE query — the old per-customer fan-out
          // left the balance blank whenever any of the N calls was slow/failed.
          const s = await fetch(`/admin-api/platform-summary`, { headers: H });
          if (!s.ok || cancelled) return;
          const d = await s.json();
          setAdminScope(true);
          setCustCount(d.customer_count ?? 0);
          setCombined(d.total_balance_cents ?? 0);
          setAcq(d.acq_30d_cents ?? 0);
          setLi(d.li_30d_cents ?? 0);
          return;
        }

        // End user: their own customer's wallet.
        if (!customers?.length) { setCombined(0); return; }
        const c = customers[0];
        const b = await fetch(`/admin-api/me/customer/${c.id}/billing`, { headers: H });
        if (!b.ok || cancelled) return;
        const data = await b.json();
        let aa = 0, ll = 0;
        for (const u of (data.usage_30d ?? [])) {
          if (u.product === "acq_coach")  aa += u.billed ?? 0;
          if (u.product === "lead_intel") ll += u.billed ?? 0;
        }
        setCombined(data.wallet?.balance_cents ?? 0); setAcq(aa); setLi(ll);
      } catch { /* swallow — banner just stays "—" */ }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 12,
      padding: "18px 24px", marginBottom: 22,
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap",
    }}>
      <div>
        <div style={{ fontSize: 11, color: COLORS.T3, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
          Platform Balance
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6, color: COLORS.TEXT, letterSpacing: "-0.01em" }}>
          {fmt(combined)}
        </div>
        <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 4 }}>
          {adminScope
            ? `Platform-wide · ${custCount} customer${custCount === 1 ? "" : "s"} combined`
            : "One wallet · used by ACQ Coach + Lead Intel"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, fontSize: 11, color: COLORS.T3, textAlign: "right" }}>
        <div>
          <div style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>ACQ usage 30d</div>
          <div style={{ color: COLORS.T2, fontWeight: 600, fontSize: 13, marginTop: 2 }}>{fmt(acq)}</div>
        </div>
        <div style={{ width: 1, background: COLORS.B2 }} />
        <div>
          <div style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>LI usage 30d</div>
          <div style={{ color: COLORS.T2, fontWeight: 600, fontSize: 13, marginTop: 2 }}>{fmt(li)}</div>
        </div>
      </div>
    </div>
  );
}
