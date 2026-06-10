// Wallet refresh: re-snapshots a customer's platform balance from both
// per-app wallets. Used after a Stripe top-up or manual adjustment so the
// admin UI's number is current.

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

export async function refreshWallet(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  // Unified-wallet model: platform.customer_wallet IS the single ledger (both
  // apps' debit_wallet/credit_wallet drive it via fdw). It is NO LONGER the
  // sum of the app wallets — summing would double-count, since each app's
  // local wallet now MIRRORS the shared balance. "Refresh" reads the
  // authoritative balance and re-mirrors it into both app wallets so their
  // UIs are fresh (the non-transacting app can lag between its own ops).
  const cust = await sql<{ id: string; acq_account_id: string | null; leadintel_tenant_id: string | null }[]>`
    SELECT id, acq_account_id, leadintel_tenant_id FROM platform.customers WHERE id = ${id}::uuid
  `;
  if (cust.length === 0) return json({ error: "not_found" }, 404);
  const c = cust[0];

  const w = await sql<{ balance_cents: number }[]>`
    SELECT balance_cents FROM platform.customer_wallet WHERE customer_id = ${id}::uuid
  `;
  const total = w[0]?.balance_cents ?? 0;

  if (c.acq_account_id && acqSql) {
    try {
      await acqSql`
        INSERT INTO wallets (account_id, balance_cents) VALUES (${c.acq_account_id}::uuid, ${total})
        ON CONFLICT (account_id) DO UPDATE SET balance_cents = ${total}, updated_at = now()
      `;
    } catch (e) { console.error("[wallet/refresh] acq mirror:", (e as Error).message); }
  }
  if (c.leadintel_tenant_id && liSql) {
    try {
      await liSql`
        INSERT INTO wallets (tenant_id, balance_cents) VALUES (${c.leadintel_tenant_id}::uuid, ${total})
        ON CONFLICT (tenant_id) DO UPDATE SET balance_cents = ${total}, updated_at = now()
      `;
    } catch (e) { console.error("[wallet/refresh] li mirror:", (e as Error).message); }
  }

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, 'wallet_refresh',
            ${sql.json({ customer_id: id, unified_balance: total })})
  `;

  return json({ ok: true, balance_cents: total });
}
