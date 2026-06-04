// Caller authentication for admin-api.
//
// The launcher passes a JWT obtained from EITHER ACQ or Lead Intel's GoTrue.
// We decode (without signature verification — see HARDENING TODO below) and
// look up the `sub` claim in platform.users via either back-pointer.
// If `is_platform_admin = true`, we let the request through and pass the
// platform user_id to the route handler.
//
// HARDENING TODO (post-launch): verify JWT signature by trying both apps'
// JWT_SECRET in turn. That requires injecting both secrets into this service's
// env, which is a small docker-compose change. For Thursday-launch v1 we
// trust the network: admin-api is only reachable from inside the docker
// bridge network (no host port exposed); the launcher proxies to it. An
// attacker would already need shell access to a container to talk to it.

import { sql } from "./db.ts";

export interface AuthedAdmin {
  platformUserId: string;
  email: string;
  acqUserId: string | null;
  leadintelUserId: string | null;
}

function decodeJwtSub(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function requireAdmin(req: Request): Promise<AuthedAdmin | Response> {
  const appUserId = decodeJwtSub(req.headers.get("authorization"));
  if (!appUserId) {
    return json({ error: "unauthorized", reason: "missing or malformed Bearer token" }, 401);
  }

  // Look up the platform user via either back-pointer.
  const rows = await sql<{
    id: string; email: string; acq_user_id: string | null;
    leadintel_user_id: string | null; is_platform_admin: boolean;
  }[]>`
    SELECT id, email, acq_user_id, leadintel_user_id, is_platform_admin
    FROM platform.users
    WHERE acq_user_id = ${appUserId}::uuid
       OR leadintel_user_id = ${appUserId}::uuid
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) {
    return json({ error: "unauthorized", reason: "no platform.users record matches this JWT" }, 401);
  }
  if (!user.is_platform_admin) {
    return json({ error: "forbidden", reason: "not a platform admin" }, 403);
  }
  return {
    platformUserId: user.id,
    email: user.email,
    acqUserId: user.acq_user_id,
    leadintelUserId: user.leadintel_user_id,
  };
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// Lighter check than requireAdmin: just confirms a Bearer token is present
// and decodable. Used by sso/mirror-session which any authenticated user
// must be able to call (not just admins). Signature validation is implicit
// because the route checks that session_id exists in platform-auth.auth.sessions
// — a forgery would need to know a real session_id, which requires having
// already authenticated against platform-auth.
export function requireAuthedJwt(req: Request): { sub: string; jwt: string } | Response {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized", reason: "missing Bearer token" }, 401);
  }
  const jwt = authHeader.slice(7);
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1] ?? ""));
    if (typeof payload.sub !== "string") throw new Error("no sub");
    return { sub: payload.sub, jwt };
  } catch {
    return json({ error: "unauthorized", reason: "bad token" }, 401);
  }
}
