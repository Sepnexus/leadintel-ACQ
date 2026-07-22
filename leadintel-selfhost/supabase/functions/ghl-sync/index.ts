import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  resolveTenantContext,
  getTenantGhlCreds,
  TenantContextError,
} from "../_shared/tenantContext.ts";
import { stripHtml } from "../_shared/textUtils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
// Per-request timeout to GHL. Was 25s, which GHL routinely exceeds when we are
// sweeping many tenants at once — the timeout then aborted the whole resource
// sync. Raised, and paired with the retry in ghlFetch. Still well inside the
// 90s per-resource budget, so a slow page costs a retry, not the run.
const GHL_REQUEST_TIMEOUT_MS = 45_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type EdgeRuntimeGlobal = typeof globalThis & {
  EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// Per-request tenant context, passed explicitly to every function that touches
// tenant data.
//
// These were module-level `let`s ("set in the handler before any sync runs").
// That is not safe here: a Deno isolate is reused across concurrent invocations,
// so they were shared state, not per-invocation state. Two tenants syncing at
// the same time — which the all-tenants sweep causes by design — would race:
// tenant A set the globals, awaited a GHL call, tenant B overwrote them, and
// A's remaining rows were written under B's tenant_id, sometimes fetched with
// B's token. That put thousands of contacts in the wrong customer's account and
// made one client's leads visible to another. The per-tenant sync_locks do not
// help: the collision is BETWEEN tenants, not within one.
//
// Passing the context explicitly makes the race structurally impossible — there
// is no shared mutable state left to clobber.
interface TenantCtx {
  tenantId: string;
  pit: string;
  locationId: string;
}

// ---------- Custom field name → ID resolution ----------
// Field IDs differ per GHL location, so we resolve them by name at the
// start of each contact sync run. Names are matched case-insensitively
// after trimming whitespace. Keep the keys here; values are filled at
// runtime by resolveCustomFieldIds(tc).
//
// DEPRECATED: the previous hardcoded ID map (keyed to a single account)
// was removed on 2026-05-01 because IDs varied per tenant and silently
// nulled fields like seller_disposition. Do not reintroduce hardcoded
// IDs here — extend CF_FIELD_NAMES instead.
const CF_FIELD_NAMES: Record<string, string | string[]> = {
  family_name: "Family Name",
  niche_motivation: "Niche Motivation",
  county: "County",
  campaign_name: "Campaign Name",
  bot_type: "Bot Type",
  ai_on: "AI On",
  seller_disposition: "Seller Disposition",
  call_attempts: "Call Attempts",
  last_called_date: "Last Called Date",
  follow_up_due_date: "Follow Up Due Date",
  estimated_equity: "Estimated Equity",
  market_value: "Market Value",
  mortgage_balance: "Mortgage Balance",
  auction_date: "Auction Date",
  auction_status: "Auction Status",
  decedent_name: "Decedent Name",
  decedent_age: "Decedent Age",
  date_of_death: "Date of Death",
  mailing_address: "Mailing Address",
  full_address: "Full Address",
};

type CFMap = Record<string, string | null>;

function normalizeFieldName(s: unknown): string {
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

async function resolveCustomFieldIds(tc: TenantCtx): Promise<{ cf: CFMap; resolved: number; missing: string[] }> {
  const cf: CFMap = {};
  for (const k of Object.keys(CF_FIELD_NAMES)) cf[k] = null;

  let fields: any[] = [];
  try {
    const data = await ghlFetch(tc, `/locations/${tc.locationId}/customFields`);
    fields = Array.isArray(data?.customFields) ? data.customFields : [];
  } catch (e) {
    console.warn(`resolveCustomFieldIds: GHL fetch failed: ${(e as Error).message}`);
    return { cf, resolved: 0, missing: Object.keys(CF_FIELD_NAMES) };
  }

  const byName = new Map<string, string>();
  for (const f of fields) {
    const id = f?.id;
    const name = normalizeFieldName(f?.name);
    if (id && name && !byName.has(name)) byName.set(name, id);
  }

  const missing: string[] = [];
  for (const [key, nameOrAliases] of Object.entries(CF_FIELD_NAMES)) {
    const aliases = Array.isArray(nameOrAliases) ? nameOrAliases : [nameOrAliases];
    let found: string | null = null;
    for (const alias of aliases) {
      const id = byName.get(normalizeFieldName(alias));
      if (id) { found = id; break; }
    }
    cf[key] = found;
    if (!found) missing.push(key);
  }

  const resolved = Object.values(cf).filter(Boolean).length;
  return { cf, resolved, missing };
}

// Returns null when the field isn't tracked in this account.
const get = (cf: Record<string, any>, key: string | null) =>
  key ? cf[key] ?? null : null;

// ---------- Helpers ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function runInBackground(promise: Promise<unknown>) {
  const waitUntil = (globalThis as EdgeRuntimeGlobal).EdgeRuntime?.waitUntil;
  if (waitUntil) waitUntil(promise);
  else promise.catch((e) => console.warn("background task failed", e));
}

async function ghlFetch(tc: TenantCtx, path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(GHL_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(GHL_REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${tc.pit}`,
          Version: GHL_VERSION,
          Accept: "application/json",
        },
      });
    } catch (e) {
      // A timeout or dropped connection used to throw straight out of here,
      // aborting the whole resource sync for that tenant — one slow page killed
      // an entire contacts run ("Signal timed out" in sync_history). GHL gets
      // slow exactly when we hammer it (a full sweep across all tenants), so
      // this is the common case during recovery, not a rare one. Retry it the
      // same way we already retry a 429.
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /timed out|timeout|aborted|connection|network|reset/i.test(msg);
      if (retryable && attempt < 4) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(`GHL ${path}: ${msg}`);
    }
    // GHL rate limit — honor Retry-After (or back off) and retry a few times so
    // a transient 429 doesn't kill the whole resource sync (e.g. opportunities).
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 0;
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1));
      continue;
    }
    // 5xx is GHL being unwell, not us — same treatment.
    if (res.status >= 500 && attempt < 4) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL ${res.status} ${path}: ${body}`);
    }
    return res.json();
  }
}

function cfMap(customFields: any[] | undefined): Record<string, any> {
  const m: Record<string, any> = {};
  if (!Array.isArray(customFields)) return m;
  for (const f of customFields) {
    if (f && f.id !== undefined) m[f.id] = f.value ?? f.fieldValue ?? null;
  }
  return m;
}

// Weight-3 field keys. The actual GHL field IDs vary per tenant and are
// resolved at sync time from the tenant_custom_field_mappings table.
// Reference (REPS / 5b9a289f-...) lives in that table; do NOT hardcode IDs here.
export const WEIGHT3_FIELD_KEYS = [
  "seller_temperature","last_offer_date","last_offer_feedback","last_offer_type",
  "last_offer_made","timeline","asking_price","condition","motivation",
  "seller_note","lead_identity","lead_source","personality_type",
] as const;
type Weight3Key = typeof WEIGHT3_FIELD_KEYS[number];
type Weight3Map = Partial<Record<Weight3Key, string>>;

async function loadTenantWeight3Mapping(tenantId: string): Promise<Weight3Map> {
  const { data, error } = await admin
    .from("tenant_custom_field_mappings")
    .select("field_key, ghl_field_id")
    .eq("tenant_id", tenantId);
  if (error) {
    console.warn(`loadTenantWeight3Mapping failed: ${error.message}`);
    return {};
  }
  const m: Weight3Map = {};
  for (const row of data ?? []) {
    if (row?.field_key && row?.ghl_field_id) m[row.field_key as Weight3Key] = row.ghl_field_id;
  }
  return m;
}

function extractCustomField(customFields: any[] | undefined, fieldId: string): any {
  if (!Array.isArray(customFields)) return null;
  const field = customFields.find((f) => f && f.id === fieldId);
  if (!field) return null;
  const v = field.value ?? field.fieldValue;
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toInt(v: any): number | null {
  const n = toNum(v);
  return n === null ? null : Math.trunc(n);
}
function epochMsToIso(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // accept seconds or ms
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function maybeDateToIso(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) return epochMsToIso(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- Sync state ----------
async function getSyncState(tc: TenantCtx, resource: string) {
  const { data, error } = await admin
    .from("sync_state")
    .select("*")
    .eq("tenant_id", tc.tenantId)
    .eq("resource", resource)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recordSuccess(tc: TenantCtx, resource: string, mode: string) {
  const now = new Date().toISOString();
  const row: Record<string, any> = {
    tenant_id: tc.tenantId,
    resource,
    consecutive_failures: 0,
    last_error: null,
    last_error_at: null,
    last_delta_sync_at: now,
    last_delta_cursor: null,
  };
  if (mode === "full") row.last_full_sync_at = now;
  await admin.from("sync_state").upsert(row, { onConflict: "tenant_id,resource" });
}

async function recordProgress(tc: TenantCtx, resource: string, cursor: string | null) {
  await admin.from("sync_state").upsert(
    { tenant_id: tc.tenantId, resource, last_delta_cursor: cursor, last_error: null, last_error_at: null },
    { onConflict: "tenant_id,resource" },
  );
}

async function recordFailure(tc: TenantCtx, resource: string, err: string) {
  const state = await getSyncState(tc, resource);
  const failures = (state?.consecutive_failures ?? 0) + 1;
  await admin.from("sync_state").upsert(
    {
      tenant_id: tc.tenantId,
      resource,
      consecutive_failures: failures,
      last_error: err.slice(0, 2000),
      last_error_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,resource" },
  );
}

// ---------- Concurrency lock (one sweep per tenant at a time) ----------
// Prevents the scheduled sweep, the resume job, and self-resume from stacking
// up on the same tenant. A root sweep generates a sweep_id and claims the lock;
// chained/resume children pass the same sweep_id and re-claim (extend) it. The
// lock carries a TTL so an edge crash can never deadlock a tenant.
const SWEEP_TTL_SEC = 300;
async function claimSweepLock(tc: TenantCtx, sweepId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("try_claim_sync_lock", {
    p_tenant: tc.tenantId,
    p_sweep: sweepId,
    p_ttl_seconds: SWEEP_TTL_SEC,
  });
  if (error) {
    // Fail OPEN — never block all syncing because the lock subsystem hiccuped
    // (e.g. the migration hasn't applied yet). Worst case is the old behavior.
    console.warn(`claimSweepLock error (proceeding without lock): ${error.message}`);
    return true;
  }
  return data === true;
}
async function releaseSweepLock(tc: TenantCtx, sweepId: string): Promise<void> {
  await admin
    .from("sync_locks")
    .delete()
    .eq("tenant_id", tc.tenantId)
    .eq("sweep_id", sweepId)
    .then(() => {}, () => {});
}

// ---------- Contacts sync ----------
async function syncContacts(tc: TenantCtx, mode: string) {
  const stats: Record<string, any> = {
    pulled: 0,
    upserted: 0,
    tags_indexed: 0,
    custom_fields_resolved: 0,
    custom_fields_total: Object.keys(CF_FIELD_NAMES).length,
    custom_fields_missing: [] as string[],
    weight3_mapped: 0,
    weight3_total: WEIGHT3_FIELD_KEYS.length,
  };

  const { cf: CF, resolved, missing } = await resolveCustomFieldIds(tc);
  stats.custom_fields_resolved = resolved;
  stats.custom_fields_missing = missing;
  console.log(
    `syncContacts: resolved ${resolved}/${stats.custom_fields_total} custom field IDs` +
      (missing.length ? ` (missing: ${missing.join(", ")})` : "")
  );

  const W3 = await loadTenantWeight3Mapping(tc.tenantId);
  stats.weight3_mapped = Object.keys(W3).length;
  console.log(
    `syncContacts: Weight-3 mappings ${stats.weight3_mapped}/${stats.weight3_total} for tenant ${tc.tenantId}`
  );
  const w3 = (key: Weight3Key, customFields: any) =>
    W3[key] ? extractCustomField(customFields, W3[key]!) : null;

  const st = await getSyncState(tc, "contacts");
  let startAfter: string | undefined;
  let startAfterId: string | undefined;
  // Timestamp marking the start of THIS full sweep. Persisted in the resume
  // cursor so it survives across the chunked/resumed invocations of one sweep.
  // Used by the deletion-reconcile at the end: every contact GHL still returns
  // gets synced_at >= this; anything older was deleted in GHL.
  let sweepStartedAt: string | undefined;
  if (typeof st?.last_delta_cursor === "string" && st.last_delta_cursor) {
    try {
      const cursor = JSON.parse(st.last_delta_cursor);
      startAfter = typeof cursor?.startAfter === "string" ? cursor.startAfter : undefined;
      startAfterId = typeof cursor?.startAfterId === "string" ? cursor.startAfterId : undefined;
      sweepStartedAt = typeof cursor?.sweepStartedAt === "string" ? cursor.sweepStartedAt : undefined;
    } catch {
      startAfterId = st.last_delta_cursor;
    }
  }
  // Fresh full sweep (no resume cursor yet) → stamp the start now.
  if (mode === "full" && !sweepStartedAt) sweepStartedAt = new Date().toISOString();
  let deltaCutoff: number | null = null;
  if (mode === "delta") {
    if (st?.last_delta_sync_at) deltaCutoff = new Date(st.last_delta_sync_at).getTime();
  }

  let stop = false;
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 90_000;
  let timedOut = false;
  while (!stop) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }
    const data = await ghlFetch(tc, "/contacts/", {
      locationId: tc.locationId,
      limit: 100,
      startAfter,
      startAfterId,
    });
    const contacts: any[] = data.contacts ?? [];
    if (contacts.length === 0) break;

    const contactRows: any[] = [];
    const contactIdsWithTags: string[] = [];
    const allTagRows: { tenant_id: string; ghl_contact_id: string; tag: string }[] = [];

    for (const c of contacts) {
      const updatedMs = c.dateUpdated ? new Date(c.dateUpdated).getTime() : 0;
      if (deltaCutoff && updatedMs && updatedMs <= deltaCutoff) {
        stop = true;
        continue;
      }
      stats.pulled++;

      const cf = cfMap(c.customFields);

      const aiOnRaw = (get(cf, CF.ai_on) ?? "").toString().toUpperCase();
      const ai_on = aiOnRaw === "ON" ? true : aiOnRaw === "OFF" ? false : null;

      const nicheRaw = (get(cf, CF.niche_motivation) ?? "").toString().trim().toLowerCase();
      let niche_motivation: string | null = null;
      if (nicheRaw === "probate") niche_motivation = "probate";
      else if (nicheRaw === "pre foreclosure" || nicheRaw === "pre-foreclosure") niche_motivation = "pre-foreclosure";
      else if (nicheRaw === "auction") niche_motivation = "auction";
      else if (nicheRaw) niche_motivation = nicheRaw;

      const mailing_address = get(cf, CF.mailing_address);

      const family_name =
        (get(cf, CF.family_name) ?? "").toString().trim() ||
        c.lastName ||
        c.contactName ||
        null;

      contactRows.push({
        tenant_id: tc.tenantId,
        ghl_contact_id: c.id,
        first_name: c.firstName ?? null,
        last_name: c.lastName ?? null,
        primary_phone: c.phone ?? null,
        primary_email: c.email ?? null,
        assigned_user_id: c.assignedTo ?? null,
        ghl_date_added: c.dateAdded ?? null,
        ghl_date_updated: c.dateUpdated ?? null,
        family_name,
        niche_motivation,
        county: get(cf, CF.county),
        campaign_name: get(cf, CF.campaign_name),
        bot_type: get(cf, CF.bot_type),
        ai_on,
        seller_disposition: get(cf, CF.seller_disposition),
        call_attempts: toInt(get(cf, CF.call_attempts)),
        last_called_date: epochMsToIso(get(cf, CF.last_called_date)),
        follow_up_due_date: epochMsToIso(get(cf, CF.follow_up_due_date)),
        estimated_equity: toNum(get(cf, CF.estimated_equity)),
        market_value: toNum(get(cf, CF.market_value)),
        mortgage_balance: toNum(get(cf, CF.mortgage_balance)),
        auction_date: epochMsToIso(get(cf, CF.auction_date)),
        auction_status: get(cf, CF.auction_status),
        decedent_name: get(cf, CF.decedent_name),
        decedent_age: toInt(get(cf, CF.decedent_age)),
        date_of_death: get(cf, CF.date_of_death),
        mailing_address,
        full_address: get(cf, CF.full_address),
        seller_temperature: w3("seller_temperature", c.customFields),
        last_offer_date: epochMsToIso(w3("last_offer_date", c.customFields)),
        last_offer_feedback: w3("last_offer_feedback", c.customFields),
        last_offer_type: w3("last_offer_type", c.customFields),
        last_offer_made: toNum(w3("last_offer_made", c.customFields)),
        timeline: w3("timeline", c.customFields),
        asking_price: toNum(w3("asking_price", c.customFields)),
        condition: w3("condition", c.customFields),
        motivation: w3("motivation", c.customFields),
        seller_note: w3("seller_note", c.customFields),
        lead_identity: w3("lead_identity", c.customFields),
        lead_source: w3("lead_source", c.customFields),
        personality_type: w3("personality_type", c.customFields),
        raw_payload: c,
        synced_at: new Date().toISOString(),
      });

      const tags: string[] = Array.isArray(c.tags)
        ? c.tags.filter((t: any) => typeof t === "string" && t.trim())
        : [];
      contactIdsWithTags.push(c.id);
      for (const t of tags) allTagRows.push({ tenant_id: tc.tenantId, ghl_contact_id: c.id, tag: t });
    }

    if (contactRows.length) {
      // Chunk to avoid Postgres statement timeout on large upserts
      // (raw_payload is large JSONB + GIN index on tags makes each row expensive)
      const CHUNK = 10;
      for (let i = 0; i < contactRows.length; i += CHUNK) {
        const slice = contactRows.slice(i, i + CHUNK);
        let lastErr: string | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error } = await admin
            .from("ghl_contacts")
            .upsert(slice, { onConflict: "tenant_id,ghl_contact_id" });
          if (!error) { lastErr = null; break; }
          lastErr = error.message;
          if (!/timeout|canceling statement/i.test(error.message)) break;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        if (lastErr) throw new Error(`bulk upsert contacts: ${lastErr}`);
        stats.upserted += slice.length;
      }
    }

    if (contactIdsWithTags.length) {
      await admin
        .from("ghl_contact_tags")
        .delete()
        .eq("tenant_id", tc.tenantId)
        .in("ghl_contact_id", contactIdsWithTags);
    }

    if (allTagRows.length) {
      const { error: tagErr } = await admin.from("ghl_contact_tags").insert(allTagRows);
      if (!tagErr) stats.tags_indexed += allTagRows.length;
    }

    const meta = data.meta ?? {};
    if (!meta.startAfter && !meta.startAfterId) break;
    if (stop) break;
    startAfter = meta.startAfter;
    startAfterId = meta.startAfterId;
    await recordProgress(tc, "contacts", JSON.stringify({ startAfter, startAfterId, sweepStartedAt }));
    await sleep(80);
  }

  // ---- Deletion reconcile ----
  // When a FULL sweep COMPLETES (not timed out), remove contacts GHL no longer
  // returns — i.e. deleted/merged in GHL — which an upsert-only sync would
  // otherwise keep forever (the LI-count > GHL-count drift). Identified by
  // synced_at older than this sweep's start. Heavily guarded so a GHL hiccup
  // (e.g. an empty/short response) can NEVER mass-delete: we only prune when
  // this sweep actually re-synced ≥90% of GHL's own reported total. Delta mode
  // never reconciles (it only sees changed contacts).
  if (mode === "full" && !timedOut && sweepStartedAt) {
    try {
      const head = await ghlFetch(tc, "/contacts/", { locationId: tc.locationId, limit: 1 });
      const ghlTotal: number | null = typeof head?.meta?.total === "number" ? head.meta.total : null;
      const { count: freshCount } = await admin
        .from("ghl_contacts")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tc.tenantId)
        .gte("synced_at", sweepStartedAt);
      const reconcile: Record<string, any> = { ghl_total: ghlTotal, fresh_this_sweep: freshCount ?? null };
      if (ghlTotal && ghlTotal > 0 && freshCount != null && freshCount >= Math.floor(ghlTotal * 0.9)) {
        const { count: deleted, error } = await admin
          .from("ghl_contacts")
          .delete({ count: "exact" })
          .eq("tenant_id", tc.tenantId)
          .lt("synced_at", sweepStartedAt);
        if (error) reconcile.error = error.message;
        else { reconcile.deleted = deleted ?? 0; console.log(`syncContacts reconcile: pruned ${deleted ?? 0} contacts deleted in GHL`); }
      } else {
        reconcile.skipped = "guard: this sweep re-synced <90% of GHL total — not pruning";
        console.warn(`syncContacts reconcile SKIPPED: fresh=${freshCount} ghlTotal=${ghlTotal}`);
      }
      stats.reconcile = reconcile;
    } catch (e) {
      stats.reconcile = { error: (e as Error).message };
      console.error("syncContacts reconcile error:", (e as Error).message);
    }
  }

  return { ...stats, timed_out: timedOut };
}

// ---------- Opportunities sync ----------
async function syncOpportunities(tc: TenantCtx, mode: string) {
  const stats = { pulled: 0, upserted: 0, skipped_no_contact: 0 };
  // Determine pipeline filter
  const { data: pipelineConfig } = await admin
    .from("tenant_pipelines")
    .select("ghl_pipeline_id, selected")
    .eq("tenant_id", tc.tenantId);
  const hasExplicitSelections = Array.isArray(pipelineConfig) && pipelineConfig.length > 0;
  const selectedPipelineIds: string[] | null = hasExplicitSelections
    ? pipelineConfig!.filter((p: any) => p.selected).map((p: any) => String(p.ghl_pipeline_id))
    : null;

  if (selectedPipelineIds && selectedPipelineIds.length === 0) {
    console.warn(`opportunities: tenant ${tc.tenantId} has tenant_pipelines rows but none selected — skipping opportunity sync`);
    return stats;
  }

  // null = sync all (legacy behavior); otherwise loop sequentially per pipeline
  const pipelineIterator: (string | null)[] = selectedPipelineIds ?? [null];

  let deltaCutoff: number | null = null;
  if (mode === "delta") {
    const st = await getSyncState(tc, "opportunities");
    if (st?.last_delta_sync_at) deltaCutoff = new Date(st.last_delta_sync_at).getTime();
  }

  for (const pipelineId of pipelineIterator) {
    let startAfter: string | undefined;
    let startAfterId: string | undefined;
    let stop = false;
    while (!stop) {
      const params: Record<string, string | number | undefined> = {
        location_id: tc.locationId,
        limit: 100,
        startAfter,
        startAfterId,
      };
      if (pipelineId) params.pipeline_id = pipelineId;
      const data = await ghlFetch(tc, "/opportunities/search", params);
      const opps: any[] = data.opportunities ?? [];
      if (opps.length === 0) break;

      const candidates: any[] = [];
      for (const o of opps) {
        const updatedMs = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
        if (deltaCutoff && updatedMs && updatedMs <= deltaCutoff) {
          stop = true;
          continue;
        }
        stats.pulled++;
        if (!o.contactId) {
          stats.skipped_no_contact++;
          continue;
        }
        candidates.push(o);
      }

      if (candidates.length) {
        const contactIds = Array.from(new Set(candidates.map((o) => o.contactId)));
        const { data: existing, error: exErr } = await admin
          .from("ghl_contacts")
          .select("ghl_contact_id")
          .eq("tenant_id", tc.tenantId)
          .in("ghl_contact_id", contactIds);
        if (exErr) throw new Error(`opp contact lookup: ${exErr.message}`);
        const existsSet = new Set((existing ?? []).map((r: any) => r.ghl_contact_id));

        const rows: any[] = [];
        for (const o of candidates) {
          if (!existsSet.has(o.contactId)) {
            stats.skipped_no_contact++;
            continue;
          }
          rows.push({
            tenant_id: tc.tenantId,
            ghl_opportunity_id: o.id,
            ghl_contact_id: o.contactId,
            pipeline_id: o.pipelineId,
            pipeline_stage_id: o.pipelineStageId,
            pipeline_name: o.pipelineName ?? null,
            stage_name: o.pipelineStageName ?? null,
            monetary_value: toNum(o.monetaryValue),
            ghl_date_updated: o.updatedAt ?? null,
            synced_at: new Date().toISOString(),
          });
        }

        if (rows.length) {
          const { error } = await admin
            .from("ghl_opportunities")
            .upsert(rows, { onConflict: "tenant_id,ghl_opportunity_id" });
          if (error) throw new Error(`bulk upsert opps: ${error.message}`);
          stats.upserted += rows.length;
        }
      }

      const meta = data.meta ?? {};
      if (!meta.startAfter && !meta.startAfterId) break;
      if (stop) break;
      startAfter = meta.startAfter;
      startAfterId = meta.startAfterId;
      await sleep(80);
    }
  }

  return stats;
}

// ---------- Pipelines sync ----------
// Fetches /opportunities/pipelines for the tenant and backfills
// pipeline_name + stage_name on ghl_opportunities rows by matching
// pipeline_stage_id. Also refreshes pipeline_name on tenant_pipelines
// (without touching the `selected` flag).
async function syncPipelines(tc: TenantCtx, _mode: string) {
  const stats = {
    pipelines_fetched: 0,
    stages_indexed: 0,
    opportunities_updated: 0,
    tenant_pipelines_upserted: 0,
  };

  const data = await ghlFetch(tc, "/opportunities/pipelines", {
    locationId: tc.locationId,
  });
  const pipelines: any[] = Array.isArray(data?.pipelines) ? data.pipelines : [];
  stats.pipelines_fetched = pipelines.length;
  if (pipelines.length === 0) return stats;

  // Refresh pipeline_name on tenant_pipelines (preserve `selected`).
  const { data: existingTp } = await admin
    .from("tenant_pipelines")
    .select("ghl_pipeline_id, selected")
    .eq("tenant_id", tc.tenantId);
  const selectedMap = new Map<string, boolean>(
    (existingTp ?? []).map((r: any) => [String(r.ghl_pipeline_id), !!r.selected]),
  );
  const tpRows = pipelines.map((p) => ({
    tenant_id: tc.tenantId,
    ghl_pipeline_id: String(p.id),
    pipeline_name: String(p.name ?? "Unnamed pipeline"),
    selected: selectedMap.has(String(p.id)) ? selectedMap.get(String(p.id))! : true,
    updated_at: new Date().toISOString(),
  }));
  const { error: tpErr } = await admin
    .from("tenant_pipelines")
    .upsert(tpRows, { onConflict: "tenant_id,ghl_pipeline_id" });
  if (tpErr) {
    console.warn(`syncPipelines: tenant_pipelines upsert failed: ${tpErr.message}`);
  } else {
    stats.tenant_pipelines_upserted = tpRows.length;
  }

  // Walk every stage and backfill ghl_opportunities for that stage id.
  for (const p of pipelines) {
    const pipelineId = String(p.id);
    const pipelineName = String(p.name ?? "Unnamed pipeline");
    const stages: any[] = Array.isArray(p.stages) ? p.stages : [];
    for (const s of stages) {
      const stageId = String(s.id);
      const stageName = String(s.name ?? "");
      stats.stages_indexed++;
      const { error, count } = await admin
        .from("ghl_opportunities")
        .update(
          { pipeline_name: pipelineName, stage_name: stageName },
          { count: "exact" },
        )
        .eq("tenant_id", tc.tenantId)
        .eq("pipeline_stage_id", stageId);
      if (error) {
        console.warn(`syncPipelines: update failed for stage ${stageId}: ${error.message}`);
        continue;
      }
      if (typeof count === "number") stats.opportunities_updated += count;
    }
  }

  return stats;
}

// ---------- Conversations sync ----------
async function syncConversations(tc: TenantCtx, mode: string) {
  const stats = { pulled: 0, upserted: 0, skipped_no_contact: 0 };
  let startAfterDate: number | undefined;
  let pageCount = 0;
  const MAX_PAGES = 30;
  let deltaCutoff: number | null = null;
  if (mode === "delta") {
    const st = await getSyncState(tc, "conversations");
    if (st?.last_delta_sync_at) deltaCutoff = new Date(st.last_delta_sync_at).getTime();
  }

  let stop = false;
  while (!stop) {
    pageCount++;
    if (pageCount > MAX_PAGES) {
      console.warn(`conversations: hit MAX_PAGES (${MAX_PAGES}) — breaking to avoid infinite loop`);
      break;
    }
    const data = await ghlFetch(tc, "/conversations/search", {
      locationId: tc.locationId,
      limit: 100,
      sort: "desc",
      sortBy: "last_message_date",
      startAfterDate,
    });
    const convs: any[] = data.conversations ?? [];
    if (pageCount === 1) {
      console.log(`conversations: expecting ${data.total ?? "unknown"} total`);
    }
    if (convs.length === 0) break;

    const candidates: { cv: any; lastAtIso: string | null }[] = [];
    for (const cv of convs) {
      const lastAtIso = maybeDateToIso(cv.lastMessageDate);
      const lastAtMs = lastAtIso ? new Date(lastAtIso).getTime() : 0;
      if (deltaCutoff && lastAtMs && lastAtMs <= deltaCutoff) {
        stop = true;
        continue;
      }
      stats.pulled++;
      if (!cv.contactId) {
        stats.skipped_no_contact++;
        continue;
      }
      candidates.push({ cv, lastAtIso });
    }

    if (candidates.length) {
      const contactIds = Array.from(new Set(candidates.map((x) => x.cv.contactId)));
      const { data: existing, error: exErr } = await admin
        .from("ghl_contacts")
        .select("ghl_contact_id")
        .eq("tenant_id", tc.tenantId)
        .in("ghl_contact_id", contactIds);
      if (exErr) throw new Error(`conv contact lookup: ${exErr.message}`);
      const existsSet = new Set((existing ?? []).map((r: any) => r.ghl_contact_id));

      const rows: any[] = [];
      for (const { cv, lastAtIso } of candidates) {
        if (!existsSet.has(cv.contactId)) {
          stats.skipped_no_contact++;
          continue;
        }
        const body = (cv.lastMessageBody ?? "").toString().slice(0, 500);
        rows.push({
          tenant_id: tc.tenantId,
          ghl_conversation_id: cv.id,
          ghl_contact_id: cv.contactId,
          last_message_type: cv.lastMessageType ?? null,
          last_message_direction: cv.lastMessageDirection ?? null,
          last_message_body: body || null,
          last_message_at: lastAtIso,
          synced_at: new Date().toISOString(),
        });
      }

      if (rows.length) {
        const { error } = await admin
          .from("ghl_conversations")
          .upsert(rows, { onConflict: "tenant_id,ghl_conversation_id" });
        if (error) throw new Error(`bulk upsert convs: ${error.message}`);
        stats.upserted += rows.length;
      }
    }

    if (stop) break;
    if (convs.length < 100) break;
    const lastItem = convs[convs.length - 1];
    const lastSort = Array.isArray(lastItem?.sort) ? lastItem.sort[0] : null;
    const lastMsgDate = lastItem?.lastMessageDate
      ? new Date(lastItem.lastMessageDate).getTime()
      : null;
    const nextCursor = lastSort ?? lastMsgDate;
    if (!nextCursor) break;
    if (nextCursor === startAfterDate) {
      console.warn("conversations: cursor did not advance — breaking");
      break;
    }
    startAfterDate = nextCursor;
    await sleep(80);
  }

  return stats;
}

// ---------- Users sync ----------
async function syncUsers(tc: TenantCtx, _mode: string) {
  const stats = { pulled: 0, upserted: 0 };
  const data = await ghlFetch(tc, "/users/", { locationId: tc.locationId });
  const users: any[] = data.users ?? [];
  stats.pulled = users.length;

  if (users.length) {
    const rows = users.map((u: any) => {
      const role =
        Array.isArray(u.roles?.roles) ? u.roles.roles.join(", ")
        : (u.roles?.type ?? u.role ?? null);
      return {
        tenant_id: tc.tenantId,
        ghl_user_id: u.id,
        location_id: tc.locationId,
        first_name: u.firstName ?? null,
        last_name: u.lastName ?? null,
        email: u.email ?? null,
        role,
        is_active: u.deleted === true ? false : true,
        ghl_date_added: u.dateAdded ?? null,
        ghl_date_updated: u.dateUpdated ?? null,
        synced_at: new Date().toISOString(),
      };
    });
    const { error } = await admin.from("ghl_users").upsert(rows, { onConflict: "tenant_id,ghl_user_id" });
    if (error) throw new Error(`bulk upsert users: ${error.message}`);
    stats.upserted = rows.length;
  }

  console.log(`Synced ${stats.upserted} users`);
  return stats;
}

// ---------- Messages sync ----------
// Text-based message types we keep. GHL uses values like TYPE_SMS, TYPE_EMAIL, etc.
// We skip anything that looks like a call/voicemail/audio/video.
function isTextMessageType(t: string | null | undefined): boolean {
  if (!t) return false;
  const u = String(t).toUpperCase();
  if (u.includes("CALL") || u.includes("VOICEMAIL") || u.includes("AUDIO") || u.includes("VIDEO")) return false;
  // Keep: SMS, EMAIL, FB, IG, GMB, WHATSAPP, WEBCHAT, LIVE_CHAT, etc.
  return (
    u.includes("SMS") ||
    u.includes("EMAIL") ||
    u.includes("FB") ||
    u.includes("IG") ||
    u.includes("INSTAGRAM") ||
    u.includes("GMB") ||
    u.includes("WHATSAPP") ||
    u.includes("CHAT") ||
    u.includes("CUSTOM")
  );
}

function normalizeDirection(d: any): string {
  const s = String(d ?? "").toLowerCase();
  if (s === "inbound" || s === "in") return "inbound";
  if (s === "outbound" || s === "out") return "outbound";
  return s || "unknown";
}

async function syncMessages(tc: TenantCtx, mode: string) {
  const stats = { conversations_scanned: 0, pages_fetched: 0, pulled: 0, upserted: 0, skipped_non_text: 0, contacts_marked_stale: 0 };
  let deltaCutoff: number | null = null;
  const st = await getSyncState(tc, "messages");
  if (mode === "delta" && st?.last_delta_sync_at) deltaCutoff = new Date(st.last_delta_sync_at).getTime();
  const resumeOffset = Number(st?.last_delta_cursor ?? 0);

  // Iterate conversations in pages of 1000
  const PAGE = 1000;
  let offset = Number.isFinite(resumeOffset) && resumeOffset > 0 ? resumeOffset : 0;
  const contactsWithNewMessages = new Set<string>();
  // Edge functions cap at 150s. Self-terminate well before then so we can resume on next call.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 110_000;
  let timedOut = false;

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }
    const { data: convs, error } = await admin
      .from("ghl_conversations")
      .select("ghl_conversation_id, ghl_contact_id, last_message_at")
      .eq("tenant_id", tc.tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`messages: read conversations: ${error.message}`);
    if (!convs || convs.length === 0) break;

    for (const [i, cv] of convs.entries()) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }
      // Delta optimization: if conversation hasn't changed since last sync, skip it.
      if (deltaCutoff && cv.last_message_at) {
        const lastMs = new Date(cv.last_message_at).getTime();
        if (lastMs <= deltaCutoff) {
          await recordProgress(tc, "messages", String(offset + i + 1));
          continue;
        }
      }
      stats.conversations_scanned++;

      try {
        let lastMessageId: string | undefined;
        let contactPulled = 0;
        let sawNew = false;
        let stopConversation = false;

        while (!stopConversation && contactPulled < 500) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }
          const params: Record<string, string | number | undefined> = { limit: 100 };
          if (lastMessageId) params.lastMessageId = lastMessageId;
          const data = await ghlFetch(tc, `/conversations/${cv.ghl_conversation_id}/messages`, params);
          stats.pages_fetched++;

          // GHL returns { messages: { messages: [...], lastMessageId } } or similar; handle common shapes.
          const list: any[] =
            data?.messages?.messages ??
            data?.messages?.items ??
            data?.messages ??
            data?.items ??
            [];
          if (!Array.isArray(list) || list.length === 0) break;

          const rows: any[] = [];
          for (const m of list) {
            const dateAdded = maybeDateToIso(m.dateAdded ?? m.dateCreated ?? m.createdAt);
            if (deltaCutoff && dateAdded && new Date(dateAdded).getTime() <= deltaCutoff) {
              stopConversation = true;
              continue;
            }
            if (!isTextMessageType(m.messageType ?? m.type)) {
              stats.skipped_non_text++;
              continue;
            }
            const body = m.body ?? m.messageBody ?? null;
            if (!body || String(body).trim() === "") {
              stats.skipped_non_text++;
              continue;
            }
            if (!dateAdded) continue;
            sawNew = true;
            stats.pulled++;
            contactPulled++;
            rows.push({
              tenant_id: tc.tenantId,
              ghl_message_id: m.id,
              ghl_conversation_id: cv.ghl_conversation_id,
              ghl_contact_id: cv.ghl_contact_id,
              ghl_user_id: m.userId ?? null,
              location_id: tc.locationId,
              message_type: String(m.messageType ?? m.type ?? "UNKNOWN"),
              direction: normalizeDirection(m.direction),
              body: String(body),
              status: m.status ?? null,
              date_added: dateAdded,
              raw_payload: m,
              synced_at: new Date().toISOString(),
            });
          }

          if (rows.length) {
            const { error: upErr } = await admin
              .from("ghl_messages")
              .upsert(rows, { onConflict: "tenant_id,ghl_message_id" });
            if (upErr) throw new Error(`upsert messages: ${upErr.message}`);
            stats.upserted += rows.length;
          }

          const nextCursor =
            data?.messages?.lastMessageId ??
            data?.lastMessageId ??
            data?.messages?.nextPage?.lastMessageId ??
            data?.nextPage?.lastMessageId ??
            list[list.length - 1]?.id;
          if (stopConversation || list.length < 100 || !nextCursor || nextCursor === lastMessageId) break;
          lastMessageId = String(nextCursor);
          await sleep(40);
        }

        if (sawNew) contactsWithNewMessages.add(cv.ghl_contact_id);
      } catch (e) {
        console.warn(`messages: conv ${cv.ghl_conversation_id} failed`, e instanceof Error ? e.message : e);
      }
      await recordProgress(tc, "messages", String(offset + i + (timedOut ? 0 : 1)));
      await sleep(40);
    }

    if (timedOut) break;
    if (convs.length < PAGE) break;
    offset += PAGE;
  }

  // Mark intelligence stale for contacts that received new messages
  if (contactsWithNewMessages.size) {
    const ids = Array.from(contactsWithNewMessages);
    const { error } = await admin
      .from("lead_intelligence")
      .update({ stale: true })
      .eq("tenant_id", tc.tenantId)
      .in("ghl_contact_id", ids);
    if (!error) stats.contacts_marked_stale = ids.length;
  }

  console.log(`Synced ${stats.upserted} messages across ${stats.conversations_scanned} conversations${timedOut ? " (time budget hit — call again to continue)" : ""}`);
  return { ...stats, timed_out: timedOut };
}

// ---------- Tasks sync ----------
async function syncTasks(tc: TenantCtx, mode: string) {
  // Bulk endpoint: POST /locations/{locationId}/tasks/search
  const stats = { pulled: 0, upserted: 0, pages: 0 };
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 90_000;
  let timedOut = false;
  let firstShapeLogged = false;

  const st = await getSyncState(tc, "tasks");
  let nextCursor: string | null = mode === "full" ? null : (st?.last_delta_cursor ?? null);

  let deltaCutoff: number | null = null;
  if (mode === "delta" && st?.last_delta_sync_at) {
    deltaCutoff = new Date(st.last_delta_sync_at).getTime();
  }

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }

    const reqBody: Record<string, any> = { limit: 100 };
    if (nextCursor) {
      try {
        const parsed = JSON.parse(nextCursor);
        reqBody.searchAfter = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        reqBody.searchAfter = [nextCursor];
      }
    }

    const url = GHL_BASE + "/locations/" + tc.locationId + "/tasks/search";
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `Bearer ${tc.pit}`,
        Version: GHL_VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });
    if (res.status === 429) {
      await sleep(3000);
      continue;
    }
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`tasks bulk ${res.status}: ${errBody.slice(0, 500)}`);
    }
    const data: any = await res.json();

    if (!firstShapeLogged) {
      firstShapeLogged = true;
      const keys = data && typeof data === "object" ? Object.keys(data) : [];
      console.log(`tasks bulk first response keys: ${JSON.stringify(keys)}`);
    }

    stats.pages++;
    const list: any[] = Array.isArray(data?.tasks)
      ? data.tasks
      : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.items)
      ? data.items
      : [];

    if (list.length === 0) { nextCursor = null; break; }

    const filtered = deltaCutoff
      ? list.filter((t) => {
          const updated = t.dateUpdated || t.dateAdded;
          if (!updated) return true;
          return new Date(updated).getTime() > deltaCutoff!;
        })
      : list;

    if (filtered.length) {
      const rows = filtered
        .filter((t: any) => t && (t.id || t._id) && (t.contactId || t.contact_id))
        .map((t: any) => ({
          tenant_id: tc.tenantId,
          ghl_task_id: t.id ?? t._id,
          ghl_contact_id: t.contactId ?? t.contact_id,
          ghl_user_id: t.assignedTo ?? t.userId ?? null,
          location_id: tc.locationId,
          title: t.title ?? null,
          body: t.body ?? null,
          due_date: maybeDateToIso(t.dueDate),
          completed: t.completed === true || t.status === "completed",
          ghl_date_added: maybeDateToIso(t.dateAdded ?? t.createdAt),
          ghl_date_updated: maybeDateToIso(t.dateUpdated ?? t.updatedAt),
          synced_at: new Date().toISOString(),
        }));
      stats.pulled += rows.length;

      if (rows.length) {
        const { error } = await admin
          .from("ghl_tasks")
          .upsert(rows, { onConflict: "tenant_id,ghl_task_id" });
        if (error) throw new Error(`upsert tasks: ${error.message}`);
        stats.upserted += rows.length;
      }
    }

    const meta = data?.meta ?? data?.pagination ?? {};
    const lastItem = list[list.length - 1];
    // GHL uses searchAfter (array) on each item for cursor pagination
    const lastSearchAfter = Array.isArray(lastItem?.searchAfter)
      ? JSON.stringify(lastItem.searchAfter)
      : null;
    const newCursor: string | null =
      meta.startAfter ?? meta.nextPageCursor ?? meta.next ?? meta.cursor ?? null;
    nextCursor = newCursor ?? lastSearchAfter ?? (list.length === 100 ? (lastItem?.id ?? lastItem?._id ?? null) : null);
    if (!nextCursor) break;

    await recordProgress(tc, "tasks", nextCursor);
    await sleep(150);
  }

  if (!timedOut) await recordProgress(tc, "tasks", null);

  console.log(
    `Synced ${stats.upserted} tasks across ${stats.pages} pages${timedOut ? " (time budget hit — call again to continue)" : ""}`,
  );
  return { ...stats, timed_out: timedOut };
}

// ---------- Notes sync ----------
async function syncNotes(tc: TenantCtx, mode: string) {
  const stats = {
    contacts_scanned: 0,
    notes_pulled: 0,
    notes_upserted: 0,
    contacts_with_new_notes: 0,
    contacts_marked_stale: 0,
  };
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 90_000;
  const PAGE = 50;
  let timedOut = false;

  const st = await getSyncState(tc, "notes");
  let cursor: string = typeof st?.last_delta_cursor === "string" ? st.last_delta_cursor : "";
  // Incremental: in delta mode only re-pull notes for contacts CHANGED since the
  // last notes sync — adding/editing a note bumps the contact's dateUpdated in
  // GHL (and the contacts sync runs before notes in the chain, refreshing it).
  // Full mode (the periodic reconcile) walks every contact. This is the single
  // biggest GHL-API-load cut: ~all-contacts-per-sweep -> ~changed-contacts.
  const deltaCutoffIso: string | null =
    mode === "delta" && typeof st?.last_delta_sync_at === "string" ? st.last_delta_sync_at : null;
  const contactsWithNewNotes = new Set<string>();

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }

    let cq = admin
      .from("ghl_contacts")
      .select("ghl_contact_id")
      .eq("tenant_id", tc.tenantId)
      .gt("ghl_contact_id", cursor)
      .order("ghl_contact_id", { ascending: true })
      .limit(PAGE);
    if (deltaCutoffIso) cq = cq.gt("ghl_date_updated", deltaCutoffIso);
    const { data: contacts, error } = await cq;
    if (error) throw new Error(`notes: read contacts: ${error.message}`);
    if (!contacts || contacts.length === 0) break;

    for (const c of contacts) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }
      const contactId: string = c.ghl_contact_id;
      stats.contacts_scanned++;

      try {
        const data = await ghlFetch(tc, `/contacts/${contactId}/notes`);
        const list: any[] = Array.isArray(data?.notes)
          ? data.notes
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data) ? data : [];

        if (list.length > 0) {
          // Pre-fetch existing note IDs for this contact to detect net-new
          const { data: existing } = await admin
            .from("ghl_contact_notes")
            .select("ghl_note_id")
            .eq("tenant_id", tc.tenantId)
            .eq("ghl_contact_id", contactId);
          const existingIds = new Set((existing ?? []).map((r: any) => r.ghl_note_id));

          const rows: any[] = [];
          let hasNew = false;
          for (const n of list) {
            const noteId = n.id ?? n._id;
            if (!noteId) continue;
            const bodyRaw = n.body ?? n.bodyText ?? null;
            const dateAdded = maybeDateToIso(n.dateAdded ?? n.createdAt);
            const updatedAt = maybeDateToIso(n.dateUpdated ?? n.updatedAt) ?? dateAdded;
            stats.notes_pulled++;
            if (!existingIds.has(noteId)) hasNew = true;
            rows.push({
              tenant_id: tc.tenantId,
              ghl_contact_id: contactId,
              ghl_note_id: noteId,
              body_raw: bodyRaw,
              body_text: stripHtml(bodyRaw),
              date_added: dateAdded,
              updated_at: updatedAt,
            });
          }

          if (rows.length) {
            const { error: upErr } = await admin
              .from("ghl_contact_notes")
              .upsert(rows, { onConflict: "tenant_id,ghl_note_id" });
            if (upErr) throw new Error(`upsert notes: ${upErr.message}`);
            stats.notes_upserted += rows.length;
          }
          if (hasNew) {
            contactsWithNewNotes.add(contactId);
            stats.contacts_with_new_notes++;
          }
        }
      } catch (e) {
        console.warn(`notes: contact ${contactId} failed`, e instanceof Error ? e.message : e);
      }

      cursor = contactId;
      await recordProgress(tc, "notes", cursor);
      await sleep(150);
    }

    if (timedOut) break;
    if (contacts.length < PAGE) break;
  }

  if (!timedOut) {
    // Clean finish — reset cursor so next run sweeps from the start.
    await recordProgress(tc, "notes", null);
  }

  if (contactsWithNewNotes.size) {
    const ids = Array.from(contactsWithNewNotes);
    const { error } = await admin
      .from("lead_intelligence")
      .update({ stale: true })
      .eq("tenant_id", tc.tenantId)
      .in("ghl_contact_id", ids);
    if (!error) stats.contacts_marked_stale = ids.length;
  }

  console.log(
    `Synced ${stats.notes_upserted} notes across ${stats.contacts_scanned} contacts${timedOut ? " (time budget hit — will resume)" : ""}`,
  );
  return { ...stats, timed_out: timedOut };
}

function dispatchInternalSync(
  tenantId: string,
  resource: "contacts" | "opportunities" | "conversations" | "users" | "messages" | "tasks" | "notes" | "pipelines",
  mode: "full" | "delta",
  triggerSource = "background_internal",
  chain: Array<"contacts" | "opportunities" | "conversations" | "users" | "messages" | "tasks" | "notes" | "pipelines"> = [],
  sweepId?: string,
) {
  runInBackground(
    fetch(`${SUPABASE_URL}/functions/v1/ghl-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        mode,
        resource,
        tenant_id: tenantId,
        _internal: true,
        trigger_source: triggerSource,
        _chain: chain,
        _sweep_id: sweepId,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn(`background ${resource} returned ${res.status}: ${body.slice(0, 500)}`);
        } else {
          await res.text().catch(() => "");
        }
      })
      .catch((e) => console.warn(`background ${resource} dispatch failed`, e)),
  );
}

// ---------- Handler ----------
type SyncResource = "contacts" | "opportunities" | "conversations" | "users" | "messages" | "tasks" | "notes" | "pipelines";
const SYNC_RESOURCES: SyncResource[] = ["contacts", "opportunities", "conversations", "users", "messages", "tasks", "notes", "pipelines"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let mode: "full" | "delta" = "full";
  let resource: "contacts" | "opportunities" | "conversations" | "users" | "messages" | "tasks" | "notes" | "pipelines" | "all" = "all";
  let chain: SyncResource[] = [];
  let historyRowId: string | null = null;
  let sweepId = "";
  let lockClaimed = false;
  // Hoisted purely so the catch block can release the lock — the real context is
  // the `const tc` built inside the try, once credentials are known.
  let lockCtx: TenantCtx | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "delta" || body?.mode === "full") mode = body.mode;
    if (
      body?.resource === "contacts" ||
      body?.resource === "opportunities" ||
      body?.resource === "conversations" ||
      body?.resource === "users" ||
      body?.resource === "messages" ||
      body?.resource === "tasks" ||
      body?.resource === "notes" ||
      body?.resource === "pipelines" ||
      body?.resource === "all"
    ) {
      resource = body.resource;
    }
    chain = Array.isArray(body?._chain)
      ? body._chain.filter((r: unknown): r is SyncResource => typeof r === "string" && SYNC_RESOURCES.includes(r as SyncResource))
      : [];
    // A root call has no _sweep_id and mints one; chained/resume children carry
    // the sweep_id so they re-claim (extend) the same tenant lock.
    sweepId = (typeof body?._sweep_id === "string" && body._sweep_id) ? body._sweep_id : crypto.randomUUID();

    // Resolve tenant context — sync ALWAYS requires a tenant_id.
    // Internal background self-invocation uses service-role auth + ?_internal flag.
    const authHeader = (req.headers.get("authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const isInternal =
      body?._internal === true &&
      (
        (INTERNAL_SECRET && req.headers.get("x-internal-secret") === INTERNAL_SECRET) ||
        (SERVICE_ROLE && authHeader === SERVICE_ROLE)
      );
    let resolvedTenantId: string;
    let actorUserId: string | null = null;
    let actorEmail: string | null = null;
    let actorRole: string | null = null;
    if (isInternal) {
      if (typeof body?.tenant_id !== "string" || !body.tenant_id) {
        throw new TenantContextError("internal call missing tenant_id", 400);
      }
      resolvedTenantId = body.tenant_id;
    } else {
      const ctx = await resolveTenantContext(req, {
        requireTenantForAdmin: true,
        bodyTenantId: typeof body?.tenant_id === "string" ? body.tenant_id : null,
      });
      if (!ctx.tenantId) throw new TenantContextError("tenant_id required", 400);
      resolvedTenantId = ctx.tenantId;
      actorUserId = ctx.userId;
      actorRole = ctx.role;
      const { data: prof } = await admin
        .from("users")
        .select("email")
        .eq("id", ctx.userId)
        .maybeSingle();
      actorEmail = prof?.email ?? null;
    }

    // ── Platform entitlement: is the tenant org enabled for lead_intel? ──
    {
      const { leadintelTenantHasAccess } = await import("../_shared/platform.ts");
      const tenantHasAccess = await leadintelTenantHasAccess(resolvedTenantId, "lead_intel");
      if (!tenantHasAccess) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "access_denied",
            message: "This tenant does not have Lead Intel enabled. Contact your admin.",
            tenant_id: resolvedTenantId,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const creds = await getTenantGhlCreds(admin, resolvedTenantId);
    if (!creds) {
      return new Response(
        JSON.stringify({ error: "Tenant not found, inactive, or missing GHL credentials" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Built per request and passed down explicitly — never module state.
    const tc: TenantCtx = {
      tenantId: resolvedTenantId,
      pit: creds.pit,
      locationId: creds.locationId,
    };
    lockCtx = tc;

    // Wallet hard-stop: refuse to sync when balance is empty.
    // Bypassed for: background-internal child invocations, super_admin actors, and tenants with active trial.
    if (!isInternal && actorRole !== "super_admin") {
      const { data: tenantRow } = await admin
        .from("tenants")
        .select("trial_active, trial_expires_at")
        .eq("id", resolvedTenantId)
        .maybeSingle();
      const trialActive = !!tenantRow?.trial_active
        && tenantRow?.trial_expires_at
        && new Date(tenantRow.trial_expires_at as string).getTime() > Date.now();
      if (!trialActive) {
        const { data: walletRow } = await admin
          .from("wallets")
          .select("balance_cents")
          .eq("tenant_id", resolvedTenantId)
          .maybeSingle();
        const balance = walletRow?.balance_cents ?? 0;
        if (balance <= 0) {
          return new Response(
            JSON.stringify({
              error: "Wallet balance is empty. Top up to resume syncing.",
              code: "insufficient_balance",
              balance_cents: balance,
            }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // One sweep per tenant. Claim (root) or extend (child, same sweep_id) the
    // lock. If a DIFFERENT live sweep already holds this tenant, skip quietly —
    // this is what stops the scheduled sweep + resume + self-resume stacking up.
    if (!(await claimSweepLock(tc, sweepId))) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "another sync is already running for this tenant",
          tenant_id: resolvedTenantId,
          resource,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    lockClaimed = true;

    if (body?.trigger_initial === true) {
      console.log(`Initial sync starting for tenant ${resolvedTenantId}`);
    }

    // Determine trigger source for history log
    const ALLOWED_PASSTHROUGH = new Set([
      "manual",
      "auto_initial",
      "background_internal",
      "pipeline_selection_save",
    ]);
    const passthrough =
      typeof body?.trigger_source === "string" && ALLOWED_PASSTHROUGH.has(body.trigger_source)
        ? body.trigger_source
        : null;
    const triggerSource: string = isInternal
      ? "background_internal"
      : passthrough
        ? passthrough
        : body?.trigger_initial === true
          ? "auto_initial"
          : "manual";

    // Insert sync_history row (status=running). Background internal invocations
    // get their OWN history row (labeled background_internal) so the user can
    // see messages/tasks progress separately from the parent manual run.
    {
      const { data: hist } = await admin
        .from("sync_history")
        .insert({
          tenant_id: resolvedTenantId,
          resource,
          mode,
          triggered_by_user_id: actorUserId,
          triggered_by_email: actorEmail,
          trigger_source: triggerSource,
          status: "running",
        })
        .select("id")
        .maybeSingle();
      historyRowId = hist?.id ?? null;

      // Audit when a manual full/all sync is triggered (not for internal children).
      if (!isInternal && resource === "all" && mode === "full") {
        await admin.from("audit_log").insert({
          actor_user_id: actorUserId,
          actor_email: actorEmail,
          action: "sync.triggered",
          target_type: "tenant",
          target_id: resolvedTenantId,
          metadata: { resource: "all", mode: "full", trigger_source: triggerSource },
        });
      }
    }

    const stats: Record<string, any> = {};
    let anyTimedOut = false;

    const runResource = async (r: SyncResource) => {
      try {
        let result: any;
        if (r === "contacts") result = stats.contacts = await syncContacts(tc, mode);
        else if (r === "opportunities") result = stats.opportunities = await syncOpportunities(tc, mode);
        else if (r === "conversations") result = stats.conversations = await syncConversations(tc, mode);
        else if (r === "users") result = stats.users = await syncUsers(tc, mode);
        else if (r === "messages") result = stats.messages = await syncMessages(tc, mode);
        else if (r === "tasks") result = stats.tasks = await syncTasks(tc, mode);
        else if (r === "notes") result = stats.notes = await syncNotes(tc, mode);
        else if (r === "pipelines") result = stats.pipelines = await syncPipelines(tc, mode);
        if (result?.timed_out) anyTimedOut = true;
        if (!result?.timed_out) await recordSuccess(tc, r, mode);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await recordFailure(tc, r, msg);
        throw e;
      }
    };

    let dispatchedContinuation = false;
    if (resource === "all") {
      // "all" can exceed the 150s edge limit even when individual resources
      // self-budget. Dispatch a dependency-ordered chain and return immediately.
      dispatchInternalSync(resolvedTenantId, "users", mode, "background_internal", [
        "contacts",
        "opportunities",
        "pipelines",
        "conversations",
        "messages",
        "tasks",
        "notes",
      ], sweepId);
      dispatchedContinuation = true;
      stats.all = {
        dispatched: true,
        note: "Sync chain started in background to avoid edge timeout.",
        resources: ["users", "contacts", "opportunities", "pipelines", "conversations", "messages", "tasks", "notes"],
      };
    } else {
      const result = await runResource(resource);
      if (isInternal && result?.timed_out) {
        dispatchInternalSync(resolvedTenantId, resource, mode, "background_internal", chain, sweepId);
        dispatchedContinuation = true;
        stats.resume = { dispatched: true, resource };
      } else if (isInternal && chain.length > 0) {
        const [nextResource, ...rest] = chain;
        dispatchInternalSync(resolvedTenantId, nextResource, mode, "background_internal", rest, sweepId);
        dispatchedContinuation = true;
        stats.next = { dispatched: true, resource: nextResource };
      }
    }
    // Release the tenant lock when the sweep is fully done. If a continuation
    // was dispatched, that child re-claims/extends the lock; otherwise this is
    // the terminal invocation, so free the tenant for the next sweep.
    if (lockClaimed && !dispatchedContinuation) { await releaseSweepLock(tc, sweepId); lockClaimed = false; }

    // Mark sync_history row complete
    if (historyRowId) {
      const duration = Date.now() - startedAt;
      await admin.from("sync_history").update({
        status: anyTimedOut ? "partial" : "success",
        completed_at: new Date().toISOString(),
        stats,
        duration_ms: duration,
        error_message: anyTimedOut ? "Time budget hit — will resume on next invocation" : null,
      }).eq("id", historyRowId);
    }

    return new Response(
      JSON.stringify({
        mode,
        resource,
        stats,
        duration_ms: Date.now() - startedAt,
        completed_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Free the tenant lock so a failed resource doesn't block the next sweep for
    // the full TTL. (No-op if we never claimed it.)
    if (lockClaimed && lockCtx) { await releaseSweepLock(lockCtx, sweepId); lockClaimed = false; }
    // Mark sync_history row failed if we created one
    if (historyRowId) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await admin.from("sync_history").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        error_message: errMsg.slice(0, 2000),
      }).eq("id", historyRowId).then(() => {}, () => {});
    }
    if (e instanceof TenantContextError) {
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ghl-sync error:", msg);
    return new Response(
      JSON.stringify({
        error: msg,
        mode,
        resource,
        duration_ms: Date.now() - startedAt,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});