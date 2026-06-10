// ONE centralized Stripe webhook for the whole platform.
//
// Register a SINGLE endpoint in Stripe:
//   https://<launcher-host>/admin-api/stripe/webhook
// (the launcher nginx proxies /admin-api/* to this service).
//
// Replaces the old per-app payments-webhook flow for top-ups. The platform
// owns one Stripe customer per platform.customer, so one webhook receiver is
// the right shape — it looks up the customer, credits the correct app wallet
// (charges are drawn from app wallets, so a top-up must land in one), saves
// the card to platform.billing_settings, re-aggregates platform.customer_
// wallet, and records platform.wallet_transactions.
//
// Auth: NOT a JWT route. Stripe signs each request; we verify the
// Stripe-Signature header (HMAC-SHA256 over `${t}.${rawBody}`) against the
// webhook signing secret. An unverified request is rejected 400.
//
// Idempotent: platform.wallet_transactions.stripe_session_id is UNIQUE, so a
// replayed event is a no-op (ON CONFLICT DO NOTHING + early-out).

import { sql, acqSql, liSql } from "../db.ts";

const enc = new TextEncoder();

async function getMasterKey(name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  try {
    const rows = await sql<{ key_value: string }[]>`
      SELECT key_value FROM platform.master_keys WHERE key_name = ${name} LIMIT 1
    `;
    return rows[0]?.key_value ?? null;
  } catch { return null; }
}

// Constant-time-ish hex compare.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyStripeSig(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  // Header: "t=1700000000,v1=hexsig[,v0=...]"
  const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=", 2)));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // Reject very old timestamps (>5min) to blunt replay.
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, v1);
}

// Minimal Stripe GET for retrieving the PaymentIntent (card details).
async function stripeGet(secret: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function stripeWebhook(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // Which mode? STRIPE_ENV master key (test|live) picks the signing secret.
  const env = ((await getMasterKey("STRIPE_ENV")) ?? "test").toLowerCase() === "live" ? "live" : "test";
  const whSecret  = await getMasterKey(env === "live" ? "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_TEST_WEBHOOK_SECRET");
  const apiSecret = await getMasterKey(env === "live" ? "STRIPE_LIVE_SECRET_KEY"     : "STRIPE_TEST_SECRET_KEY");

  if (!whSecret) {
    console.error("[stripe-webhook] no webhook secret configured for env:", env);
    return new Response(JSON.stringify({ error: "webhook secret not configured" }), { status: 500 });
  }
  if (!(await verifyStripeSig(rawBody, sigHeader, whSecret))) {
    console.warn("[stripe-webhook] signature verification failed");
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 400 });
  }

  let event: Record<string, any>;
  try { event = JSON.parse(rawBody); } catch { return new Response("bad json", { status: 400 }); }

  // We only act on completed checkouts that are wallet top-ups.
  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200 });
  }

  const session = event.data?.object ?? {};
  const md = session.metadata ?? {};
  if (md.type !== "wallet_topup" || !md.platform_customer_id) {
    return new Response(JSON.stringify({ received: true, ignored: "not a wallet_topup" }), { status: 200 });
  }

  const customerId  = md.platform_customer_id as string;
  const amountCents = Number(md.amount_cents || session.amount_total || 0);
  const sessionId   = session.id as string;
  if (amountCents <= 0) {
    return new Response(JSON.stringify({ received: true, ignored: "zero amount" }), { status: 200 });
  }

  // Idempotency: bail if we've already recorded this session.
  const dup = await sql<{ id: string }[]>`
    SELECT id FROM platform.wallet_transactions WHERE stripe_session_id = ${sessionId} LIMIT 1
  `;
  if (dup.length > 0) {
    return new Response(JSON.stringify({ received: true, deduped: true }), { status: 200 });
  }

  // Resolve customer + its app back-pointers.
  const custRows = await sql<{ acq_account_id: string | null; leadintel_tenant_id: string | null }[]>`
    SELECT acq_account_id, leadintel_tenant_id FROM platform.customers WHERE id = ${customerId}::uuid
  `;
  if (custRows.length === 0) {
    console.error("[stripe-webhook] unknown platform_customer_id:", customerId);
    return new Response(JSON.stringify({ error: "unknown customer" }), { status: 200 }); // 200 so Stripe doesn't retry forever
  }
  const { acq_account_id, leadintel_tenant_id } = custRows[0];

  // Card details from the PaymentIntent (best-effort).
  let pmId: string | null = null, brand: string | null = null, last4: string | null = null;
  let expM: number | null = null, expY: number | null = null;
  let stripeCustomerId: string | null = typeof session.customer === "string" ? session.customer : null;
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (piId && apiSecret) {
    const pi = await stripeGet(apiSecret, `payment_intents/${piId}?expand[]=payment_method`);
    const pm = pi?.payment_method as Record<string, any> | undefined;
    if (pm && typeof pm === "object") {
      pmId = pm.id ?? null;
      if (pm.card) { brand = pm.card.brand ?? null; last4 = pm.card.last4 ?? null; expM = pm.card.exp_month ?? null; expY = pm.card.exp_year ?? null; }
    }
    if (!stripeCustomerId && pi?.customer) stripeCustomerId = typeof pi.customer === "string" ? pi.customer : (pi.customer as any).id;
  }

  // Credit the app wallet — charges are drawn from app wallets, so the top-up
  // must land in one. Prefer ACQ; fall back to LI. product tag follows suit.
  let product: "acq_coach" | "lead_intel";
  try {
    if (acq_account_id && acqSql) {
      product = "acq_coach";
      await acqSql`
        SELECT credit_wallet(
          ${acq_account_id}::uuid, ${amountCents}, ${"Stripe top-up"},
          ${sessionId}, ${acqSql.json({ stripe_customer_id: stripeCustomerId, payment_method_id: pmId, card_brand: brand, card_last4: last4, stripe_mode: env })}, ${"credit"}
        )
      `;
      const patch: Record<string, unknown> = { account_id: acq_account_id };
      await acqSql`
        INSERT INTO billing_settings (account_id, stripe_customer_id, default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, updated_at)
        VALUES (${acq_account_id}::uuid, ${stripeCustomerId}, ${pmId}, ${brand}, ${last4}, ${expM}, ${expY}, now())
        ON CONFLICT (account_id) DO UPDATE SET
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, billing_settings.stripe_customer_id),
          default_payment_method_id = COALESCE(EXCLUDED.default_payment_method_id, billing_settings.default_payment_method_id),
          card_brand = COALESCE(EXCLUDED.card_brand, billing_settings.card_brand),
          card_last4 = COALESCE(EXCLUDED.card_last4, billing_settings.card_last4),
          card_exp_month = COALESCE(EXCLUDED.card_exp_month, billing_settings.card_exp_month),
          card_exp_year = COALESCE(EXCLUDED.card_exp_year, billing_settings.card_exp_year),
          updated_at = now()
      `;
      void patch;
    } else if (leadintel_tenant_id && liSql) {
      product = "lead_intel";
      await liSql`
        SELECT credit_wallet(
          ${leadintel_tenant_id}::uuid, ${amountCents}, ${"credit"}, ${"Stripe top-up"},
          ${liSql.json({ stripe_customer_id: stripeCustomerId, payment_method_id: pmId, card_brand: brand, card_last4: last4, stripe_session_id: sessionId, stripe_mode: env })}
        )
      `;
    } else {
      console.error("[stripe-webhook] customer has no app wallet to credit:", customerId);
      return new Response(JSON.stringify({ error: "no app wallet" }), { status: 200 });
    }
  } catch (e) {
    console.error("[stripe-webhook] credit_wallet failed:", (e as Error).message);
    return new Response(JSON.stringify({ error: "credit failed", detail: (e as Error).message }), { status: 500 });
  }

  // Save the card to the platform billing record too (primary view).
  await sql`
    INSERT INTO platform.billing_settings (customer_id, stripe_customer_id, stripe_env, default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, updated_at)
    VALUES (${customerId}::uuid, ${stripeCustomerId}, ${env}, ${pmId}, ${brand}, ${last4}, ${expM}, ${expY}, now())
    ON CONFLICT (customer_id) DO UPDATE SET
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, platform.billing_settings.stripe_customer_id),
      stripe_env = EXCLUDED.stripe_env,
      default_payment_method_id = COALESCE(EXCLUDED.default_payment_method_id, platform.billing_settings.default_payment_method_id),
      card_brand = COALESCE(EXCLUDED.card_brand, platform.billing_settings.card_brand),
      card_last4 = COALESCE(EXCLUDED.card_last4, platform.billing_settings.card_last4),
      card_exp_month = COALESCE(EXCLUDED.card_exp_month, platform.billing_settings.card_exp_month),
      card_exp_year = COALESCE(EXCLUDED.card_exp_year, platform.billing_settings.card_exp_year),
      updated_at = now()
  `;

  // Unified ledger: credit_wallet above already drove platform.customer_wallet
  // (via fdw) AND wrote the platform.wallet_transactions row. Do NOT re-sum the
  // app wallets — they now MIRROR the shared balance, so summing double-counts.
  // Just read the authoritative balance and mirror it into the OTHER app's
  // wallet so both UIs are fresh after the top-up.
  const pw = await sql<{ balance_cents: number }[]>`
    SELECT balance_cents FROM platform.customer_wallet WHERE customer_id = ${customerId}::uuid
  `;
  const total = pw[0]?.balance_cents ?? 0;
  if (product === "acq_coach" && leadintel_tenant_id && liSql) {
    try {
      await liSql`
        INSERT INTO wallets (tenant_id, balance_cents) VALUES (${leadintel_tenant_id}::uuid, ${total})
        ON CONFLICT (tenant_id) DO UPDATE SET balance_cents = ${total}, updated_at = now()
      `;
    } catch (e) { console.error("[stripe-webhook] li mirror:", (e as Error).message); }
  } else if (product === "lead_intel" && acq_account_id && acqSql) {
    try {
      await acqSql`
        INSERT INTO wallets (account_id, balance_cents) VALUES (${acq_account_id}::uuid, ${total})
        ON CONFLICT (account_id) DO UPDATE SET balance_cents = ${total}, updated_at = now()
      `;
    } catch (e) { console.error("[stripe-webhook] acq mirror:", (e as Error).message); }
  }

  console.log(`[stripe-webhook] credited ${product} ${amountCents}c for customer ${customerId} (unified balance ${total}c)`);
  return new Response(JSON.stringify({ received: true, credited: amountCents, balance: total }), { status: 200 });
}
