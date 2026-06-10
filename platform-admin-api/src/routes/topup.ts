// Stripe top-up + add-card flow for the unified Account → Billing tab.
//
// Two endpoints:
//   POST /me/customer/:cid/topup       body: { amount_cents }
//       → creates a Stripe Checkout Session in "payment" mode that:
//         (a) creates/reuses the Stripe customer for this platform customer
//         (b) charges amount_cents, saving the card for future use
//         (c) on success, the per-app webhook (existing) credits the wallet
//   POST /me/customer/:cid/billing-portal
//       → creates a Stripe Billing Portal session so the customer can
//         manage payment methods, see invoices, update auto-recharge.
//
// Both pull STRIPE_TEST_SECRET_KEY / STRIPE_LIVE_SECRET_KEY from master_keys
// (or env fallback). Env STRIPE_ENV chooses test vs live; defaults to test.

import { sql } from "../db.ts";
import { json } from "../auth.ts";

interface AuthedReq { sub: string; jwt: string }

async function resolveCallerCustomer(authed: AuthedReq, cid: string): Promise<
  | { ok: true; isAdmin: boolean; platformUserId: string; email: string }
  | Response
> {
  const userRows = await sql<{ id: string; email: string; is_platform_admin: boolean }[]>`
    SELECT id, email, is_platform_admin FROM platform.users
    WHERE acq_user_id = ${authed.sub}::uuid OR leadintel_user_id = ${authed.sub}::uuid
    LIMIT 1
  `;
  if (userRows.length === 0) return json({ error: "unauthorized" }, 401);
  const u = userRows[0];
  if (!u.is_platform_admin) {
    const m = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM platform.customer_users
      WHERE user_id = ${u.id}::uuid AND customer_id = ${cid}::uuid
    `;
    if (m[0].c === 0) return json({ error: "forbidden" }, 403);
  }
  return { ok: true, isAdmin: u.is_platform_admin, platformUserId: u.id, email: u.email };
}

async function getMasterKey(name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const rows = await sql<{ key_value: string }[]>`
    SELECT key_value FROM platform.master_keys WHERE key_name = ${name} LIMIT 1
  `;
  return rows[0]?.key_value ?? null;
}

async function getStripe(): Promise<{ secret: string; env: "test" | "live" }> {
  // Mode comes from the STRIPE_ENV master key (settable in Platform Settings
  // UI) with container-env fallback; anything but "live" means test.
  const env = ((await getMasterKey("STRIPE_ENV")) ?? "test").toLowerCase() === "live" ? "live" : "test";
  const key = await getMasterKey(env === "live" ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_TEST_SECRET_KEY");
  if (!key) throw new Error(`Stripe ${env} secret key not configured — set it in Platform Settings → Master Keys`);
  return { secret: key, env };
}

// Wrap Stripe REST calls. We only use Customers + Checkout Sessions + Billing
// Portal so a tiny fetch is easier than pulling the SDK into this Deno app.
async function stripe(secret: string, path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Stripe ${path} failed (${r.status})`);
  return d;
}

// Ensure platform.billing_settings has a stripe_customer_id for this customer.
// Creates one in Stripe if missing.
async function ensureStripeCustomer(cid: string, customerName: string, email: string, secret: string, env: "test" | "live"): Promise<string> {
  const rows = await sql<{ stripe_customer_id: string | null }[]>`
    SELECT stripe_customer_id FROM platform.billing_settings WHERE customer_id = ${cid}::uuid
  `;
  if (rows[0]?.stripe_customer_id) return rows[0].stripe_customer_id;

  const stripeCust = await stripe(secret, "customers", {
    name: customerName,
    email,
    "metadata[platform_customer_id]": cid,
    "metadata[env]": env,
  });
  await sql`
    INSERT INTO platform.billing_settings (customer_id, stripe_customer_id, stripe_env)
    VALUES (${cid}::uuid, ${stripeCust.id}, ${env})
    ON CONFLICT (customer_id) DO UPDATE
    SET stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_env = EXCLUDED.stripe_env
  `;
  return stripeCust.id;
}

// POST /me/customer/:cid/topup
export async function createTopupSession(req: Request, cid: string): Promise<Response> {
  const body = await req.json().catch(() => null) as { amount_cents?: number } | null;
  const amount = Number(body?.amount_cents ?? 0);
  if (!Number.isFinite(amount) || amount < 500 || amount > 500_000) {
    return json({ error: "bad_request", reason: "amount_cents must be 500–500000 (i.e. $5–$5000)" }, 400);
  }
  const authed = parseAuthed(req);
  if (authed instanceof Response) return authed;
  const r = await resolveCallerCustomer(authed, cid);
  if (r instanceof Response) return r;

  const cust = await sql<{ id: string; name: string }[]>`SELECT id, name FROM platform.customers WHERE id = ${cid}::uuid`;
  if (cust.length === 0) return json({ error: "not_found" }, 404);

  let stripeInfo;
  try { stripeInfo = await getStripe(); }
  catch (e) { return json({ error: "stripe_misconfigured", message: (e as Error).message }, 500); }

  let stripeCustomerId: string;
  try {
    stripeCustomerId = await ensureStripeCustomer(cid, cust[0].name, r.email, stripeInfo.secret, stripeInfo.env);
  } catch (e) {
    return json({ error: "stripe_customer_failed", message: (e as Error).message }, 500);
  }

  const successUrl = new URL(req.url).origin.replace(/^https?:\/\/admin-api/, "") + "/#/account/billing?topup=success";
  const cancelUrl  = new URL(req.url).origin.replace(/^https?:\/\/admin-api/, "") + "/#/account/billing?topup=canceled";

  try {
    const session = await stripe(stripeInfo.secret, "checkout/sessions", {
      mode: "payment",
      customer: stripeCustomerId,
      // Save the card for future top-ups / auto-recharge
      "payment_intent_data[setup_future_usage]": "off_session",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": `Closer Control credit · ${cust[0].name}`,
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][quantity]": "1",
      "metadata[platform_customer_id]": cid,
      "metadata[purpose]": "wallet_topup",
      success_url: successUrl,
      cancel_url:  cancelUrl,
    });

    await sql`
      INSERT INTO platform.audit_log (actor_user_id, action, metadata)
      VALUES (
        ${r.platformUserId}::uuid,
        'topup_session_created',
        ${sql.json({ customer_id: cid, customer_name: cust[0].name, amount_cents: amount, stripe_session: session.id })}
      )
    `;
    return json({ ok: true, checkout_url: session.url, session_id: session.id });
  } catch (e) {
    return json({ error: "stripe_checkout_failed", message: (e as Error).message }, 500);
  }
}

// POST /me/customer/:cid/billing-portal — open Stripe's hosted portal to manage cards / invoices
export async function createBillingPortalSession(req: Request, cid: string): Promise<Response> {
  const authed = parseAuthed(req);
  if (authed instanceof Response) return authed;
  const r = await resolveCallerCustomer(authed, cid);
  if (r instanceof Response) return r;

  const cust = await sql<{ name: string }[]>`SELECT name FROM platform.customers WHERE id = ${cid}::uuid`;
  if (cust.length === 0) return json({ error: "not_found" }, 404);

  let stripeInfo;
  try { stripeInfo = await getStripe(); }
  catch (e) { return json({ error: "stripe_misconfigured", message: (e as Error).message }, 500); }

  const stripeCustomerId = await ensureStripeCustomer(cid, cust[0].name, r.email, stripeInfo.secret, stripeInfo.env);

  const returnUrl = new URL(req.url).origin.replace(/^https?:\/\/admin-api/, "") + "/#/account/billing";

  try {
    const session = await stripe(stripeInfo.secret, "billing_portal/sessions", {
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return json({ ok: true, portal_url: session.url });
  } catch (e) {
    return json({ error: "stripe_portal_failed", message: (e as Error).message }, 500);
  }
}

function parseAuthed(req: Request): AuthedReq | Response {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const jwt = auth.slice(7);
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1] || ""));
    if (typeof payload.sub !== "string") throw new Error("no sub");
    return { sub: payload.sub, jwt };
  } catch { return json({ error: "unauthorized" }, 401); }
}
