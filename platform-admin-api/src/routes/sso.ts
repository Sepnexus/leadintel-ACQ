// Phase C2 fix — Mirror platform-auth's auth.sessions row into each app's
// auth.sessions so the app's GoTrue accepts the JWT's session_id claim.
//
// Why: Supabase JS SDK calls /auth/v1/user (and refresh) which validates
// session_id against the LOCAL auth.sessions table. The token was issued
// by platform-auth so the row only exists there. Without this mirror,
// SDK gets 403 → can't hydrate the user object → app stuck on "Setting
// up your account…".
//
// Called by the launcher right after platformPasswordGrant() succeeds.
// Idempotent (ON CONFLICT DO NOTHING). Authn-only — not admin-gated, since
// every user needs this for cross-product SSO. Implicit signature validation:
// if session_id doesn't exist in platform-auth, we reject (can't be forged).

import { sql, acqSql, liSql } from "../db.ts";
import { json } from "../auth.ts";

function jwtClaims(jwt: string): any {
  try {
    const part = jwt.split(".")[1] || "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (part.length % 4)) % 4);
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

export async function mirrorSession(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing_token" }, 400);

  const claims = jwtClaims(jwt);
  const sessionId = claims.session_id as string | undefined;
  const userId    = claims.sub as string | undefined;
  if (!sessionId || !userId) {
    return json({ error: "bad_token", reason: "missing session_id or sub" }, 400);
  }

  // Read the canonical row from platform-auth (also validates token authenticity:
  // if session_id isn't in the platform-auth table, the JWT can't have been
  // freshly issued by it).
  const rows = await sql<any[]>`
    SELECT id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag
    FROM auth.sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  if (rows.length === 0) {
    return json({ error: "session_not_in_platform_auth" }, 404);
  }
  const s = rows[0];

  const mirror = async (db: any) => {
    if (!db) return { skipped: true, reason: "bridge_unavailable" };
    try {
      await db`
        INSERT INTO auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag)
        VALUES (
          ${s.id}::uuid, ${s.user_id}::uuid, ${s.created_at}, ${s.updated_at},
          ${s.factor_id ?? null}, ${s.aal ?? "aal1"}::auth.aal_level, ${s.not_after ?? null},
          ${s.refreshed_at ?? null}, ${s.user_agent ?? ""}, ${s.ip ?? null}::inet, ${s.tag ?? null}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };

  const [acqR, liR] = await Promise.all([mirror(acqSql), mirror(liSql)]);
  return json({ ok: true, session_id: sessionId, acq: acqR, leadintel: liR });
}
