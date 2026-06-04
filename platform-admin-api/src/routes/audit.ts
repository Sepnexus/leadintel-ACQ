// /admin-api/audit — recent activity stream.

import { sql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

// GET /admin-api/audit?limit=100&action=<filter>
export async function listAudit(req: Request, _admin: AuthedAdmin): Promise<Response> {
  const url = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "100") || 100, 500);
  const action = url.searchParams.get("action")?.trim();

  const rows = action
    ? await sql`
        SELECT a.id, a.created_at, a.action, a.metadata,
               a.actor_user_id, actor.email AS actor_email,
               a.target_user_id, target.email AS target_email,
               a.product
        FROM platform.audit_log a
          LEFT JOIN platform.users actor  ON actor.id  = a.actor_user_id
          LEFT JOIN platform.users target ON target.id = a.target_user_id
        WHERE a.action = ${action}
        ORDER BY a.created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT a.id, a.created_at, a.action, a.metadata,
               a.actor_user_id, actor.email AS actor_email,
               a.target_user_id, target.email AS target_email,
               a.product
        FROM platform.audit_log a
          LEFT JOIN platform.users actor  ON actor.id  = a.actor_user_id
          LEFT JOIN platform.users target ON target.id = a.target_user_id
        ORDER BY a.created_at DESC
        LIMIT ${limit}
      `;
  return json({ events: rows, count: rows.length });
}
