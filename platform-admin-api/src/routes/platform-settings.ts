// /admin-api/platform-settings/keys — aggregate env var status across both
// edge runtimes + the admin-api itself.
//
// Calls each app's /functions/v1/_env-check with the admin JWT and combines.

import { AuthedAdmin, json } from "../auth.ts";

interface KeyStatus {
  name: string;
  set: boolean;
  length: number;
}
interface ProductReport {
  product: "acq_coach" | "lead_intel" | "admin_api";
  keys: KeyStatus[];
  fetched: boolean;
  error?: string;
}

const ACQ_INTERNAL_URL = Deno.env.get("ACQ_INTERNAL_API_URL") ?? "http://acq-coach:54321";
const LI_INTERNAL_URL  = Deno.env.get("LEADINTEL_INTERNAL_API_URL") ?? "http://leadintel:54321";

async function fetchEdgeKeys(baseUrl: string, jwt: string, product: "acq_coach" | "lead_intel"): Promise<ProductReport> {
  try {
    const r = await fetch(`${baseUrl}/functions/v1/_env-check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) {
      return { product, keys: [], fetched: false, error: `${product} returned HTTP ${r.status}` };
    }
    const body = await r.json();
    return { product, keys: body.keys ?? [], fetched: true };
  } catch (e) {
    return { product, keys: [], fetched: false, error: (e as Error).message };
  }
}

// Admin-api's own env-var status — TOKEN_ENCRYPTION_KEY, PLATFORM_ADMIN_DB_URL etc.
function adminApiKeys(): ProductReport {
  const ENV_KEYS = [
    "PLATFORM_ADMIN_DB_URL",
    "TOKEN_ENCRYPTION_KEY",
    "ACQ_DB_URL",
    "LEADINTEL_DB_URL",
  ];
  const keys: KeyStatus[] = ENV_KEYS.map(name => ({
    name,
    set: !!Deno.env.get(name),
    length: Deno.env.get(name)?.length ?? 0,
  }));
  return { product: "admin_api", keys, fetched: true };
}

export async function listPlatformKeys(req: Request, _admin: AuthedAdmin): Promise<Response> {
  // Use the caller's JWT to call _env-check (the function only requires a
  // valid sub claim, not platform_admin specifically — admin-api already
  // gated this whole route on platform_admin).
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  const [acq, li] = await Promise.all([
    fetchEdgeKeys(ACQ_INTERNAL_URL, jwt, "acq_coach"),
    fetchEdgeKeys(LI_INTERNAL_URL,  jwt, "lead_intel"),
  ]);
  const adminApi = adminApiKeys();

  return json({
    reports: [adminApi, acq, li],
    note: "Values are never returned. To rotate a key, SSH to the VPS and edit the relevant .env, then `docker compose restart`.",
  });
}
