// /admin-api/customers/:id/ghl — manage a customer's GHL credentials.
//
// Set:    PATCH /admin-api/customers/:id/ghl       body: { location_id?, pit_token? }
// Reveal: GET   /admin-api/customers/:id/ghl/token?confirm=true
// Validate: POST /admin-api/customers/:id/ghl/validate body: { pit_token }
//          (live-checks the token against GoHighLevel)

import { sql, acqSql, liSql, TOKEN_KEY } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

// PATCH /admin-api/customers/:id/ghl
// Updates location_id (plain) and/or pit_token (encrypted at rest).
// Mirrors the new values into the originating app's DB so existing edge
// functions keep working until Phase B2/B3 retires the local plaintext copies.
export async function setGhlCredentials(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const body = await req.json().catch(() => ({})) as {
    location_id?: string | null;
    pit_token?:   string | null;
  };
  const wantsToken = body.pit_token !== undefined && body.pit_token !== null && body.pit_token !== "";
  const wantsLoc   = body.location_id !== undefined;

  if (!wantsToken && !wantsLoc) {
    return json({ error: "bad_request", reason: "expected at least one of { location_id, pit_token }" }, 400);
  }
  if (wantsToken && !TOKEN_KEY) {
    return json({ error: "server_misconfigured", reason: "TOKEN_ENCRYPTION_KEY is not set in admin-api" }, 500);
  }

  const cust = await sql<{ id: string; name: string; acq_account_id: string | null; leadintel_tenant_id: string | null; ghl_location_id: string | null }[]>`
    SELECT id, name, acq_account_id, leadintel_tenant_id, ghl_location_id
    FROM platform.customers WHERE id = ${id}::uuid
  `;
  if (cust.length === 0) return json({ error: "not_found" }, 404);
  const customer = cust[0];

  // Location update
  if (wantsLoc) {
    const newLoc = body.location_id?.trim() || null;
    if (newLoc && newLoc !== customer.ghl_location_id) {
      // Reject duplicates against another customer
      const dup = await sql`SELECT id, name FROM platform.customers WHERE ghl_location_id = ${newLoc} AND id <> ${id}::uuid`;
      if (dup.length > 0) {
        return json({ error: "duplicate_location_id", reason: `Location belongs to "${dup[0].name}".`, existing_customer_id: dup[0].id }, 409);
      }
    }
    await sql`UPDATE platform.customers SET ghl_location_id = ${newLoc} WHERE id = ${id}::uuid`;
  }

  // Token update — encrypts in platform-db + bridges plaintext into the app DBs
  // for whichever back-pointers exist.
  let token_last_4: string | null = null;
  if (wantsToken) {
    const token = body.pit_token!.trim();
    if (token.length < 8) {
      return json({ error: "bad_request", reason: "token looks too short" }, 400);
    }
    token_last_4 = token.slice(-4);

    await sql`
      SELECT platform.set_ghl_pit_token(
        ${id}::uuid, ${token}, ${TOKEN_KEY!}, ${admin.platformUserId}::uuid
      )
    `;

    // Bridge writes
    if (customer.acq_account_id && acqSql) {
      try {
        await acqSql`UPDATE ghl_accounts SET api_key = ${token} WHERE id = ${customer.acq_account_id}::uuid`;
      } catch (e) {
        console.error("[admin-api] bridge write to acq failed:", (e as Error).message);
      }
    }
    if (customer.leadintel_tenant_id && liSql) {
      try {
        await liSql`UPDATE tenants SET ghl_pit_token = ${token} WHERE id = ${customer.leadintel_tenant_id}::uuid`;
      } catch (e) {
        console.error("[admin-api] bridge write to leadintel failed:", (e as Error).message);
      }
    }
  }

  // Audit
  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      'customer_ghl_credentials_updated',
      ${sql.json({
        customer_id: id,
        customer_name: customer.name,
        location_id_updated: wantsLoc,
        token_updated:       wantsToken,
        token_last_4,
      })}
    )
  `;

  return json({ ok: true, token_last_4 });
}

// GET /admin-api/customers/:id/ghl/token?confirm=true
// Returns the decrypted token. Logs a "token_revealed" audit row.
export async function revealGhlToken(req: Request, admin: AuthedAdmin, id: string): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "true") {
    return json({ error: "bad_request", reason: "add ?confirm=true to acknowledge audit logging" }, 400);
  }
  if (!TOKEN_KEY) {
    return json({ error: "server_misconfigured", reason: "TOKEN_ENCRYPTION_KEY is not set" }, 500);
  }

  const cust = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM platform.customers WHERE id = ${id}::uuid
  `;
  if (cust.length === 0) return json({ error: "not_found" }, 404);

  let token: string | null = null;
  try {
    const r = await sql<{ token: string | null }[]>`
      SELECT platform.get_ghl_pit_token(${id}::uuid, ${TOKEN_KEY!}) AS token
    `;
    token = r[0]?.token ?? null;
  } catch (e) {
    return json({ error: "decrypt_failed", reason: (e as Error).message }, 500);
  }

  if (token === null) {
    return json({ token: null, message: "no token stored for this customer" });
  }

  await sql`
    INSERT INTO platform.audit_log (actor_user_id, action, metadata)
    VALUES (
      ${admin.platformUserId}::uuid,
      'customer_ghl_token_revealed',
      ${sql.json({ customer_id: id, customer_name: cust[0].name })}
    )
  `;

  return json({ token });
}

// POST /admin-api/customers/:id/ghl/validate  body: { pit_token, location_id? }
// Pings GHL with the supplied token to confirm it works before saving.
export async function validateGhlCredentials(req: Request, _admin: AuthedAdmin, id: string): Promise<Response> {
  const body = await req.json().catch(() => null) as { pit_token?: string; location_id?: string } | null;
  if (!body?.pit_token) {
    return json({ error: "bad_request", reason: "pit_token required" }, 400);
  }
  const locRow = await sql<{ ghl_location_id: string | null }[]>`
    SELECT ghl_location_id FROM platform.customers WHERE id = ${id}::uuid
  `;
  if (locRow.length === 0) return json({ error: "not_found" }, 404);
  const locationId = body.location_id?.trim() || locRow[0].ghl_location_id;
  if (!locationId) {
    return json({ error: "bad_request", reason: "no location_id available (set one first)" }, 400);
  }

  try {
    const r = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}`, {
      headers: {
        Authorization: `Bearer ${body.pit_token}`,
        Accept: "application/json",
        Version: "2021-07-28",
      },
    });
    const text = await r.text();
    if (!r.ok) {
      return json({ ok: false, ghl_status: r.status, ghl_response: text.slice(0, 400) }, 200);
    }
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* keep null */ }
    return json({ ok: true, location: parsed });
  } catch (e) {
    return json({ ok: false, error: "network_error", reason: (e as Error).message }, 200);
  }
}
