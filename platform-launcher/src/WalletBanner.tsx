// Combined wallet banner — shows the sum of every wallet the user can read
// across both products. RLS in each app already restricts visibility, so
// summing whatever each API returns gives the right number.
//
// This is the v1 "aggregate view" — wallets stay separate underneath. Real
// merge (single ledger, single Stripe customer) lands in Phase B3/C1.

import { useEffect, useState } from "react";
import type { LauncherConfig } from "./config";
import { getSession } from "./auth";
import { COLORS } from "./theme";

interface Totals {
  acqCents: number | null;
  liCents:  number | null;
  acqError: string | null;
  liError:  string | null;
}

async function fetchWalletsBalance(
  apiBase: string, anonKey: string, token: string, idCol: "account_id" | "tenant_id",
): Promise<number | string> {
  try {
    const r = await fetch(`${apiBase}/rest/v1/wallets?select=balance_cents,${idCol}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) return `HTTP ${r.status}`;
    const rows = (await r.json()) as Array<{ balance_cents: number }>;
    return rows.reduce((s, w) => s + (w.balance_cents ?? 0), 0);
  } catch (e) {
    return (e as Error).message;
  }
}

function fmtMoney(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function WalletBanner({ cfg }: { cfg: LauncherConfig }) {
  const [totals, setTotals] = useState<Totals>({ acqCents: null, liCents: null, acqError: null, liError: null });

  useEffect(() => {
    const acqSess = getSession("acq");
    const liSess  = getSession("leadintel");
    let cancelled = false;

    const acqP = acqSess
      ? fetchWalletsBalance(cfg.acqApiUrl, cfg.acqAnonKey ?? "", acqSess.access_token, "account_id")
      : Promise.resolve("(not signed into ACQ)" as string);
    const liP  = liSess
      ? fetchWalletsBalance(cfg.leadintelApiUrl, cfg.leadintelAnonKey ?? "", liSess.access_token, "tenant_id")
      : Promise.resolve("(not signed into Lead Intel)" as string);

    Promise.all([acqP, liP]).then(([a, l]) => {
      if (cancelled) return;
      setTotals({
        acqCents: typeof a === "number" ? a : null,
        liCents:  typeof l === "number" ? l : null,
        acqError: typeof a === "string" ? a : null,
        liError:  typeof l === "string" ? l : null,
      });
    });
    return () => { cancelled = true; };
  }, [cfg]);

  const combined = (totals.acqCents ?? 0) + (totals.liCents ?? 0);
  const haveAny = totals.acqCents !== null || totals.liCents !== null;

  return (
    <div style={{
      background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 12,
      padding: "16px 22px", marginBottom: 22,
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24,
    }}>
      <div>
        <div style={{ fontSize: 11, color: COLORS.T3, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
          Platform Balance
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: COLORS.TEXT }}>
          {haveAny ? fmtMoney(combined) : "—"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 22, fontSize: 12 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: COLORS.T3 }}>ACQ Coach</div>
          <div style={{ color: COLORS.TEXT, fontWeight: 600 }}>
            {totals.acqError ? <span style={{ color: "#c34" }}>{totals.acqError}</span> : fmtMoney(totals.acqCents)}
          </div>
        </div>
        <div style={{ width: 1, background: COLORS.B2 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ color: COLORS.T3 }}>Lead Intel</div>
          <div style={{ color: COLORS.TEXT, fontWeight: 600 }}>
            {totals.liError ? <span style={{ color: "#c34" }}>{totals.liError}</span> : fmtMoney(totals.liCents)}
          </div>
        </div>
      </div>
    </div>
  );
}
