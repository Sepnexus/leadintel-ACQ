// Setup checklist for a customer — per-app post-creation steps that the
// admin needs to finish inside each app (we don't rebuild that config UI
// at HQ; we just show a checklist + deep-link).

import { sql, acqSql, liSql } from "../db.ts";
import { AuthedAdmin, json } from "../auth.ts";

interface StepStatus { id: string; label: string; done: boolean; detail: string; deep_link?: string }

export async function getSetupStatus(_req: Request, _admin: AuthedAdmin, id: string): Promise<Response> {
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

  // Step 2 — LI pipeline selection (only if LI enabled + tenant exists)
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
          ? "Sync hasn't finished discovering pipelines yet. Comes back here once GHL has been pulled in."
          : selected > 0
          ? `${selected} of ${available} pipelines selected.`
          : `${available} pipelines available — pick at least one to start daily briefings.`,
        // Route through launcher's ?goto= so the user lands inside LI logged in
        // via the cc_sso handoff, NOT on LI's login page.
        deep_link: `http://localhost:8080/?goto=leadintel&hash=/?goto=settings%26settingsNav=pipeline`,
      });
    } catch (e) {
      steps.push({
        id: "li_pipelines",
        label: "Lead Intel — pick which pipelines to track",
        done: false,
        detail: `Couldn't check pipeline status (${(e as Error).message}). Open Lead Intel to set them up.`,
        deep_link: "http://localhost:8080/?goto=leadintel",
      });
    }
  }

  // Step 3 — ACQ rep mapping (only if ACQ enabled + account exists)
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
        deep_link: `http://localhost:8080/?goto=acq`,
      });
    } catch (e) {
      steps.push({
        id: "acq_reps",
        label: "ACQ Coach — map GHL users to reps",
        done: false,
        detail: `Couldn't check rep status (${(e as Error).message}).`,
        deep_link: "http://localhost:8080/?goto=acq",
      });
    }
  }

  const all_done = steps.every(s => s.done);
  return json({ steps, all_done });
}
