// Periodic wallet mirror — keeps each app's LOCAL public.wallets in sync with
// the SHARED platform.customer_wallet.
//
// Why this exists: the unified wallet RPCs only refresh the *charging* app's
// own local mirror. So after a Lead Intel charge, LI's local wallet is updated
// but ACQ's local copy is left stale (and vice-versa) until that app next
// transacts. The launcher/admin always read the shared ledger so they're
// correct, but each app's in-app billing reads its own local mirror — which is
// where the "$5.00 in ACQ vs $4.74 everywhere else" divergence came from.
//
// This sweeps every 30s and pushes the authoritative shared balance into both
// app wallets, bounding display lag to ~30s. It uses admin-api's own three DB
// connections (read platform-db via `sql`, write app wallets via acqSql/liSql)
// — exactly what the on-demand refreshWallet endpoint does, just for everyone
// on a timer. Only rows whose balance actually differs are written
// (IS DISTINCT FROM), so it's a no-op when balances already agree. The RPCs'
// atomic shared-ledger debit still prevents overdraft, so a briefly-stale local
// gate cannot overspend.

import { sql, acqSql, liSql } from "../db.ts";

async function mirrorOnce(): Promise<void> {
  let rows: { acq_account_id: string | null; leadintel_tenant_id: string | null; balance_cents: number }[];
  try {
    rows = await sql`
      SELECT c.acq_account_id, c.leadintel_tenant_id, w.balance_cents
      FROM platform.customer_wallet w
      JOIN platform.customers c ON c.id = w.customer_id
    `;
  } catch (e) {
    console.error("[wallet-mirror] read platform wallet failed:", (e as Error).message);
    return;
  }

  for (const r of rows) {
    if (r.acq_account_id && acqSql) {
      try {
        await acqSql`
          UPDATE public.wallets SET balance_cents = ${r.balance_cents}, updated_at = now()
          WHERE account_id = ${r.acq_account_id}::uuid
            AND balance_cents IS DISTINCT FROM ${r.balance_cents}
        `;
      } catch (e) { console.error("[wallet-mirror] acq write:", (e as Error).message); }
    }
    if (r.leadintel_tenant_id && liSql) {
      try {
        await liSql`
          UPDATE public.wallets SET balance_cents = ${r.balance_cents}, updated_at = now()
          WHERE tenant_id = ${r.leadintel_tenant_id}::uuid
            AND balance_cents IS DISTINCT FROM ${r.balance_cents}
        `;
      } catch (e) { console.error("[wallet-mirror] li write:", (e as Error).message); }
    }
  }
}

export function startWalletMirror(): void {
  // First sweep shortly after boot, then every 30s.
  setTimeout(() => mirrorOnce().catch(() => {}), 8_000);
  setInterval(() => mirrorOnce().catch(() => {}), 30_000);
}
