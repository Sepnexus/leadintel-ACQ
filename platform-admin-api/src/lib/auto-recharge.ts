// Auto-recharge executor — the missing piece that makes "auto-recharge enabled"
// actually DO something.
//
// Every 2 minutes it finds customers whose SHARED wallet balance has dropped
// below their threshold, with auto-recharge on and a saved card, and charges
// their card off-session for the top-up amount, then credits the shared wallet
// (via the app credit_wallet RPC, which drives platform.customer_wallet and
// dedups by the PaymentIntent id). Stripe test vs live follows the STRIPE_ENV
// master key, same as manual top-ups.
//
// Safety:
//  - Only customers whose billing_settings.stripe_env matches the active mode.
//  - An audit_log 'auto_recharge_attempt' row is written BEFORE charging and is
//    the idempotency guard: if one was written for this customer in the last
//    30 min we skip — so a declined card isn't hammered and a slow credit can't
//    trigger a second charge.
//  - The credit_wallet RPC dedups on the PaymentIntent id, so even a retried
//    credit can't double-fund.

import { sql, acqSql, liSql } from "../db.ts";

async function getMasterKey(name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const rows = await sql<{ key_value: string }[]>`
    SELECT key_value FROM platform.master_keys WHERE key_name = ${name} LIMIT 1
  `;
  return rows[0]?.key_value ?? null;
}

async function getStripe(): Promise<{ secret: string; env: "test" | "live" } | null> {
  const env = ((await getMasterKey("STRIPE_ENV")) ?? "test").toLowerCase() === "live" ? "live" : "test";
  const key = await getMasterKey(env === "live" ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_TEST_SECRET_KEY");
  if (!key) return null; // not configured → silently no-op
  return { secret: key, env };
}

async function stripePost(secret: string, path: string, params: Record<string, string>): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Stripe ${path} failed (${r.status})`);
  return d;
}

interface DueRow {
  customer_id: string; name: string;
  acq_account_id: string | null; leadintel_tenant_id: string | null;
  stripe_customer_id: string; default_payment_method_id: string;
  topup_amount_cents: number; threshold_cents: number; balance_cents: number;
}

async function rechargeOnce(): Promise<void> {
  const stripe = await getStripe();
  if (!stripe) return;

  let due: DueRow[];
  try {
    due = await sql<DueRow[]>`
      SELECT c.id AS customer_id, c.name, c.acq_account_id, c.leadintel_tenant_id,
             bs.stripe_customer_id, bs.default_payment_method_id,
             bs.topup_amount_cents, bs.threshold_cents, w.balance_cents
      FROM platform.billing_settings bs
      JOIN platform.customers c       ON c.id = bs.customer_id
      JOIN platform.customer_wallet w ON w.customer_id = bs.customer_id
      WHERE bs.auto_recharge_enabled = true
        AND bs.stripe_customer_id IS NOT NULL
        AND bs.default_payment_method_id IS NOT NULL
        AND bs.stripe_env = ${stripe.env}
        AND bs.topup_amount_cents > 0
        AND w.balance_cents < bs.threshold_cents
    `;
  } catch (e) {
    console.error("[auto-recharge] query failed:", (e as Error).message);
    return;
  }

  for (const row of due) {
    // Idempotency guard: one attempt per customer per 30 min.
    try {
      const recent = await sql`
        SELECT 1 FROM platform.audit_log
        WHERE action = 'auto_recharge_attempt'
          AND (metadata->>'customer_id') = ${row.customer_id}
          AND created_at > now() - interval '30 minutes'
        LIMIT 1
      `;
      if (recent.length > 0) continue;
      await sql`
        INSERT INTO platform.audit_log (actor_user_id, action, metadata)
        VALUES (NULL, 'auto_recharge_attempt',
                ${sql.json({ customer_id: row.customer_id, name: row.name, amount_cents: row.topup_amount_cents, balance_cents: row.balance_cents, env: stripe.env })})
      `;
    } catch (e) {
      console.error("[auto-recharge] guard failed for", row.name, (e as Error).message);
      continue;
    }

    // Charge the saved card off-session.
    let pi: any;
    try {
      pi = await stripePost(stripe.secret, "payment_intents", {
        amount: String(row.topup_amount_cents),
        currency: "usd",
        customer: row.stripe_customer_id,
        payment_method: row.default_payment_method_id,
        off_session: "true",
        confirm: "true",
        description: `Auto-recharge — ${row.name}`,
        "metadata[type]": "auto_recharge",
        "metadata[platform_customer_id]": row.customer_id,
      });
    } catch (e) {
      console.error(`[auto-recharge] charge declined/failed for ${row.name}:`, (e as Error).message);
      await sql`
        INSERT INTO platform.audit_log (actor_user_id, action, metadata)
        VALUES (NULL, 'auto_recharge_failed', ${sql.json({ customer_id: row.customer_id, name: row.name, error: (e as Error).message })})
      `.catch(() => {});
      continue;
    }

    if (pi?.status !== "succeeded") {
      console.error(`[auto-recharge] PaymentIntent not succeeded (${pi?.status}) for ${row.name}`);
      continue;
    }

    // Credit the SHARED wallet via the app RPC (dedups by pi.id).
    try {
      if (row.acq_account_id && acqSql) {
        await acqSql`
          SELECT credit_wallet(${row.acq_account_id}::uuid, ${row.topup_amount_cents}, ${"Auto-recharge"},
                               ${pi.id}, ${acqSql.json({ source: "auto_recharge", payment_intent: pi.id, env: stripe.env })}, ${"credit"})
        `;
      } else if (row.leadintel_tenant_id && liSql) {
        await liSql`
          SELECT credit_wallet(${row.leadintel_tenant_id}::uuid, ${row.topup_amount_cents}, ${"credit"},
                               ${"Auto-recharge"}, ${liSql.json({ source: "auto_recharge", stripe_session_id: pi.id, env: stripe.env })})
        `;
      } else {
        console.error(`[auto-recharge] ${row.name} charged but has no app wallet to credit`);
        continue;
      }
      console.log(`[auto-recharge] +${row.topup_amount_cents}c for ${row.name} (pi ${pi.id})`);
      await sql`
        INSERT INTO platform.audit_log (actor_user_id, action, metadata)
        VALUES (NULL, 'auto_recharge_succeeded', ${sql.json({ customer_id: row.customer_id, name: row.name, amount_cents: row.topup_amount_cents, payment_intent: pi.id })})
      `.catch(() => {});
    } catch (e) {
      // Charged but credit failed — log loudly; the pi.id dedup means a later
      // manual credit with the same id won't double-fund.
      console.error(`[auto-recharge] CREDIT FAILED AFTER CHARGE for ${row.name} (pi ${pi.id}):`, (e as Error).message);
      await sql`
        INSERT INTO platform.audit_log (actor_user_id, action, metadata)
        VALUES (NULL, 'auto_recharge_credit_failed', ${sql.json({ customer_id: row.customer_id, name: row.name, payment_intent: pi.id, error: (e as Error).message })})
      `.catch(() => {});
    }
  }
}

export function startAutoRecharge(): void {
  // First pass shortly after boot, then every 2 minutes.
  setTimeout(() => rechargeOnce().catch(() => {}), 20_000);
  setInterval(() => rechargeOnce().catch(() => {}), 120_000);
}
