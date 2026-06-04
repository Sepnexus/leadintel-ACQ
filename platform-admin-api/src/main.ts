// platform-admin-api — small HTTP server that backs the launcher's admin UI.
//
// Only the launcher reaches this service (over the docker bridge network).
// Every route requires a JWT from EITHER ACQ or Lead Intel, with the bearer
// matching a platform.users row where is_platform_admin = true.

import { requireAdmin, requireAuthedJwt, AuthedAdmin, json } from "./auth.ts";
import "./db.ts"; // boots the connection pool + fail-fast check

import { listCustomers, getCustomer, setCustomerAccess, updateCustomer, createCustomer } from "./routes/customers.ts";
import { listUsers, getUser } from "./routes/users.ts";
import { listAudit } from "./routes/audit.ts";
import { setGhlCredentials, revealGhlToken, validateGhlCredentials } from "./routes/ghl-credentials.ts";
import { listPlatformKeys } from "./routes/platform-settings.ts";
import { refreshWallet } from "./routes/wallet.ts";
import { mirrorSession } from "./routes/sso.ts";

const PORT = Number(Deno.env.get("PORT") ?? "8080");

// Simple router. Methods × pattern → handler.
type Handler = (req: Request, admin: AuthedAdmin, ...params: string[]) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [
  { method: "GET",   pattern: /^\/admin-api\/me\/?$/,                     handler: async (_req, admin) => json({ admin }) },
  { method: "GET",   pattern: /^\/admin-api\/customers\/?$/,              handler: listCustomers },
  { method: "POST",  pattern: /^\/admin-api\/customers\/?$/,              handler: createCustomer },
  { method: "GET",   pattern: /^\/admin-api\/customers\/([0-9a-f-]+)\/?$/, handler: getCustomer },
  { method: "PATCH", pattern: /^\/admin-api\/customers\/([0-9a-f-]+)\/?$/, handler: updateCustomer },
  { method: "POST",  pattern: /^\/admin-api\/customers\/([0-9a-f-]+)\/access\/?$/, handler: setCustomerAccess },
  { method: "PATCH", pattern: /^\/admin-api\/customers\/([0-9a-f-]+)\/ghl\/?$/, handler: setGhlCredentials },
  { method: "GET",   pattern: /^\/admin-api\/customers\/([0-9a-f-]+)\/ghl\/token\/?$/, handler: revealGhlToken },
  { method: "POST",  pattern: /^\/admin-api\/customers\/([0-9a-f-]+)\/ghl\/validate\/?$/, handler: validateGhlCredentials },
  { method: "GET",   pattern: /^\/admin-api\/users\/?$/,                  handler: listUsers },
  { method: "GET",   pattern: /^\/admin-api\/users\/([0-9a-f-]+)\/?$/,     handler: getUser },
  { method: "GET",   pattern: /^\/admin-api\/audit\/?$/,                  handler: listAudit },
  { method: "GET",   pattern: /^\/admin-api\/platform-settings\/keys\/?$/, handler: listPlatformKeys },
  { method: "POST",  pattern: /^\/admin-api\/customers\/([0-9a-f-]+)\/wallet\/refresh\/?$/, handler: refreshWallet },
];

// Health endpoint — un-auth'd for the launcher's status pings.
const HEALTH = /^\/admin-api\/health\/?$/;

// Authn-only routes (any signed-in user, no admin requirement). Phase C2 SSO.
const AUTHN_ONLY: { method: string; pattern: RegExp; handler: (req: Request) => Promise<Response> }[] = [
  { method: "POST", pattern: /^\/admin-api\/sso\/mirror-session\/?$/, handler: mirrorSession },
];

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  // CORS preflight — allow any origin for now (launcher proxies same-origin
  // anyway; this only matters if someone hits the service directly during dev).
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Health (no auth)
  if (HEALTH.test(url.pathname)) {
    return new Response("ok\n", { status: 200, headers: { "Content-Type": "text/plain", ...corsHeaders } });
  }

  // Authn-only routes (no admin check, but valid JWT required)
  for (const r of AUTHN_ONLY) {
    if (r.method !== req.method) continue;
    if (!r.pattern.test(url.pathname)) continue;
    const authed = requireAuthedJwt(req);
    if (authed instanceof Response) {
      return new Response(await authed.text(), {
        status: authed.status,
        headers: { ...Object.fromEntries(authed.headers), ...corsHeaders },
      });
    }
    try {
      const res = await r.handler(req);
      return new Response(await res.text(), {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...corsHeaders },
      });
    } catch (e) {
      console.error("[admin-api] authn-only handler error:", (e as Error).stack ?? e);
      return json({ error: "internal", message: (e as Error).message }, 500, corsHeaders);
    }
  }

  // Match an admin route
  let matched: { route: Route; params: string[] } | null = null;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.pattern);
    if (m) { matched = { route: r, params: m.slice(1) }; break; }
  }
  if (!matched) {
    return json({ error: "not_found", path: url.pathname }, 404, corsHeaders);
  }

  // Auth
  const admin = await requireAdmin(req);
  if (admin instanceof Response) {
    // attach CORS headers to the deny response
    return new Response(await admin.text(), {
      status: admin.status,
      headers: { ...Object.fromEntries(admin.headers), ...corsHeaders },
    });
  }

  // Run handler
  try {
    const res = await matched.route.handler(req, admin, ...matched.params);
    return new Response(await res.text(), {
      status: res.status,
      headers: { ...Object.fromEntries(res.headers), ...corsHeaders },
    });
  } catch (e) {
    console.error("[admin-api] handler error:", (e as Error).stack ?? e);
    return json({ error: "internal", message: (e as Error).message }, 500, corsHeaders);
  }
});

console.log(`[admin-api] listening on :${PORT}`);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};
