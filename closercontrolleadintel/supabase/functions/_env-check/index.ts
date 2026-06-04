// Returns which env vars are SET in this edge runtime. Names + boolean only.

import { extractUserIdFromJwt } from "../_shared/platform.ts";

const EXPECTED_KEYS = [
  "ANTHROPIC_API_KEY",
  "DEEPGRAM_API_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_PUBLISHABLE_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
  "STRIPE_LIVE_SECRET_KEY",
  "STRIPE_LIVE_PUBLISHABLE_KEY",
  "STRIPE_LIVE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "GHL_PIT_TOKEN",
  "GHL_LOCATION_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLATFORM_DB_URL",
];

Deno.serve((req: Request) => {
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
    length: Deno.env.get(name)?.length ?? 0,
  }));

  return new Response(
    JSON.stringify({ product: "lead_intel", keys: result, checked_at: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } },
  );
});
