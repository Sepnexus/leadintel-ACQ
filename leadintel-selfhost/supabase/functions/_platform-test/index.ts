// DEBUG: temporary endpoint to verify platform-db wiring. Remove before launch.
import {
  userHasAccess,
  getPlatformUserId,
  extractUserIdFromJwt,
} from "../_shared/platform.ts";

Deno.serve(async (req: Request) => {
  const liUserId = extractUserIdFromJwt(req);
  if (!liUserId) {
    return new Response(JSON.stringify({ error: "no JWT" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const [platformUserId, hasACQ, hasLI] = await Promise.all([
    getPlatformUserId(liUserId),
    userHasAccess(liUserId, "acq_coach"),
    userHasAccess(liUserId, "lead_intel"),
  ]);
  return new Response(
    JSON.stringify({ leadintel_user_id: liUserId, platform_user_id: platformUserId, has_acq_coach: hasACQ, has_lead_intel: hasLI, platform_db_url_set: !!Deno.env.get("PLATFORM_DB_URL") }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
