// DEBUG: temporary endpoint to verify platform-db wiring. Remove before launch.
import {
  userHasAccess,
  getPlatformUserId,
  extractUserIdFromJwt,
} from "../_shared/platform.ts";

Deno.serve(async (req: Request) => {
  const acqUserId = extractUserIdFromJwt(req);
  if (!acqUserId) {
    return new Response(JSON.stringify({ error: "no JWT" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const [platformUserId, hasACQ, hasLI] = await Promise.all([
    getPlatformUserId(acqUserId),
    userHasAccess(acqUserId, "acq_coach"),
    userHasAccess(acqUserId, "lead_intel"),
  ]);
  const seenKeys: Record<string, string> = {};
  for (const k of ["OPENAI_API_KEY","ANTHROPIC_API_KEY","DEEPGRAM_API_KEY","STRIPE_TEST_SECRET_KEY","RESEND_API_KEY","USAGE_MARKUP_MULTIPLIER"]) {
    const v = Deno.env.get(k) ?? "";
    seenKeys[k] = v ? (k === "USAGE_MARKUP_MULTIPLIER" ? v : `${v.slice(0,4)}…${v.slice(-4)} (${v.length})`) : "(unset)";
  }
  return new Response(
    JSON.stringify({
      acq_user_id: acqUserId, platform_user_id: platformUserId,
      has_acq_coach: hasACQ, has_lead_intel: hasLI,
      platform_db_url_set: !!Deno.env.get("PLATFORM_DB_URL"),
      master_keys_in_worker_env: seenKeys,
    }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
