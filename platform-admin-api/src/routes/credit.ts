// POST /admin-api/customers/:id/credit — give a customer comp/test credit
// without a real Stripe charge.
//
// Deliberately reuses the SAME path as the Stripe webhook: credit_wallet() on
// the app DB drives platform.customer_wallet (via fdw) AND writes the platform
// ledger row; we then mirror the authoritative balance into the other app's
// wallet so both UIs agree. We never write balances directly — the app wallets
// MIRROR the shared balance, so a direct write would double-count.
//
// Every credit is audit-logged with the actor + reason, so comp money is always
// traceable to a person.

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

const MAX_CREDIT_CENTS = 100_000; // $1,000 per call — a guard against a typo'd zero

export async function addCredit(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { amount_cents?: number; reason?: string };
  const amount = Number(body.amount_cents ?? 0);
  const reason = (body.reason ?? "").trim() || "Admin credit";

  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_CREDIT_CENTS) {
    return json({
      error: "bad_request",
      reason: `amount_cents must be a positive whole number up to ${MAX_CREDIT_CENTS} ($${MAX_CREDIT_CENTS / 100})`,
    }, 400);
  }

  const rows = await sql<{
    id: string; name: string; acq_account_id: string | null; leadintel_tenant_id: string | null;
  }[]>`
    SELECT id, name, acq_account_id, leadintel_tenant_id
    FROM platform.customers WHERE id = ${id}::uuid
  `;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  const cust = rows[0];

  // Unique reference so a double-click can't double-credit (credit_wallet dedups on it).
  const refRow = await sql<{ id: string }[]>`SELECT gen_random_uuid() AS id`;
  const ref = `admin_credit_${refRow[0].id}`;
  const meta = { source: "admin_credit", reason, actor_user_id: admin.platformUserId };

  let credited: "acq_coach" | "lead_intel";
  try {
    if (cust.acq_account_id && acqSql) {
      credited = "acq_coach";
      // ACQ arg order: (id, cents, description, ref, metadata, type)
      await acqSql`
        SELECT credit_wallet(
          ${cust.acq_account_id}::uuid, ${amount}, ${reason},
          ${ref}, ${acqSql.json(meta)}, ${"credit"}
        )
      `;
    } else if (cust.leadintel_tenant_id && liSql) {
      credited = "lead_intel";
      // LI arg order differs: (id, cents, type, description, metadata)
      await liSql`
        SELECT credit_wallet(
          ${cust.leadintel_tenant_id}::uuid, ${amount}, ${"credit"}, ${reason},
          ${liSql.json(meta)}
        )
      `;
    } else {
      return json({
        error: "no_wallet",
        reason: "customer has no ACQ account or Lead Intel tenant yet — enable a product first",
      }, 400);
    }
  } catch (e) {
    return json({ error: "credit_failed", reason: (e as Error).message }, 500);
  }

  // credit_wallet already updated the shared ledger. Read the authoritative
  // balance and mirror it into the OTHER app so both UIs show the same number.
  const pw = await sql<{ balance_cents: number }[]>`
    SELECT balance_cents FROM platform.customer_wallet WHERE customer_id = ${id}::uuid
  `;
  const total = pw[0]?.balance_cents ?? 0;
  try {
    if (credited === "acq_coach" && cust.leadintel_tenant_id && liSql) {
      await liSql`
        INSERT INTO wallets (tenant_id, balance_cents) VALUES (${cust.leadintel_tenant_id}::uuid, ${total})
        ON CONFLICT (tenant_id) DO UPDATE SET balance_cents = ${total}, updated_at = now()
      `;
    } else if (credited === "lead_intel" && cust.acq_account_id && acqSql) {
      await acqSql`
        INSERT INTO wallets (account_id, balance_cents) VALUES (${cust.acq_account_id}::uuid, ${total})
        ON CONFLICT (account_id) DO UPDATE SET balance_cents = ${total}, updated_at = now()
      `;
    }
  } catch (e) {
    console.error("[admin-credit] mirror failed (balance is still correct):", (e as Error).message);
  }

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (${admin.platformUserId}::uuid, 'admin_credit_added',
            ${sql.json({
              customer_id: id, customer_name: cust.name,
              amount_cents: amount, reason, credited_via: credited, balance_after: total,
            })})
  `;

  return json({
    ok: true,
    customer_id: id,
    customer_name: cust.name,
    amount_cents: amount,
    balance_cents: total,
    reason,
    note: `Added $${(amount / 100).toFixed(2)} to ${cust.name}. New balance $${(total / 100).toFixed(2)}.`,
  });
}
