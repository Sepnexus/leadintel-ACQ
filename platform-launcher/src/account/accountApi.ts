// Typed client for /admin-api/me/* routes (customer self-service).

import { getSession } from "../auth";

const BASE = "/admin-api";

function authHeader(): Record<string, string> {
  const tok = getSession("acq")?.access_token || getSession("leadintel")?.access_token || "";
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number };
async function jsonOr<T>(p: Promise<Response>): Promise<Result<T>> {
  const r = await p;
  if (!r.ok) {
    let err = `HTTP ${r.status}`;
    try { const j = await r.json(); err = j.error || j.reason || j.message || err; } catch { /* noop */ }
    return { ok: false, error: err, status: r.status };
  }
  return { ok: true, data: (await r.json()) as T };
}

export interface MyCustomer {
  id: string;
  name: string;
  ghl_location_id: string | null;
  status: string;
  on_acq: boolean;
  on_leadintel: boolean;
  my_role: string;
}

export interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  memberships: Array<{ product: "acq_coach" | "lead_intel"; role: string }>;
}

export interface BillingData {
  wallet: { balance_cents: number; refreshed_at: string | null };
  billing: null | {
    stripe_customer_id: string | null;
    stripe_env: string | null;
    default_payment_method_id: string | null;
    card_brand: string | null; card_last4: string | null;
    card_exp_month: number | null; card_exp_year: number | null;
    auto_recharge_enabled: boolean;
    threshold_cents: number | null;
    topup_amount_cents: number | null;
  };
  transactions: Array<{
    id: string; product: string; type: string;
    amount_cents: number; balance_after_cents: number;
    reason: string; created_at: string;
  }>;
  usage_30d: Array<{ product: string; cnt: number; billed: number }>;
}

export interface ConnectionsData {
  ghl: {
    ghl_location_id: string | null;
    ghl_company_id: string | null;
    ghl_token_set: boolean;
    ghl_pit_token_last_4: string | null;
    ghl_pit_token_set_at: string | null;
  };
}

export interface ActivityEvent {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  product: string | null;
  actor_email: string | null;
}

export const accountApi = {
  listMyCustomers: () =>
    jsonOr<{ customers: MyCustomer[]; is_platform_admin: boolean }>(
      fetch(`${BASE}/me/customers`, { headers: authHeader() })),
  listTeam: (cid: string) =>
    jsonOr<{ team: TeamMember[] }>(fetch(`${BASE}/me/customer/${cid}/team`, { headers: authHeader() })),
  // password is only needed when the email has no account yet — the API says so
  // explicitly (error "password_required") rather than us guessing client-side.
  invite: (cid: string, email: string, role: string, full_name?: string, password?: string) =>
    jsonOr<{ ok: true; warning?: string; provisioned?: Array<{ product: string; ok: boolean; error?: string }> }>(
      fetch(`${BASE}/me/customer/${cid}/team`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, full_name, password }),
      })),
  remove: (cid: string, uid: string) =>
    jsonOr<{ ok: true; removed_count: number }>(fetch(`${BASE}/me/customer/${cid}/team/${uid}`, {
      method: "DELETE", headers: authHeader(),
    })),
  billing: (cid: string) =>
    jsonOr<BillingData>(fetch(`${BASE}/me/customer/${cid}/billing`, { headers: authHeader() })),
  connections: (cid: string) =>
    jsonOr<ConnectionsData>(fetch(`${BASE}/me/customer/${cid}/connections`, { headers: authHeader() })),
  activity: (cid: string) =>
    jsonOr<{ events: ActivityEvent[] }>(fetch(`${BASE}/me/customer/${cid}/activity`, { headers: authHeader() })),
  topup: (cid: string, amount_cents: number) =>
    jsonOr<{ ok: true; checkout_url: string; session_id: string }>(fetch(`${BASE}/me/customer/${cid}/topup`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_cents }),
    })),
  billingPortal: (cid: string) =>
    jsonOr<{ ok: true; portal_url: string }>(fetch(`${BASE}/me/customer/${cid}/billing-portal`, {
      method: "POST",
      headers: authHeader(),
    })),
  setAutoRecharge: (cid: string, body: { enabled: boolean; threshold_cents?: number; topup_amount_cents?: number }) =>
    jsonOr<{ ok: true }>(fetch(`${BASE}/me/customer/${cid}/billing/auto-recharge`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })),
};
