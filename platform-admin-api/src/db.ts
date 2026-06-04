// Single pooled postgres client for the admin-api.
// Uses the platform_admin role (RW on platform.users + customer + access tables).

import postgres from "npm:postgres@3.4.5";

const url = Deno.env.get("PLATFORM_ADMIN_DB_URL");
if (!url) {
  console.error("[admin-api] PLATFORM_ADMIN_DB_URL is not set");
  Deno.exit(1);
}

export const sql = postgres(url!, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 5,
  prepare: false,
});

// Bridge connections to each app DB — used to mirror GHL tokens so existing
// edge functions keep reading from their local plaintext copies until B2/B3
// migrates the read path. Optional: if URL is missing we skip the mirror.
const acqUrl = Deno.env.get("ACQ_DB_URL");
const liUrl  = Deno.env.get("LEADINTEL_DB_URL");

export const acqSql = acqUrl
  ? postgres(acqUrl, { max: 3, idle_timeout: 30, connect_timeout: 5, prepare: false })
  : null;

export const liSql = liUrl
  ? postgres(liUrl, { max: 3, idle_timeout: 30, connect_timeout: 5, prepare: false })
  : null;

// Fail fast on platform-db; warn but proceed if app DBs aren't reachable.
try {
  const r = await sql<{ ok: number }[]>`SELECT 1 AS ok`;
  if (r[0]?.ok !== 1) throw new Error("unexpected response");
  console.log("[admin-api] platform-db reachable");
} catch (e) {
  console.error("[admin-api] cannot reach platform-db:", (e as Error).message);
  Deno.exit(1);
}

for (const [name, client] of [["acq", acqSql], ["leadintel", liSql]] as const) {
  if (!client) { console.warn(`[admin-api] ${name} bridge DB not configured`); continue; }
  try {
    await client`SELECT 1`;
    console.log(`[admin-api] ${name} bridge DB reachable`);
  } catch (e) {
    console.warn(`[admin-api] ${name} bridge DB unreachable (proceeding):`, (e as Error).message);
  }
}

export const TOKEN_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY");
if (!TOKEN_KEY || TOKEN_KEY.length < 16) {
  console.warn("[admin-api] TOKEN_ENCRYPTION_KEY is missing or short — GHL token routes will refuse writes.");
}
