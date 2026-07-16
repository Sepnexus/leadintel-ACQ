// Setup checklist for a customer — the onboarding assistant. Shows what still
// needs doing to get a new customer fully live, with deep-links into each app.
// We don't rebuild each app's config UI at HQ; we just tell you what's missing
// and send you to the right place.
//
// Steps (only for products the customer actually has enabled):
//   1. GHL token          — nothing syncs without it
//   2. Users              — nobody can log in until someone is assigned
//   3. Wallet funded      — AI (scoring, briefings, transcription) hard-stops at $0
//   4. LI pipelines       — pick what to track
//   5. ACQ rep mapping    — map GHL users to reps

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

interface StepStatus { id: string; label: string; done: boolean; detail: string; deep_link?: string }

// The launcher's public origin. Derived from the request (the admin-api is
// proxied under the launcher's domain at /admin-api/*), so deep-links work on
// the VPS and locally without config. Previously hardcoded to localhost:8080,
// which made every onboarding link dead in production.
function launcherBase(req: Request): string {
  const fromEnv = Deno.env.get("LAUNCHER_URL");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const referer = req.headers.get("referer");
  if (referer) { try { return new URL(referer).origin; } catch { /* fall through */ } }
  try { return new URL(req.url).origin; } catch { return "http://localhost:8080"; }
}

export async function getSetupStatus(req: Request, _admin: AuthedAdmin, id: string): Promise<Response> {
  const base = launcherBase(req);

  const c = await sql<{
    id: string; name: string; acq_account_id: string | null; leadintel_tenant_id: string | null;
    ghl_pit_token_encrypted: any; ghl_location_id: string | null;
  }[]>`
    SELECT id, name, acq_account_id, leadintel_tenant_id,
           ghl_pit_token_encrypted, ghl_location_id
    FROM platform.customers WHERE id = ${id}::uuid
  `;
  if (c.length === 0) return json({ error: "not_found" }, 404);
  const cust = c[0];

  // Read product access — only show steps for enabled products.
  const access = await sql<{ product: string; enabled: boolean }[]>`
    SELECT product::text, enabled FROM platform.customer_product_access
    WHERE customer_id = ${id}::uuid
  `;
  const hasAcq = access.some(a => a.product === "acq_coach" && a.enabled);
  const hasLi  = access.some(a => a.product === "lead_intel" && a.enabled);

  const steps: StepStatus[] = [];

  // Step 0 — at least one product enabled. Nothing else can be set up without it.
  const anyProduct = hasAcq || hasLi;
  steps.push({
    id: "products",
    label: "Enable a product",
    done: anyProduct,
    detail: anyProduct
      ? `Enabled: ${[hasAcq ? "ACQ Coach" : null, hasLi ? "Lead Intel" : null].filter(Boolean).join(" + ")}.`
      : "Turn on ACQ Coach and/or Lead Intel for this customer — users and setup depend on it.",
  });

  // Step 0b — an enabled product must actually be linked to an app account.
  // Without the link, ensureProvisioned() skips every user of this customer and
  // reports ok:true ("this is fine for ACQ-only customers"), so the panel shows
  // the product GRANTED while the app itself tells users "No tenant assigned".
  // Only surfaced when something is wrong — a healthy customer sees no extra
  // step here.
  const unlinked: string[] = [];
  if (hasAcq && !cust.acq_account_id)      unlinked.push("ACQ Coach");
  if (hasLi  && !cust.leadintel_tenant_id) unlinked.push("Lead Intel");
  if (unlinked.length > 0) {
    steps.push({
      id: "app_link",
      label: `${unlinked.join(" + ")} enabled but not linked to an app account`,
      done: false,
      detail: `Users will get access on paper but see no data. Usually the app already has an account for this GHL location and the link was never written — toggling the product off and on re-attempts it, and now adopts an existing account instead of trying to create a duplicate.`,
    });
  }

  // Step 1 — GHL token set
  const tokenSet = cust.ghl_pit_token_encrypted != null;
  steps.push({
    id: "ghl_token",
    label: "GHL token configured",
    done: tokenSet,
    detail: tokenSet
      ? "Token saved + mirrored to both apps."
      : "Set the GHL Private Integration Token above so the customer's data starts syncing.",
  });

  // Step 2 — someone can actually log in
  const team = await sql<{ n: number }[]>`
    SELECT count(DISTINCT user_id)::int AS n
    FROM platform.customer_users WHERE customer_id = ${id}::uuid
  `;
  const teamCount = team[0]?.n ?? 0;
  steps.push({
    id: "users",
    label: "Add users",
    done: teamCount > 0,
    detail: teamCount > 0
      ? `${teamCount} user${teamCount === 1 ? "" : "s"} can log in and see this customer's products.`
      : "Nobody can log in yet. Create a user in Admin → Users and assign them to this customer — that's what grants access to both apps.",
    deep_link: `${base}/#/admin/users`,
  });

  // Step 3 — wallet has money. AI hard-stops at $0, which silently stalls
  // scoring/briefings/transcription, so surface it as a real setup step.
  const w = await sql<{ balance_cents: number }[]>`
    SELECT balance_cents FROM platform.customer_wallet WHERE customer_id = ${id}::uuid
  `;
  const balance = w[0]?.balance_cents ?? 0;
  steps.push({
    id: "wallet",
    label: "Fund the wallet",
    done: balance > 0,
    detail: balance > 0
      ? `$${(balance / 100).toFixed(2)} available.`
      : "Wallet is empty — call scoring, transcription and briefings will not run until it's funded. Add credit or have the customer top up.",
  });

  // Step 4 — LI pipeline selection (only if LI enabled + tenant exists)
  if (hasLi && cust.leadintel_tenant_id && liSql) {
    try {
      const r = await liSql<{ available: number; selected: number }[]>`
        SELECT
          (SELECT count(*)::int FROM public.tenant_pipelines WHERE tenant_id = ${cust.leadintel_tenant_id}::uuid) AS available,
          (SELECT count(*)::int FROM public.tenant_pipelines WHERE tenant_id = ${cust.leadintel_tenant_id}::uuid AND selected = true) AS selected
      `;
      const { available, selected } = r[0];
      steps.push({
        id: "li_pipelines",
        label: "Lead Intel — pick which pipelines to track",
        done: selected > 0,
        detail: available === 0
          ? "Sync hasn't finished discovering pipelines yet. Come back here once GHL has been pulled in."
          : selected > 0
          ? `${selected} of ${available} pipelines selected.`
          : `${available} pipelines available — pick at least one to start daily briefings.`,
        // Route through the launcher's ?goto= so the user lands inside LI logged
        // in via the cc_sso handoff, NOT on LI's login page.
        deep_link: `${base}/?goto=leadintel&hash=/?goto=settings%26settingsNav=pipeline`,
      });
    } catch (e) {
      steps.push({
        id: "li_pipelines",
        label: "Lead Intel — pick which pipelines to track",
        done: false,
        detail: `Couldn't check pipeline status (${(e as Error).message}). Open Lead Intel to set them up.`,
        deep_link: `${base}/?goto=leadintel`,
      });
    }
  }

  // Step 5 — ACQ rep mapping (only if ACQ enabled + account exists)
  if (hasAcq && cust.acq_account_id && acqSql) {
    try {
      const r = await acqSql<{ users: number; assigned: number }[]>`
        SELECT
          (SELECT count(*)::int FROM public.ghl_users     WHERE account_id = ${cust.acq_account_id}::uuid) AS users,
          (SELECT count(*)::int FROM public.ghl_users     WHERE account_id = ${cust.acq_account_id}::uuid AND role != 'unassigned') AS assigned
      `;
      const { users, assigned } = r[0];
      steps.push({
        id: "acq_reps",
        label: "ACQ Coach — map GHL users to reps",
        done: users > 0 && assigned > 0,
        detail: users === 0
          ? "Waiting for GHL user list to sync."
          : assigned > 0
          ? `${assigned} of ${users} GHL users assigned a role.`
          : `${users} GHL users found — open ACQ to map their roles.`,
        deep_link: `${base}/?goto=acq`,
      });
    } catch (e) {
      steps.push({
        id: "acq_reps",
        label: "ACQ Coach — map GHL users to reps",
        done: false,
        detail: `Couldn't check rep status (${(e as Error).message}).`,
        deep_link: `${base}/?goto=acq`,
      });
    }
  }

  const all_done = steps.every(s => s.done);
  const next = steps.find(s => !s.done)?.label ?? null;
  return json({ steps, all_done, next });
}
