// Direct Stripe SDK integration — no Lovable connector gateway.
//
// Phase B4: replaces the old `connector-gateway.lovable.dev` shim. Every other
// ACQ function (auto-recharge-cron, create-topup-session, payments-webhook)
// already uses STRIPE_TEST_SECRET_KEY / STRIPE_LIVE_SECRET_KEY directly; this
// brings admin-api in line.
//
// Env vars needed:
//   STRIPE_TEST_SECRET_KEY  ─ sk_test_…
//   STRIPE_LIVE_SECRET_KEY  ─ sk_live_…
//
// LOVABLE_API_KEY is NO LONGER USED. Safe to drop from .env after deploy.

import Stripe from "https://esm.sh/stripe@22.0.2";

// "sandbox" kept as an alias for "test" so the existing admin-api callers
// (which pass StripeEnv = "sandbox" | "live") compile without edits.
export type StripeEnv = "sandbox" | "test" | "live";

function envKey(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function getStripeSecretKey(env: StripeEnv): string {
  return env === "live" ? envKey("STRIPE_LIVE_SECRET_KEY") : envKey("STRIPE_TEST_SECRET_KEY");
}

// Back-compat alias: some callers ask for the "connection api key".
// In direct-SDK mode this is identical to the secret key.
export function getConnectionApiKey(env: StripeEnv): string {
  return getStripeSecretKey(env);
}

// Direct-to-Stripe SDK client. No proxy. No Lovable headers.
export function createStripeClient(env: StripeEnv): Stripe {
  return new Stripe(getStripeSecretKey(env), {
    apiVersion: "2026-03-25.dahlia",
  });
}
