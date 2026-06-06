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

  useEffect(() => {
    const tok = getSession("acq")?.access_token || getSession("leadintel")?.access_token;
    if (!tok) return;
    let cancelled = false;

    (async () => {
      // List customers we belong to → pick the first → fetch its billing.
      // Platform admins (multi-customer view) see the SUM across all customers.
      try {
        const r = await fetch(`/admin-api/me/customers`, { headers: { Authorization: `Bearer ${tok}` } });
        if (!r.ok) return;
        const { customers, is_platform_admin } = await r.json();
        if (cancelled) return;
        if (!customers?.length) { setCombined(0); return; }

        let totalC = 0, totalAcq = 0, totalLi = 0;
        const list = is_platform_admin ? customers : [customers[0]];
        for (const c of list) {
          const b = await fetch(`/admin-api/me/customer/${c.id}/billing`, { headers: { Authorization: `Bearer ${tok}` } });
          if (!b.ok) continue;
          const data = await b.json();
          totalC   += data.wallet?.balance_cents ?? 0;
          for (const u of (data.usage_30d ?? [])) {
            if (u.product === "acq_coach")  totalAcq += u.billed ?? 0;
            if (u.product === "lead_intel") totalLi  += u.billed ?? 0;
          }
        }
        if (cancelled) return;
        setCombined(totalC); setAcq(totalAcq); setLi(totalLi);
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
          One wallet · used by ACQ Coach + Lead Intel
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
