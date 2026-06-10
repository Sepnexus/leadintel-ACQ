// Editable platform master keys (OPENAI_API_KEY, STRIPE_*, etc.).
//
// Read: list of {name, set, length, updated_at, updated_by_email}.
//       Returns metadata only — never the value. Reveal flow could be added
//       later (with confirm=true + audit row) if needed; for now keys are
//       write-only from the admin UI's perspective.
// Write: PUT /:name body { value }.
// Clear: DELETE /:name.

import { sql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

// Whitelist of editable keys. Anything not in this list returns 400.
// This guards against typos creating phantom rows in master_keys and
// also documents what the platform expects.
const ALLOWED: Array<{ name: string; description: string; sensitive?: boolean }> = [
  { name: "OPENAI_API_KEY",            description: "OpenAI — ai-chat, scoring, briefings", sensitive: true },
  { name: "ANTHROPIC_API_KEY",         description: "Anthropic Claude — ai-analyze",        sensitive: true },
  { name: "DEEPGRAM_API_KEY",          description: "Deepgram — call transcription",        sensitive: true },
  { name: "STRIPE_TEST_SECRET_KEY",    description: "Stripe test mode secret key",          sensitive: true },
  { name: "STRIPE_TEST_PUBLISHABLE_KEY", description: "Stripe test mode publishable key" },
  { name: "STRIPE_TEST_WEBHOOK_SECRET", description: "Stripe TEST webhook signing secret (centralized /admin-api/stripe/webhook)",  sensitive: true },
  { name: "STRIPE_LIVE_SECRET_KEY",    description: "Stripe live mode secret key",          sensitive: true },
  { name: "STRIPE_LIVE_PUBLISHABLE_KEY", description: "Stripe live mode publishable key" },
  { name: "STRIPE_LIVE_WEBHOOK_SECRET", description: "Stripe LIVE webhook signing secret (centralized /admin-api/stripe/webhook)",  sensitive: true },
  { name: "STRIPE_ENV",                description: "Stripe mode for checkout/billing-portal: test or live" },
  { name: "RESEND_API_KEY",            description: "Resend — transactional email",         sensitive: true },
  { name: "DIGEST_FROM_EMAIL",         description: "From-address for digest emails" },
  { name: "USAGE_MARKUP_MULTIPLIER",   description: "Multiplier applied to provider costs (e.g. 2.5 = 250%). Default 1.0 = pass-through." },
];

// GET /admin-api/platform-settings/master-keys
export async function listMasterKeys(_req: Request, _admin: AuthedAdmin): Promise<Response> {
  const rows = await sql<{
    key_name: string; len: number; updated_at: string; updated_by_email: string | null;
  }[]>`
    SELECT mk.key_name,
           length(mk.key_value) AS len,
           mk.updated_at,
           u.email AS updated_by_email
    FROM platform.master_keys mk
    LEFT JOIN platform.users u ON u.id = mk.updated_by
  `;
  const byName = Object.fromEntries(rows.map(r => [r.key_name, r]));

  const keys = ALLOWED.map(a => {
    const r = byName[a.name];
    return {
      name: a.name,
      description: a.description,
      sensitive: a.sensitive ?? false,
      set: !!r,
      length: r?.len ?? 0,
      updated_at: r?.updated_at ?? null,
      updated_by_email: r?.updated_by_email ?? null,
    };
  });

  return json({ keys, count: keys.length });
}

// PUT /admin-api/platform-settings/master-keys/:name  body: { value: string }
export async function setMasterKey(req: Request, admin: AuthedAdmin, name: string): Promise<Response> {
  const allowed = ALLOWED.find(a => a.name === name);
  if (!allowed) return json({ error: "unknown_key", reason: `key '${name}' not in allowed list` }, 400);

  const body = await req.json().catch(() => null) as { value?: string } | null;
  const value = body?.value;
  if (typeof value !== "string" || value.length === 0) {
    return json({ error: "bad_request", reason: "expected { value: <non-empty string> }" }, 400);
  }
  if (value.length > 4000) {
    return json({ error: "bad_request", reason: "value too long (max 4000)" }, 400);
  }

  await sql`SELECT platform.set_master_key(${name}, ${value}, ${admin.platformUserId}::uuid)`;

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      'master_key_set',
      ${sql.json({ key_name: name, length: value.length })}
    )
  `;

  return json({ ok: true, key_name: name, length: value.length });
}

// DELETE /admin-api/platform-settings/master-keys/:name
export async function deleteMasterKey(_req: Request, admin: AuthedAdmin, name: string): Promise<Response> {
  const r = await sql`DELETE FROM platform.master_keys WHERE key_name = ${name} RETURNING key_name`;
  if (r.length === 0) return json({ ok: true, key_name: name, was_present: false });

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      'master_key_deleted',
      ${sql.json({ key_name: name })}
    )
  `;

  return json({ ok: true, key_name: name, was_present: true });
}
