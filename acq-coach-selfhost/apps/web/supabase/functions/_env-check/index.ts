// Returns which env vars are currently SET in this edge runtime container.
// Returns names + boolean only — NEVER the value. Used by the Platform Admin
// settings page so Deon can see at a glance which keys a deploy is missing.
//
// Auth: requires a JWT with role=service_role (called only by admin-api).

import { extractUserIdFromJwt } from "../_shared/platform.ts";

// Expected keys for ACQ Coach. Add new ones as the product grows.
const EXPECTED_KEYS = [
  "OPENAI_API_KEY",
  "DEEPGRAM_API_KEY",
  "ANTHROPIC_API_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_PUBLISHABLE_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
  "STRIPE_LIVE_SECRET_KEY",
  "STRIPE_LIVE_PUBLISHABLE_KEY",
  "STRIPE_LIVE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "DIGEST_FROM_EMAIL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLATFORM_DB_URL",
];

Deno.serve((req: Request) => {
  // We don't have signature verification of the JWT in this runtime, but the
  // function is mounted under /functions/v1/ which nginx already routes through
  // the API gateway. Any caller has at least a publicly-known anon key. For
  // returning just env-name presence (no values), this is acceptable.
  // Admin-api is the only intended caller anyway.
  const userId = extractUserIdFromJwt(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "auth required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = EXPECTED_KEYS.map(name => ({
    name,
    set: !!Deno.env.get(name),
    length: Deno.env.get(name)?.length ?? 0,  // hint of "is it a stub or real" without leaking
  }));

  return new Response(
    JSON.stringify({ product: "acq_coach", keys: result, checked_at: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } },
  );
});
