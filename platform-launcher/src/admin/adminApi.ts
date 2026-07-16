// Tiny typed client for the platform-admin-api.
// Same-origin proxy via /admin-api/* — auth is the user's ACQ or Lead Intel JWT.

import { getSession } from "../auth";

const BASE = "/admin-api";

function authHeader(): Record<string, string> {
  // Either backend's token works; admin-api decodes the sub and looks up
  // platform.users by either back-pointer.
  const s = getSession("acq") ?? getSession("leadintel");
  return s ? { Authorization: `Bearer ${s.access_token}` } : {};
}

async function jsonOr<T>(p: Promise<Response>): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const r = await p;
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return { ok: false, status: r.status, error: body.error ?? body.reason ?? r.statusText };
    }
    return { ok: true, data: (await r.json()) as T };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

// ── Types reflecting the admin-api responses ──
export type Product = "acq_coach" | "lead_intel";

export interface MeResponse {
  admin: {
    platformUserId: string;
    email: string;
    acqUserId: string | null;
    leadintelUserId: string | null;
  };
}

export interface UserMembership {
  id: string;     // customer.id
  name: string;   // customer.name
  product: Product;
  role: string;
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  is_platform_admin: boolean;
  on_acq: boolean;
  on_leadintel: boolean;
  acq_enabled: boolean;
  li_enabled: boolean;
  memberships: UserMembership[];
  created_at: string;
}

export interface UserDetail {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    is_platform_admin: boolean;
    acq_user_id: string | null;
    leadintel_user_id: string | null;
    created_at: string;
  };
  access: Array<{ product: Product; enabled: boolean; valid_until: string | null; notes: string | null; updated_at: string }>;
  customers: Array<{
    id: string; name: string; ghl_location_id: string | null;
    product: Product; role: string;
    customer_acq_enabled: boolean; customer_li_enabled: boolean;
  }>;
  recent_activity: Array<{ id: string; action: string; metadata: Record<string, unknown>; created_at: string; actor_user_id: string | null }>;
}

export interface CustomerRow {
  id: string;
  name: string;
  ghl_location_id: string | null;
  ghl_company_id: string | null;
  status: string;
  is_test: boolean;
  demo_mode: boolean;
  trial_active: boolean;
  trial_expires_at: string | null;
  on_acq: boolean;
  on_leadintel: boolean;
  acq_enabled: boolean;
  li_enabled: boolean;
  user_count: number;
}

export interface CustomerDetail {
  customer: {
    id: string; name: string;
    ghl_location_id: string | null; ghl_company_id: string | null;
    acq_account_id: string | null; leadintel_tenant_id: string | null;
    status: string; plan: string;
    is_test: boolean; demo_mode: boolean;
    trial_active: boolean; trial_started_at: string | null; trial_expires_at: string | null;
    notes: string | null;
    created_at: string; updated_at: string;
    on_acq: boolean; on_leadintel: boolean;
    ghl_token_set: boolean;
    ghl_token_last_4: string | null;
    ghl_token_set_at: string | null;
  };
  access: Array<{ product: Product; enabled: boolean; valid_until: string | null; notes: string | null; updated_at: string }>;
  users: Array<{ id: string; email: string; full_name: string | null; product: Product; role: string }>;
  recent_activity: Array<{ id: string; action: string; metadata: Record<string, unknown>; created_at: string }>;
  wallet: { balance_cents: number; refreshed_at: string } | null;
  billing: {
    stripe_customer_id: string | null;
    default_payment_method_id: string | null;
    card_brand: string | null;
    card_last4: string | null;
    card_exp_month: number | null;
    card_exp_year: number | null;
    auto_recharge_enabled: boolean;
    threshold_cents: number;
    topup_amount_cents: number;
  } | null;
  recent_transactions: Array<{
    id: string; product: Product; type: string;
    amount_cents: number; balance_after_cents: number;
    reason: string; created_at: string;
  }>;
  usage_30d: Array<{ product: Product; cnt: number; billed: number }>;
}

export interface AuditEvent {
  id: string;
  created_at: string;
  action: string;
  metadata: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  product: Product | null;
}

// Editable platform-wide API keys (OPENAI, ANTHROPIC, STRIPE, ...).
// Stored in platform.master_keys, read by edge fns via getEnvOrMasterKey().

export interface SyncJob {
  job_name: string;
  label: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
}
export interface MasterKey {
  name: string;
  description: string;
  sensitive: boolean;
  set: boolean;
  length: number;
  updated_at: string | null;
  updated_by_email: string | null;
}

// ── API methods ──
export const adminApi = {
  me:               () => jsonOr<MeResponse>(fetch(`${BASE}/me`,        { headers: authHeader() })),
  listCustomers:    (q = "") => jsonOr<{ customers: CustomerRow[]; count: number }>(fetch(`${BASE}/customers?q=${encodeURIComponent(q)}`, { headers: authHeader() })),
  getCustomer:      (id: string) => jsonOr<CustomerDetail>(fetch(`${BASE}/customers/${id}`, { headers: authHeader() })),
  setCustomerAccess:(id: string, product: Product, enabled: boolean, opts: { valid_until?: string | null; notes?: string | null } = {}) =>
    jsonOr<{ ok: true }>(fetch(`${BASE}/customers/${id}/access`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ product, enabled, ...opts }),
    })),
  createCustomer:   (input: {
    name: string;
    ghl_location_id?: string | null;
    ghl_company_id?: string | null;
    plan?: string;
    is_test?: boolean;
    demo_mode?: boolean;
    trial_active?: boolean;
    trial_expires_at?: string | null;
    notes?: string | null;
    products?: Product[];
  }) =>
    jsonOr<{ ok: true; id: string }>(fetch(`${BASE}/customers`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })),
  updateCustomer:   (id: string, fields: Partial<{ name: string; status: string; is_test: boolean; demo_mode: boolean; trial_active: boolean; trial_expires_at: string | null; plan: string; notes: string }>) =>
    jsonOr<{ ok: true }>(fetch(`${BASE}/customers/${id}`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    })),
  setGhlCredentials: (id: string, fields: { location_id?: string | null; pit_token?: string | null }) =>
    jsonOr<{ ok: true; token_last_4: string | null }>(fetch(`${BASE}/customers/${id}/ghl`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    })),
  revealGhlToken:    (id: string) =>
    jsonOr<{ token: string | null; message?: string }>(fetch(`${BASE}/customers/${id}/ghl/token?confirm=true`, {
      headers: authHeader(),
    })),
  // pit_token is optional: backend falls back to the stored encrypted token
  // if not supplied (so we can validate without forcing a reveal).
  validateGhlCredentials: (id: string, pit_token?: string, location_id?: string) =>
    jsonOr<{
      ok: boolean; ghl_status?: number;
      message?: string; summary?: string;
      location?: { name?: string; address?: string; country?: string };
    }>(fetch(`${BASE}/customers/${id}/ghl/validate`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ pit_token: pit_token || undefined, location_id }),
    })),
  listUsers:        (q = "") => jsonOr<{ users: UserRow[]; count: number }>(fetch(`${BASE}/users?q=${encodeURIComponent(q)}`, { headers: authHeader() })),
  getUser:          (id: string) => jsonOr<UserDetail>(fetch(`${BASE}/users/${id}`, { headers: authHeader() })),
  // Admin-side password reset — bcrypts and writes encrypted_password across
  // platform-db + ACQ + LI auth.users in one call. Response surfaces per-DB
  // bridge results so the UI can flag partial failures.
  setUserPassword:  (id: string, password: string) =>
    jsonOr<{
      ok: true;
      user_id: string;
      platform_auth: { ok: boolean; created?: boolean; error?: string };
      bridges: {
        acq:       { ok: boolean; created?: boolean; error?: string };
        leadintel: { ok: boolean; created?: boolean; error?: string };
      };
      note: string;
    }>(fetch(`${BASE}/users/${id}/password`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })),
  // Create a brand-new platform user (optionally a super-admin) with a password.
  // customer_id assigns the user to a customer in the same step — that's what
  // grants product access (every product the customer has enabled), so the user
  // sees ACQ + Lead Intel immediately instead of logging in to nothing.
  createUser: (p: {
    email: string; password: string; full_name?: string; is_platform_admin?: boolean;
    customer_id?: string; role?: string;
  }) =>
    jsonOr<{
      ok: true; user_id: string; email: string; is_platform_admin: boolean;
      assignment: null | {
        customer_id: string; customer_name: string; role: string; products: string[];
      };
      bridges: {
        platform:  { ok: boolean; created?: boolean; error?: string };
        acq:       { ok: boolean; created?: boolean; error?: string };
        leadintel: { ok: boolean; created?: boolean; error?: string };
      };
      note: string;
    }>(fetch(`${BASE}/users`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(p),
    })),
  // Grant/revoke the platform super-admin flag.
  setPlatformAdmin: (id: string, is_platform_admin: boolean) =>
    jsonOr<{ ok: true; user_id: string; is_platform_admin: boolean }>(fetch(`${BASE}/users/${id}/platform-admin`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ is_platform_admin }),
    })),
  // Per-user access toggles were removed. Access derives from customer membership
  // — manage on the Customers page. setUserAccess removed.
  setupStatus: (id: string) => jsonOr<{
    steps: Array<{ id: string; label: string; done: boolean; detail: string; deep_link?: string }>;
    all_done: boolean;
  }>(fetch(`${BASE}/customers/${id}/setup-status`, { headers: authHeader() })),
  // ── Editable master keys (OPENAI / STRIPE / ...) ───────────────────────────
  // ── Sync schedule (scheduler lives in admin-api; settings in platform-db) ──
  getSyncSchedule:  () => jsonOr<{ jobs: SyncJob[] }>(fetch(`${BASE}/platform-settings/sync-schedule`, { headers: authHeader() })),
  updateSyncJob:    (job: string, fields: { enabled?: boolean; interval_minutes?: number }) =>
    jsonOr<{ ok: true; job: SyncJob }>(fetch(`${BASE}/platform-settings/sync-schedule/${job}`, {
      method: "PUT",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    })),
  runSyncJobNow:    (job: string) =>
    jsonOr<{ ok: boolean; status: string; duration_ms: number }>(fetch(`${BASE}/platform-settings/sync-schedule/${job}/run`, {
      method: "POST",
      headers: authHeader(),
    })),
  listMasterKeys:   () => jsonOr<{ keys: MasterKey[]; count: number }>(fetch(`${BASE}/platform-settings/master-keys`, { headers: authHeader() })),
  setMasterKey:     (name: string, value: string) =>
    jsonOr<{ ok: true; key_name: string; length: number }>(fetch(`${BASE}/platform-settings/master-keys/${name}`, {
      method: "PUT",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    })),
  deleteMasterKey:  (name: string) =>
    jsonOr<{ ok: true; key_name: string; was_present: boolean }>(fetch(`${BASE}/platform-settings/master-keys/${name}`, {
      method: "DELETE",
      headers: authHeader(),
    })),
  listAudit:        (limit = 100, action?: string) =>
    jsonOr<{ events: AuditEvent[]; count: number }>(fetch(`${BASE}/audit?limit=${limit}${action ? `&action=${encodeURIComponent(action)}` : ""}`, { headers: authHeader() })),
  refreshWallet:    (id: string) =>
    jsonOr<{ ok: true; balance_cents: number; components: { acq: number; leadintel: number } }>(fetch(`${BASE}/customers/${id}/wallet/refresh`, {
      method: "POST",
      headers: authHeader(),
    })),
  listPlatformKeys: () =>
    jsonOr<{
      reports: Array<{
        product: "acq_coach" | "lead_intel" | "admin_api";
        keys: Array<{ name: string; set: boolean; length: number }>;
        fetched: boolean;
        error?: string;
      }>;
      note: string;
    }>(fetch(`${BASE}/platform-settings/keys`, { headers: authHeader() })),
};
