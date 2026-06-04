// Wallet refresh: re-snapshots a customer's platform balance from both
// per-app wallets. Used after a Stripe top-up or manual adjustment so the
// admin UI's number is current.

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

export async function refreshWallet(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const cust = await sql<{ id: string; acq_account_id: string | null; leadintel_tenant_id: string | null }[]>`
    SELECT id, acq_account_id, leadintel_tenant_id FROM platform.customers WHERE id = ${id}::uuid
  `;
  if (cust.length === 0) return json({ error: "not_found" }, 404);
  const c = cust[0];

  let acqCents = 0;
  let liCents  = 0;
  if (c.acq_account_id && acqSql) {
    try {
      const r = await acqSql<{ balance_cents: number }[]>`
        SELECT balance_cents FROM wallets WHERE account_id = ${c.acq_account_id}::uuid
      `;
      acqCents = r[0]?.balance_cents ?? 0;
    } catch (e) { console.error("[wallet/refresh] acq:", (e as Error).message); }
  }
  if (c.leadintel_tenant_id && liSql) {
    try {
      const r = await liSql<{ balance_cents: number }[]>`
        SELECT balance_cents FROM wallets WHERE tenant_id = ${c.leadintel_tenant_id}::uuid
      `;
      liCents = r[0]?.balance_cents ?? 0;
    } catch (e) { console.error("[wallet/refresh] leadintel:", (e as Error).message); }
  }
  const total = acqCents + liCents;

  await sql`
    INSERT INTO platform.customer_wallet (customer_id, balance_cents, refreshed_at)
    VALUES (${id}::uuid, ${total}, now())
    ON CONFLICT (customer_id) DO UPDATE
    SET balance_cents = EXCLUDED.balance_cents,
        refreshed_at  = EXCLUDED.refreshed_at
  `;

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, 'wallet_refresh',
            ${sql.json({ customer_id: id, acq_cents: acqCents, li_cents: liCents, total })})
  `;

  return json({ ok: true, balance_cents: total, components: { acq: acqCents, leadintel: liCents } });
}
