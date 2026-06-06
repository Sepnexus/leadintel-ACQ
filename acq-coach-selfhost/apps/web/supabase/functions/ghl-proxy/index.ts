import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Billing rules helper (per-customer markup, configurable thresholds) ─
// OpenAI only — Whisper for transcription, GPT for scoring.
type BillingRules = {
  markup: number; minSeconds: number;
  whisperCentsPerMin: number;
  openaiInCentsPer1k: number; openaiOutCentsPer1k: number;
};
async function loadBillingRules(admin: any, accountId: string): Promise<BillingRules> {
  const [{ data: app }, { data: cust }] = await Promise.all([
    admin.from("app_settings").select("*").eq("id", true).maybeSingle(),
    admin.from("billing_settings").select("markup_multiplier, min_call_seconds_for_ai").eq("account_id", accountId).maybeSingle(),
  ]);
  const a: any = app || {};
  return {
    markup: Number(cust?.markup_multiplier ?? a.default_markup_multiplier ?? 2.0),
    minSeconds: Number(cust?.min_call_seconds_for_ai ?? a.default_min_call_seconds_for_ai ?? 300),
    whisperCentsPerMin: Number(a.whisper_cents_per_minute ?? 0.6),
    openaiInCentsPer1k: Number(a.openai_input_cents_per_1k ?? 0.025),
    openaiOutCentsPer1k: Number(a.openai_output_cents_per_1k ?? 0.10),
  };
}
const whisperCost = (seconds: number, r: BillingRules) => (Math.max(0, seconds) / 60) * r.whisperCentsPerMin;
const gptCost = (tokIn: number, tokOut: number, r: BillingRules) =>
  (tokIn / 1000) * r.openaiInCentsPer1k + (tokOut / 1000) * r.openaiOutCentsPer1k;
// USAGE_MARKUP_MULTIPLIER (platform-wide master key) wins over per-customer
// markup when set to anything other than 1.0.
const billCents = (providerCents: number, r: BillingRules) => {
  const platform = Number(Deno.env.get("USAGE_MARKUP_MULTIPLIER") || "1.0");
  const m = (Number.isFinite(platform) && platform !== 1.0) ? platform : r.markup;
  return Math.max(1, Math.round(providerCents * m));
};


const errorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch (_) {
    return "Unknown error";
  }
};

const firstNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
};

const integerPercent = (value: unknown, fallback = 50) => {
  const n = firstNumber(value, fallback);
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
};

const normalizedOverallScore = (value: unknown) => {
  const n = firstNumber(value, 0);
  const score = n > 0 && n <= 10 ? n * 10 : n;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const fetchWithTimeout = async (input: string | URL | Request, init: RequestInit = {}, timeoutMs = 60000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal || controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

// ── DEMO DATASET ──────────────────────────────────────────────────────────
// Shared read-only sample dataset for customers in demo_mode. All IDs are
// deterministic strings so the data feels stable across reloads.
const DEMO_USERS = [
  { ghl_user_id: "demo-u-1", name: "Marcus Reed",   email: "marcus@demo.local",  role: "sales_rep" },
  { ghl_user_id: "demo-u-2", name: "Priya Shah",    email: "priya@demo.local",   role: "sales_rep" },
  { ghl_user_id: "demo-u-3", name: "Jordan Kim",    email: "jordan@demo.local",  role: "sales_rep" },
  { ghl_user_id: "demo-u-4", name: "Alex Johnson",  email: "alex@demo.local",    role: "admin"     },
];
const DEMO_CONTACTS = [
  { ghl_contact_id: "demo-c-1", name: "Sarah Mitchell", email: "sarah.m@example.com",  phone: "+15550101", assigned_user_id: "demo-u-1" },
  { ghl_contact_id: "demo-c-2", name: "David Lee",      email: "david.lee@example.com",phone: "+15550102", assigned_user_id: "demo-u-1" },
  { ghl_contact_id: "demo-c-3", name: "Emma Garcia",    email: "emma.g@example.com",   phone: "+15550103", assigned_user_id: "demo-u-2" },
  { ghl_contact_id: "demo-c-4", name: "Tom Brown",      email: "tom.b@example.com",    phone: "+15550104", assigned_user_id: "demo-u-2" },
  { ghl_contact_id: "demo-c-5", name: "Lisa Chen",      email: "lisa.c@example.com",   phone: "+15550105", assigned_user_id: "demo-u-3" },
  { ghl_contact_id: "demo-c-6", name: "Mike Davis",     email: "mike.d@example.com",   phone: "+15550106", assigned_user_id: "demo-u-3" },
];
const DEMO_CALL_DEFS = [
  { id: "demo-call-1", rep: "demo-u-1", contact: "demo-c-1", duration: 412, score: 87, grade: "B+", verdict: "Strong discovery, missed the close." },
  { id: "demo-call-2", rep: "demo-u-1", contact: "demo-c-2", duration: 638, score: 92, grade: "A",  verdict: "Excellent objection handling." },
  { id: "demo-call-3", rep: "demo-u-2", contact: "demo-c-3", duration: 305, score: 71, grade: "C+", verdict: "Rushed the pitch, weak rapport." },
  { id: "demo-call-4", rep: "demo-u-2", contact: "demo-c-4", duration: 521, score: 84, grade: "B",  verdict: "Good frame, late on price." },
  { id: "demo-call-5", rep: "demo-u-3", contact: "demo-c-5", duration: 478, score: 78, grade: "B-", verdict: "Solid intro, no clear next step." },
  { id: "demo-call-6", rep: "demo-u-3", contact: "demo-c-6", duration: 712, score: 95, grade: "A+", verdict: "Textbook close, high urgency." },
  { id: "demo-call-7", rep: "demo-u-1", contact: "demo-c-3", duration: 233, score: 64, grade: "D",  verdict: "Dropped the prospect's main concern." },
  { id: "demo-call-8", rep: "demo-u-2", contact: "demo-c-5", duration: 556, score: 81, grade: "B",  verdict: "Strong tone, weak qualification." },
];
const DEMO_TRANSCRIPT = "Rep: Hi, this is Marcus from ACQ. Thanks for jumping on. Prospect: Yeah, no problem. Rep: So tell me, what made you reach out today? Prospect: We've been struggling with our outbound — booking calls but not closing. Rep: Got it. Walk me through what a typical week looks like…";
const demoCallDate = (i: number) => new Date(Date.now() - (i + 1) * 6 * 3600 * 1000).toISOString();

function buildDemoCalls() {
  return DEMO_CALL_DEFS.map((c, i) => {
    const contact = DEMO_CONTACTS.find(x => x.ghl_contact_id === c.contact);
    const direction = i % 2 === 0 ? "outbound" : "inbound";
    return {
      id: c.id,
      ghl_message_id: `${c.id}-msg`,
      contact_id: c.contact,
      conversation_id: `${c.contact}-conv`,
      assigned_user_id: c.rep,
      direction,
      call_status: "completed",
      call_duration: c.duration,
      transcript: DEMO_TRANSCRIPT,
      body: "Call recording",
      status: "scored",
      call_date: demoCallDate(i),
      score_id: `${c.id}-score`,
      phone: contact?.phone || null,
      from: direction === "outbound" ? "+15559990000" : contact?.phone,
      to:   direction === "outbound" ? contact?.phone : "+15559990000",
    };
  });
}
function buildDemoScore(callId: string, accountId: string) {
  const def = DEMO_CALL_DEFS.find(c => c.id === callId);
  if (!def) return null;
  const contact = DEMO_CONTACTS.find(c => c.ghl_contact_id === def.contact);
  const rep = DEMO_USERS.find(u => u.ghl_user_id === def.rep);
  return {
    id: `${callId}-score`,
    account_id: accountId,
    rep_ghl_user_id: def.rep,
    rep_name: rep?.name || "",
    seller_name: contact?.name || "",
    seller_type: "warm-lead",
    call_type: "first-contact",
    overall_score: def.score,
    grade: def.grade,
    verdict: def.verdict,
    transcript: DEMO_TRANSCRIPT,
    duration: `${Math.floor(def.duration / 60)}m ${def.duration % 60}s`,
    seller_talk_ratio: 45,
    rep_talk_ratio: 55,
    moments: [
      { time: "0:42", type: "strength",  text: "Strong open with a tailored question." },
      { time: "2:18", type: "weakness",  text: "Missed signal — prospect mentioned timing." },
      { time: "5:05", type: "strength",  text: "Clean pricing reframe." },
    ],
    strengths: ["Tone control", "Pacing", "Discovery questions"],
    category_scores: [
      { name: "Opening",       category: "Opening",       score: 9 },
      { name: "Discovery",     category: "Discovery",     score: 8 },
      { name: "Qualification", category: "Qualification", score: 7 },
      { name: "Pitch",         category: "Pitch",         score: 8 },
      { name: "Objections",    category: "Objections",    score: 7 },
      { name: "Closing",       category: "Closing",       score: 6 },
    ],
    scored_at: demoCallDate(0),
    created_at: demoCallDate(0),
    updated_at: demoCallDate(0),
  };
}
function buildDemoResponse(action: string, accountId: string, body: any) {
  if (action === "list-users") return { users: DEMO_USERS.map(u => ({ ...u, account_id: accountId, id: u.ghl_user_id })) };
  if (action === "list-contacts") {
    const counts: Record<string, number> = {};
    for (const c of DEMO_CONTACTS) counts[c.assigned_user_id] = (counts[c.assigned_user_id] || 0) + 1;
    return { contacts: DEMO_CONTACTS, counts, total: DEMO_CONTACTS.length, filtered_total: DEMO_CONTACTS.length, page: 1, page_size: 50 };
  }
  if (action === "list-calls") {
    const calls = buildDemoCalls();
    const filtered = body.assigned_user_id ? calls.filter(c => c.assigned_user_id === body.assigned_user_id) : calls;
    return {
      calls: filtered, total: calls.length, pending: 0, scored: calls.length,
      no_transcript: 0, indexed: 0, filtered_total: filtered.length, page: 1, page_size: 50,
    };
  }
  if (action === "list-conversations") {
    const conversations = DEMO_CONTACTS.map((c, i) => ({
      id: `${c.ghl_contact_id}-conv`,
      ghl_conversation_id: `${c.ghl_contact_id}-conv`,
      contact_id: c.ghl_contact_id,
      assigned_user_id: c.assigned_user_id,
      last_message_body: "Call recording",
      last_message_type: "TYPE_CALL",
      last_message_date: demoCallDate(i),
      unread_count: 0,
      type: "TYPE_CALL",
    }));
    return { conversations, total: conversations.length, total_messages: DEMO_CALL_DEFS.length, total_calls: DEMO_CALL_DEFS.length, filtered_total: conversations.length, page: 1, page_size: 50 };
  }
  if (action === "list-messages") {
    return { messages: buildDemoCalls().map(c => ({
      id: c.id, ghl_message_id: c.ghl_message_id, conversation_id: c.conversation_id,
      contact_id: c.contact_id, user_id: c.assigned_user_id, message_type: "TYPE_CALL",
      direction: c.direction, status: c.call_status, body: c.body,
      call_duration: c.call_duration, call_status: c.call_status, recording_url: null,
      transcript: c.transcript, message_date: c.call_date,
    })) };
  }
  if (action === "get-score") {
    const score = buildDemoScore(body.call_id, accountId);
    return { ok: true, score };
  }
  if (action === "list-scores") {
    const scores = DEMO_CALL_DEFS.map(d => buildDemoScore(d.id, accountId)).filter(Boolean);
    return { scores };
  }
  if (action === "list-blocked-numbers") return { blocked: [] };
  return { error: "demo: unsupported action" };
}

// Actions that anyone authenticated can hit (auth still required, just no role gate)
const PUBLIC_ACTIONS = new Set<string>(["whoami"]);
// Actions that require super_admin
const SUPER_ONLY_ACTIONS = new Set<string>(["add-account", "delete-account"]);
// Actions reps are NOT allowed to call (admin-only mutations / sync work)
const ADMIN_ONLY_ACTIONS = new Set<string>([
  "add-account", "delete-account",
  "fetch-users", "fetch-contacts", "fetch-conversations", "fetch-transcripts",
  "transcribe-recordings", "score-call", "score-pending",
  "add-blocked-number", "remove-blocked-number",
  "assign-user-role", "update-ghl-user-role",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── AUTH GATE ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;
    const callerEmail = (userData.user.email || "").toLowerCase();

    // Bootstrap super_admin role for the seed account
    const SUPER_ADMIN_BOOTSTRAP_EMAIL = "akshay@sepnexus.com";
    if (callerEmail === SUPER_ADMIN_BOOTSTRAP_EMAIL) {
      const { data: existing } = await supabaseAdmin.from("user_roles")
        .select("id").eq("user_id", callerId).eq("role", "super_admin").maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("user_roles").insert({ user_id: callerId, role: "super_admin", account_id: null });
      }
    }

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles").select("role, account_id").eq("user_id", callerId);
    const isSuper = !!callerRoles?.some((r) => r.role === "super_admin");
    const adminAccountIds = new Set((callerRoles || []).filter(r => r.role === "account_admin").map(r => r.account_id));
    const repAccountIds = new Set((callerRoles || []).filter(r => r.role === "rep").map(r => r.account_id));

    const body = await req.json();
    const { action, account_id, name, api_key, location_id, company_id, user_id, role, assigned_user_id, cursor, cursor_id, page, page_size, days_back, call_id, ghl_message_id, batch_offset, batch_limit, contact_id, conversation_id, phone_number, reason, blocked_id } = body;

    // whoami: returns roles + accounts the caller can see
    if (action === "whoami") {
      const accountIds = Array.from(new Set([
        ...adminAccountIds, ...repAccountIds,
      ].filter(Boolean) as string[]));
      let accounts: any[] = [];
      if (isSuper) {
        const { data } = await supabaseAdmin.from("ghl_accounts").select("id, name, location_id, company_id, integrated_at, is_active").order("created_at", { ascending: false });
        accounts = data || [];
      } else if (accountIds.length) {
        const { data } = await supabaseAdmin.from("ghl_accounts").select("id, name, location_id, company_id, integrated_at, is_active").in("id", accountIds);
        accounts = data || [];
      }
      let repGhlIds: string[] = [];
      if (repAccountIds.size) {
        const { data } = await supabaseAdmin.from("rep_assignments")
          .select("account_id, ghl_user_id").eq("user_id", callerId);
        repGhlIds = (data || []).map(r => r.ghl_user_id);
      }
      return jsonResponse({
        user: { id: callerId, email: userData.user.email },
        is_super_admin: isSuper,
        admin_account_ids: Array.from(adminAccountIds),
        rep_account_ids: Array.from(repAccountIds),
        rep_ghl_user_ids: repGhlIds,
        accounts,
      });
    }

    // Super-only gate
    if (SUPER_ONLY_ACTIONS.has(action) && !isSuper) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    // Tenant membership gate
    if (account_id) {
      const isMember = isSuper || adminAccountIds.has(account_id) || repAccountIds.has(account_id);
      if (!isMember) return jsonResponse({ error: "Forbidden: not a member of this account" }, 403);
      const isAdminHere = isSuper || adminAccountIds.has(account_id);
      if (ADMIN_ONLY_ACTIONS.has(action) && !isAdminHere) {
        return jsonResponse({ error: "Forbidden: admin only" }, 403);
      }
    }

    // Demo mode is now backed by REAL rows seeded into the database
    // (see public.seed_demo_data). No virtual intercept needed — RLS,
    // counts, rep filtering, billing, and the dashboard all work uniformly.

    // For Reps: scope read-only listings to their assigned ghl_user_id
    let repFilterGhlIds: string[] | null = null;
    if (account_id && !isSuper && !adminAccountIds.has(account_id) && repAccountIds.has(account_id)) {
      const { data } = await supabaseAdmin.from("rep_assignments")
        .select("ghl_user_id").eq("user_id", callerId).eq("account_id", account_id);
      repFilterGhlIds = (data || []).map(r => r.ghl_user_id);
      if (!repFilterGhlIds.length) repFilterGhlIds = ["__none__"]; // force empty results
    }

    // Normalize a phone string for comparison (strip non-digits, keep last 10)
    const normalizePhone = (p: unknown): string => {
      const digits = String(p ?? "").replace(/\D/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    // ── ADD ACCOUNT ───────────────────────────────────────────────────────
    if (action === "add-account") {
      if (!name || !api_key || !location_id || !company_id) {
        return new Response(JSON.stringify({ error: "name, api_key, location_id, and company_id are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabaseAdmin
        .from("ghl_accounts")
        .insert({ name, api_key, location_id, company_id })
        .select()
        .single();
      if (error) throw error;

      // Best-effort: pull GHL users (reps) immediately so they appear in the UI
      // without waiting for the next cron run. Failures are non-fatal.
      try {
        const ghlRes = await fetch(
          `https://services.leadconnectorhq.com/users/search?companyId=${company_id}&locationId=${location_id}`,
          { headers: { Authorization: `Bearer ${api_key}`, Version: "2021-07-28", Accept: "application/json" } },
        );
        if (ghlRes.ok) {
          const ghlData = await ghlRes.json();
          const users = ghlData.users || [];
          for (const u of users) {
            const fullName = u.name || [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
            await supabaseAdmin.from("ghl_users").upsert(
              {
                account_id: data.id,
                ghl_user_id: u.id,
                name: fullName || u.email || "Unnamed",
                email: u.email || "",
                phone: u.phone || null,
                raw_data: u,
              },
              { onConflict: "account_id,ghl_user_id" },
            );
          }
        }
      } catch (e) {
        console.log("add-account: initial user sync failed:", (e as Error).message);
      }

      return new Response(JSON.stringify({ account: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST ACCOUNTS ─────────────────────────────────────────────────────
    if (action === "list-accounts") {
      let q = supabaseAdmin
        .from("ghl_accounts")
        .select("id, name, location_id, company_id, integrated_at, is_active, demo_mode, created_at")
        .order("created_at", { ascending: false });
      if (!isSuper) {
        const allowed = Array.from(new Set([...adminAccountIds, ...repAccountIds]));
        if (!allowed.length) return jsonResponse({ accounts: [] });
        q = q.in("id", allowed);
      }
      const { data, error } = await q;
      if (error) throw error;
      return jsonResponse({ accounts: data });
    }

    // ── BLOCKED NUMBERS: LIST / ADD / REMOVE ─────────────────────────────
    if (action === "list-blocked-numbers") {
      if (!account_id) return jsonResponse({ error: "account_id required" }, 400);
      const { data, error } = await supabaseAdmin
        .from("blocked_numbers")
        .select("id, phone_number, reason, created_at")
        .eq("account_id", account_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ blocked: data || [] });
    }

    if (action === "add-blocked-number") {
      if (!account_id || !phone_number) return jsonResponse({ error: "account_id and phone_number required" }, 400);
      const normalized = normalizePhone(phone_number);
      if (!normalized) return jsonResponse({ error: "Invalid phone number" }, 400);
      const { data, error } = await supabaseAdmin
        .from("blocked_numbers")
        .upsert({ account_id, phone_number: normalized, reason: reason || null }, { onConflict: "account_id,phone_number" })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse({ ok: true, blocked: data });
    }

    if (action === "remove-blocked-number") {
      if (!account_id) return jsonResponse({ error: "account_id required" }, 400);
      let q = supabaseAdmin.from("blocked_numbers").delete().eq("account_id", account_id);
      if (blocked_id) q = q.eq("id", blocked_id);
      else if (phone_number) q = q.eq("phone_number", normalizePhone(phone_number));
      else return jsonResponse({ error: "blocked_id or phone_number required" }, 400);
      const { error } = await q;
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // ── DELETE ACCOUNT ────────────────────────────────────────────────────
    if (action === "delete-account") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabaseAdmin.from("ghl_accounts").delete().eq("id", account_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FETCH USERS FROM GHL ──────────────────────────────────────────────
    if (action === "fetch-users") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error: accErr } = await supabaseAdmin
        .from("ghl_accounts")
        .select("api_key, location_id, company_id")
        .eq("id", account_id)
        .single();
      if (accErr || !account) throw accErr || new Error("Account not found");

      const ghlRes = await fetch(
        `https://services.leadconnectorhq.com/users/search?companyId=${account.company_id}&locationId=${account.location_id}`,
        {
          headers: {
            Authorization: `Bearer ${account.api_key}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
        }
      );

      if (!ghlRes.ok) {
        const errText = await ghlRes.text();
        return new Response(JSON.stringify({ error: `GHL API error: ${ghlRes.status}`, details: errText }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ghlData = await ghlRes.json();
      const users = ghlData.users || [];

      for (const u of users) {
        await supabaseAdmin.from("ghl_users").upsert(
          {
            account_id,
            ghl_user_id: u.id,
            name: u.name || u.firstName + " " + (u.lastName || ""),
            email: u.email || "",
            phone: u.phone || null,
            raw_data: u,
          },
          { onConflict: "account_id,ghl_user_id" }
        );
      }

      const { data: dbUsers, error: dbErr } = await supabaseAdmin
        .from("ghl_users")
        .select("*")
        .eq("account_id", account_id)
        .order("name");
      if (dbErr) throw dbErr;

      return new Response(JSON.stringify({ users: dbUsers, fetched: users.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST USERS ────────────────────────────────────────────────────────
    if (action === "list-users") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabaseAdmin
        .from("ghl_users")
        .select("*")
        .eq("account_id", account_id)
        .order("name");
      if (error) throw error;
      return new Response(JSON.stringify({ users: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE USER ROLE ──────────────────────────────────────────────────
    if (action === "update-role") {
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id and role required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const validRoles = ["unassigned", "sales_rep", "admin"];
      if (!validRoles.includes(role)) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabaseAdmin
        .from("ghl_users")
        .update({ role })
        .eq("id", user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FETCH CONTACTS FROM GHL ───────────────────────────────────────────
    if (action === "fetch-contacts") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error: accErr } = await supabaseAdmin
        .from("ghl_accounts")
        .select("api_key, location_id")
        .eq("id", account_id)
        .single();
      if (accErr || !account) throw accErr || new Error("Account not found");

      let allContacts: any[] = [];
      // GHL requires BOTH startAfter (number) and startAfterId (string) for pagination
      let nextStartAfter: number | null = cursor ? Number(cursor) : null;
      let nextStartAfterId: string | null = cursor_id || null;
      let pageCount = 0;
      // Keep each invocation small so Lovable Cloud doesn't terminate long contact sync batches.
      // The frontend already loops with cursors, so one GHL page per function call is safer.
      const MAX_PAGES = 1;
      const seenContactIds = new Set<string>();

      while (pageCount < MAX_PAGES) {
        let url = `https://services.leadconnectorhq.com/contacts/?locationId=${account.location_id}&limit=100`;
        if (nextStartAfter !== null && !isNaN(nextStartAfter)) {
          url += `&startAfter=${nextStartAfter}`;
        }
        if (nextStartAfterId) {
          url += `&startAfterId=${encodeURIComponent(nextStartAfterId)}`;
        }

        const ghlRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${account.api_key}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
        });

        if (!ghlRes.ok) {
          const errText = await ghlRes.text();
          // If we already fetched some contacts, save what we have and return partial results
          if (allContacts.length > 0) break;
          return jsonResponse({ ok: false, error: `GHL API error: ${ghlRes.status}`, details: errText, retryable: ghlRes.status >= 500 }, 200);
        }

        const ghlData = await ghlRes.json();
        const contacts = ghlData.contacts || [];
        if (contacts.length === 0) {
          nextStartAfter = null;
          nextStartAfterId = null;
          break;
        }

        const uniqueContacts = contacts.filter((contact: any) => {
          const contactId = contact?.id;
          if (!contactId || seenContactIds.has(contactId)) return false;
          seenContactIds.add(contactId);
          return true;
        });

        if (uniqueContacts.length === 0) {
          nextStartAfter = null;
          nextStartAfterId = null;
          break;
        }

        allContacts = allContacts.concat(uniqueContacts);

        // Check if this is the last page
        if (contacts.length < 100) {
          nextStartAfter = null;
          nextStartAfterId = null;
          break;
        }

        // Extract BOTH cursor values from meta
        const metaStartAfter = ghlData.meta?.startAfter ?? null;
        const metaStartAfterId = ghlData.meta?.startAfterId ?? null;

        // Need at least one cursor to continue
        if (metaStartAfter === null && metaStartAfterId === null) {
          nextStartAfter = null;
          nextStartAfterId = null;
          break;
        }

        const newStartAfter = metaStartAfter !== null ? Number(metaStartAfter) : null;
        // Detect stuck cursor
        if (newStartAfter !== null && newStartAfter === nextStartAfter && metaStartAfterId === nextStartAfterId) {
          nextStartAfter = null;
          nextStartAfterId = null;
          break;
        }

        nextStartAfter = newStartAfter;
        nextStartAfterId = metaStartAfterId;
        pageCount++;
      }

      // Upsert contacts in batches of 50
      for (let i = 0; i < allContacts.length; i += 50) {
        const batch = allContacts.slice(i, i + 50).map(c => ({
          account_id,
          ghl_contact_id: c.id,
          assigned_user_id: c.assignedTo || null,
          name: c.contactName || c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || "",
          email: c.email || "",
          phone: c.phone || null,
          raw_data: c,
        }));
        await supabaseAdmin.from("ghl_contacts").upsert(batch, { onConflict: "account_id,ghl_contact_id" });
      }

      const { count: storedTotal, error: countError } = await supabaseAdmin
        .from("ghl_contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);
      if (countError) throw countError;

      const hasMore = nextStartAfter !== null || nextStartAfterId !== null;
      return jsonResponse({ ok: true, fetched: allContacts.length, hasMore, cursor: nextStartAfter, cursor_id: nextStartAfterId, stored_total: storedTotal || 0 });
    }

    // ── LIST CONTACTS ─────────────────────────────────────────────────────
    if (action === "list-contacts") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pageNumber = Math.max(Number(page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(page_size) || 50, 1), 100);
      const from = (pageNumber - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from("ghl_contacts")
        .select("id, ghl_contact_id, assigned_user_id, name, email, phone, created_at", { count: "exact" })
        .eq("account_id", account_id)
        .order("name")
        .range(from, to);

      if (assigned_user_id) {
        query = query.eq("assigned_user_id", assigned_user_id);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const { count: totalCount, error: totalErr } = await supabaseAdmin
        .from("ghl_contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);
      if (totalErr) throw totalErr;

      const counts: Record<string, number> = {};
      let countFrom = 0;
      const countBatchSize = 1000;

      while (true) {
        const { data: countRows, error: countErr } = await supabaseAdmin
          .from("ghl_contacts")
          .select("assigned_user_id")
          .eq("account_id", account_id)
          .range(countFrom, countFrom + countBatchSize - 1);

        if (countErr) throw countErr;
        if (!countRows?.length) break;

        for (const c of countRows) {
          if (c.assigned_user_id) {
            counts[c.assigned_user_id] = (counts[c.assigned_user_id] || 0) + 1;
          }
        }

        if (countRows.length < countBatchSize) {
          break;
        }

        countFrom += countBatchSize;
      }

      return new Response(JSON.stringify({ contacts: data, counts, total: totalCount || 0, filtered_total: count || 0, page: pageNumber, page_size: pageSize }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── INDEX CALLS FROM GHL (via conversations, no transcripts) ─────────────
    if (action === "index-calls") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error: accErr } = await supabaseAdmin
        .from("ghl_accounts")
        .select("api_key, location_id")
        .eq("id", account_id)
        .single();
      if (accErr || !account) throw accErr || new Error("Account not found");

      const ghlHeaders = {
        Authorization: `Bearer ${account.api_key}`,
        Version: "2021-04-15",
        Accept: "application/json",
      };

      const offset = Number(batch_offset) || 0;
      const limit = Math.min(Number(batch_limit) || 100, 200);
      const daysBack = days_back || 20;
      const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      const { count: totalContactCount } = await supabaseAdmin
        .from("ghl_contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);

      const { data: contacts, error: cErr } = await supabaseAdmin
        .from("ghl_contacts")
        .select("ghl_contact_id, assigned_user_id, name")
        .eq("account_id", account_id)
        .order("name")
        .range(offset, offset + limit - 1);
      if (cErr) throw cErr;

      const contactList = contacts || [];
      let contactsProcessed = 0;
      let conversationsFound = 0;
      let callsIndexed = 0;

      console.log(`[index-calls] Batch offset=${offset} limit=${limit}, processing ${contactList.length} contacts (last ${daysBack} days)`);

      for (const contact of contactList) {
        contactsProcessed++;
        const convUrl = `https://services.leadconnectorhq.com/conversations/search?locationId=${account.location_id}&contactId=${contact.ghl_contact_id}`;

        try {
          const convRes = await fetch(convUrl, { headers: ghlHeaders });
          if (!convRes.ok) {
            console.log(`[index-calls] Conv search failed for contact ${contact.ghl_contact_id}: ${convRes.status}`);
            continue;
          }

          const convData = await convRes.json();
          const conversations = convData.conversations || [];
          if (conversations.length === 0) continue;
          conversationsFound += conversations.length;

          for (const conv of conversations) {
            const msgUrl = `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?type=TYPE_CALL&limit=100`;
            try {
              const msgRes = await fetch(msgUrl, { headers: ghlHeaders });
              if (!msgRes.ok) {
                console.log(`[index-calls] Msg fetch failed for conv ${conv.id}: ${msgRes.status}`);
                continue;
              }

              const msgData = await msgRes.json();
              const callMessages = (msgData.messages?.messages || msgData.messages || []);
              if (!Array.isArray(callMessages) || callMessages.length === 0) continue;

              const rows = callMessages
                .filter((msg: any) => {
                  const msgDate = new Date(msg.dateAdded || 0);
                  if (msgDate < cutoffDate) return false;
                  const callStatus = msg.meta?.callStatus;
                  return callStatus === "completed" || callStatus === "answered";
                })
                .map((msg: any) => ({
                  account_id,
                  ghl_message_id: msg.id,
                  contact_id: contact.ghl_contact_id,
                  conversation_id: conv.id,
                  assigned_user_id: msg.userId || contact.assigned_user_id || null,
                  direction: msg.direction || "inbound",
                  call_status: msg.meta?.callStatus || null,
                  call_duration: msg.meta?.callDuration ? Number(msg.meta.callDuration) : 0,
                  transcript: null,
                  body: msg.body || null,
                  call_date: msg.dateAdded || null,
                  raw_data: msg,
                  status: "indexed",
                }));

              if (rows.length === 0) continue;
              callsIndexed += rows.length;
              const { error: upsertErr } = await supabaseAdmin.from("ghl_calls").upsert(rows, { onConflict: "account_id,ghl_message_id" });
              if (upsertErr) throw upsertErr;
            } catch (msgErr) {
              console.log(`[index-calls] Error processing messages for conv ${conv.id}:`, msgErr);
            }
          }
        } catch (convErr) {
          console.log(`[index-calls] Error processing contact ${contact.ghl_contact_id}:`, convErr);
        }
      }

      console.log(`[index-calls] Batch done: ${contactsProcessed} contacts, ${conversationsFound} conversations, ${callsIndexed} calls indexed`);

      const hasMore = (offset + limit) < (totalContactCount || 0);

      const { count: storedTotal } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);

      const { count: indexedCount } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .eq("status", "indexed");

      return new Response(JSON.stringify({
        ok: true,
        contacts_processed: contactsProcessed,
        conversations_found: conversationsFound,
        calls_indexed: callsIndexed,
        stored_total: storedTotal || 0,
        indexed_total: indexedCount || 0,
        total_contacts: totalContactCount || 0,
        batch_offset: offset,
        batch_limit: limit,
        has_more: hasMore,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FETCH TRANSCRIPTS FOR SAVED CALLS ────────────────────────────────────
    if (action === "fetch-transcripts") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error: accErr } = await supabaseAdmin
        .from("ghl_accounts")
        .select("api_key, location_id")
        .eq("id", account_id)
        .single();
      if (accErr || !account) throw accErr || new Error("Account not found");

      const ghlHeaders = {
        Authorization: `Bearer ${account.api_key}`,
        Version: "2021-04-15",
        Accept: "application/json",
        LocationId: account.location_id,
      };

      const limit = Math.min(Number(batch_limit) || 100, 200);
      const offset = Number(batch_offset) || 0;

      // Step A: Sync any call-type messages from ghl_messages into ghl_calls (so transcripts can be attached)
      const { data: callMsgs } = await supabaseAdmin
        .from("ghl_messages")
        .select("ghl_message_id, conversation_id, contact_id, user_id, direction, call_status, call_duration, body, message_date, raw_data")
        .eq("account_id", account_id)
        .ilike("message_type", "%CALL%")
        .limit(1000);

      if (callMsgs && callMsgs.length > 0) {
        // Find existing calls to skip
        const existingIds = new Set<string>();
        const ids = callMsgs.map((m: any) => m.ghl_message_id);
        for (let i = 0; i < ids.length; i += 200) {
          const slice = ids.slice(i, i + 200);
          const { data: existing } = await supabaseAdmin
            .from("ghl_calls")
            .select("ghl_message_id")
            .eq("account_id", account_id)
            .in("ghl_message_id", slice);
          (existing || []).forEach((e: any) => existingIds.add(e.ghl_message_id));
        }

        const toInsert = callMsgs
          .filter((m: any) => !existingIds.has(m.ghl_message_id))
          .map((m: any) => ({
            account_id,
            ghl_message_id: m.ghl_message_id,
            conversation_id: m.conversation_id,
            contact_id: m.contact_id,
            assigned_user_id: m.user_id || null,
            direction: m.direction || "inbound",
            call_status: m.call_status || null,
            call_duration: m.call_duration || 0,
            body: m.body || null,
            call_date: m.message_date || null,
            raw_data: m.raw_data,
            status: "indexed",
            transcript: null,
          }));

        if (toInsert.length > 0) {
          for (let i = 0; i < toInsert.length; i += 50) {
            await supabaseAdmin.from("ghl_calls").upsert(toInsert.slice(i, i + 50), { onConflict: "account_id,ghl_message_id" });
          }
          console.log(`[fetch-transcripts] Synced ${toInsert.length} new call rows from ghl_messages`);
        }
      }

      const { data: callsToProcess, error: callsErr } = await supabaseAdmin
        .from("ghl_calls")
        .select("id, ghl_message_id, body")
        .eq("account_id", account_id)
        .in("status", ["indexed", "no_transcript"])
        .order("call_date", { ascending: false })
        .range(offset, offset + limit - 1);
      if (callsErr) throw callsErr;

      const queue = callsToProcess || [];
      let processed = 0;
      let transcriptsFetched = 0;
      let missingTranscripts = 0;

      console.log(`[fetch-transcripts] offset=${offset} limit=${limit}, processing ${queue.length} indexed calls`);

      for (const call of queue) {
        processed++;
        let transcriptText: string | null = null;

        try {
          const txUrl = `https://services.leadconnectorhq.com/conversations/locations/${account.location_id}/messages/${call.ghl_message_id}/transcription`;
          const txRes = await fetch(txUrl, { headers: ghlHeaders });
          if (txRes.ok) {
            const txData = await txRes.json();
            const sentences = Array.isArray(txData) ? txData : (txData?.transcriptions || txData?.transcript || [txData]);
            if (Array.isArray(sentences) && sentences.length > 0 && sentences.some((s: any) => s.transcript)) {
              transcriptText = sentences
                .filter((s: any) => s.transcript)
                .map((s: any) => {
                  const label = s.mediaChannel === 0 ? "Rep:" : "Seller:";
                  return `${label} ${s.transcript}`;
                })
                .join("\n");
            }
          } else {
            const errBody = await txRes.text().catch(() => "");
            console.log(`[fetch-transcripts] Transcription API failed for ${call.ghl_message_id}: ${txRes.status} ${errBody.slice(0, 200)}`);
          }
        } catch (txErr) {
          console.log(`[fetch-transcripts] Transcription fetch failed for ${call.ghl_message_id}:`, txErr);
        }

        if (!transcriptText && call.body && call.body.trim().length > 50) {
          transcriptText = call.body;
        }

        const nextStatus = transcriptText ? "pending" : "no_transcript";
        const { error: updateErr } = await supabaseAdmin
          .from("ghl_calls")
          .update({ transcript: transcriptText, status: nextStatus })
          .eq("id", call.id);
        if (updateErr) throw updateErr;

        if (transcriptText) transcriptsFetched++;
        else missingTranscripts++;
      }

      console.log(`[fetch-transcripts] Batch done: ${processed} calls, ${transcriptsFetched} transcripts, ${missingTranscripts} missing`);

      const { count: pendingCount } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .eq("status", "pending");

      const { count: indexedCount } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .eq("status", "indexed");

      return new Response(JSON.stringify({
        ok: true,
        processed,
        transcripts_fetched: transcriptsFetched,
        missing_transcripts: missingTranscripts,
        pending_scoring: pendingCount || 0,
        indexed_remaining: indexedCount || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── TRANSCRIBE RECORDINGS VIA DEEPGRAM (test mode, default 10) ─────────
    if (action === "transcribe-recordings") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Wallet balance gate
      const { data: w } = await supabaseAdmin.from("wallets").select("balance_cents").eq("account_id", account_id).maybeSingle();
      if (!w || w.balance_cents < 10) {
        return new Response(JSON.stringify({ ok: false, error: "insufficient_balance", message: "Wallet balance too low. Top up to continue.", balance_cents: w?.balance_cents || 0 }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error: accErr } = await supabaseAdmin
        .from("ghl_accounts")
        .select("api_key, location_id")
        .eq("id", account_id)
        .single();
      if (accErr || !account) throw accErr || new Error("Account not found");

      const limit = Math.min(Number(batch_limit) || 2, 3);

      // Load blocked numbers (normalized) for this account
      const { data: blockedRows } = await supabaseAdmin
        .from("blocked_numbers")
        .select("phone_number")
        .eq("account_id", account_id);
      const blockedSet = new Set((blockedRows || []).map((b: any) => normalizePhone(b.phone_number)));

      // Pick calls that don't have a transcript yet AND meet the per-customer
      // minimum duration. Short calls are skipped — we only score real
      // seller conversations.
      const rules = await loadBillingRules(supabaseAdmin, account_id);
      // Sweep: mark sub-threshold calls as skipped_short so they leave the queue.
      await supabaseAdmin.from("ghl_calls")
        .update({ status: "skipped_short" })
        .eq("account_id", account_id)
        .lt("call_duration", rules.minSeconds)
        .in("status", ["indexed", "pending", "no_transcript"]);
      const { data: callPool, error: callsErr } = await supabaseAdmin
        .from("ghl_calls")
        .select("id, ghl_message_id, call_duration, raw_data")
        .eq("account_id", account_id)
        .is("transcript", null)
        .gte("call_duration", rules.minSeconds)
        .order("call_date", { ascending: false })
        .limit(limit * 4);
      if (callsErr) throw callsErr;

      const queue: any[] = [];
      let blockedSkipped = 0;
      for (const c of callPool || []) {
        const from = normalizePhone(c.raw_data?.from);
        const to = normalizePhone(c.raw_data?.to);
        if ((from && blockedSet.has(from)) || (to && blockedSet.has(to))) {
          blockedSkipped++;
          await supabaseAdmin.from("ghl_calls").update({ status: "no_transcript" }).eq("id", c.id);
          continue;
        }
        queue.push(c);
        if (queue.length >= limit) break;
      }
      console.log(`[transcribe-recordings] Processing ${queue.length} calls (limit=${limit}, blocked skipped=${blockedSkipped})`);

      let transcribed = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const call of queue) {
        try {
          // 1. Fetch recording WAV from GHL
          const recUrl = `https://services.leadconnectorhq.com/conversations/messages/${call.ghl_message_id}/locations/${account.location_id}/recording`;
          const recRes = await fetchWithTimeout(recUrl, {
            headers: {
              Authorization: `Bearer ${account.api_key}`,
              Version: "2021-04-15",
            },
          }, 45000);
          if (!recRes.ok) {
            const t = await recRes.text().catch(() => "");
            console.log(`[transcribe-recordings] Recording fetch failed ${call.ghl_message_id}: ${recRes.status} ${t.slice(0, 150)}`);
            errors.push(`${call.ghl_message_id}: recording ${recRes.status}`);
            failed++;
            await supabaseAdmin.from("ghl_calls").update({ status: "no_transcript" }).eq("id", call.id);
            continue;
          }
          const audioBuf = await recRes.arrayBuffer();
          if (audioBuf.byteLength < 1000) {
            console.log(`[transcribe-recordings] Recording too small for ${call.ghl_message_id} (${audioBuf.byteLength} bytes)`);
            errors.push(`${call.ghl_message_id}: empty recording`);
            failed++;
            await supabaseAdmin.from("ghl_calls").update({ status: "no_transcript" }).eq("id", call.id);
            continue;
          }

          // 2. Send to OpenAI Whisper
          const ext = (call.ghl_message_id || "rec").toString();
          const audioBlob = new Blob([audioBuf], { type: "audio/wav" });
          const whisperForm = new FormData();
          whisperForm.append("file", audioBlob, `${ext}.wav`);
          whisperForm.append("model", "whisper-1");
          whisperForm.append("response_format", "verbose_json");
          const dgRes = await fetchWithTimeout(
            "https://api.openai.com/v1/audio/transcriptions",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${openaiKey}` },
              body: whisperForm,
            },
            120000
          );
          if (!dgRes.ok) {
            const t = await dgRes.text().catch(() => "");
            console.log(`[transcribe-recordings] Whisper failed ${call.ghl_message_id}: ${dgRes.status} ${t.slice(0, 150)}`);
            errors.push(`${call.ghl_message_id}: whisper ${dgRes.status}`);
            failed++;
            continue;
          }
          const dgData = await dgRes.json();
          // Whisper has no diarization — store transcript with a note so the scoring AI can still parse it.
          const rawText = (dgData?.text || "").trim();
          const transcriptText = rawText
            ? `// Auto-transcribed by Whisper — speaker labels (Rep:/Seller:) are not available.\n\n${rawText}`
            : "";
          const whisperDuration = Math.round(dgData?.duration || call.call_duration || 0);

          if (!transcriptText.trim()) {
            console.log(`[transcribe-recordings] Empty transcript for ${call.ghl_message_id}`);
            failed++;
            await supabaseAdmin.from("ghl_calls").update({ status: "no_transcript" }).eq("id", call.id);
            continue;
          }

          await supabaseAdmin
            .from("ghl_calls")
            .update({ transcript: transcriptText, status: "pending" })
            .eq("id", call.id);
          transcribed++;
          // ── Cost tracking: provider rate × per-customer markup
          const audioSecs = whisperDuration || (Number(call.call_duration) || 0);
          const providerCostCents = whisperCost(audioSecs, rules);
          const billedCents = billCents(providerCostCents, rules);
          try {
            await supabaseAdmin.rpc("debit_wallet", {
              _account_id: account_id,
              _amount_cents: billedCents,
              _reason: "Transcription (Whisper)",
              _metadata: { call_id: call.id, ghl_message_id: call.ghl_message_id, audio_seconds: audioSecs, markup: rules.markup },
            });
          } catch (e) { console.log("debit_wallet (transcribe) failed:", e); }
          try {
            await supabaseAdmin.from("usage_events").insert({
              account_id,
              operation: "transcription",
              provider: "openai",
              model: "whisper-1",
              call_id: call.id,
              ghl_message_id: call.ghl_message_id,
              audio_seconds: audioSecs,
              effective_seconds: audioSecs,
              provider_cost_cents: providerCostCents,
              billed_cents: billedCents,
              markup_multiplier: rules.markup,
              status: "success",
              metadata: { transcript_chars: transcriptText.length, source: "manual-transcribe" },
            });
          } catch (e) { console.log("usage_events (transcribe) failed:", e); }
          console.log(`[transcribe-recordings] ✓ ${call.ghl_message_id}: ${transcriptText.length} chars`);
        } catch (e) {
          console.log(`[transcribe-recordings] Exception for ${call.ghl_message_id}:`, e);
          errors.push(`${call.ghl_message_id}: ${e instanceof Error ? e.message : "unknown"}`);
          failed++;
          await supabaseAdmin.from("ghl_calls").update({ status: "no_transcript" }).eq("id", call.id);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        processed: queue.length,
        transcribed,
        failed,
        blocked_skipped: blockedSkipped,
        errors: errors.slice(0, 10),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FETCH CALLS FROM GHL (legacy combined flow) ─────────────────────────
    if (action === "fetch-calls") {
      return new Response(JSON.stringify({
        error: "fetch-calls has been replaced. Use index-calls first, then fetch-transcripts.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST CALLS ──────────────────────────────────────────────────────────
    if (action === "list-calls") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pageNumber = Math.max(Number(page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(page_size) || 50, 1), 100);
      const from = (pageNumber - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from("ghl_calls")
        .select("id, ghl_message_id, contact_id, conversation_id, assigned_user_id, direction, call_status, call_duration, transcript, body, status, call_date, score_id, raw_data", { count: "exact" })
        .eq("account_id", account_id)
        .gte("call_duration", 60)
        .order("call_date", { ascending: false })
        .range(from, to);

      if (repFilterGhlIds) {
        query = query.in("assigned_user_id", repFilterGhlIds);
      } else if (assigned_user_id) {
        query = query.eq("assigned_user_id", assigned_user_id);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Attach the "other party" phone for each call (the non-rep number)
      // outbound: to is the prospect; inbound: from is the prospect
      const callsWithPhone = (data || []).map((c: any) => {
        const fromNum = c.raw_data?.from || null;
        const toNum = c.raw_data?.to || null;
        const otherParty = c.direction === "outbound" ? toNum : fromNum;
        const { raw_data: _omit, ...rest } = c;
        return { ...rest, phone: otherParty, from: fromNum, to: toNum };
      });

      const { count: totalCalls } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .gte("call_duration", 60);

      const { count: pendingCalls } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .gte("call_duration", 60)
        .eq("status", "pending");

      const { count: scoredCalls } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .gte("call_duration", 60)
        .eq("status", "scored");

      const { count: noTranscriptCalls } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .gte("call_duration", 60)
        .eq("status", "no_transcript");

      const { count: indexedCalls } = await supabaseAdmin
        .from("ghl_calls")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .gte("call_duration", 60)
        .eq("status", "indexed");

      return new Response(JSON.stringify({
        calls: callsWithPhone,
        total: totalCalls || 0,
        pending: pendingCalls || 0,
        scored: scoredCalls || 0,
        no_transcript: noTranscriptCalls || 0,
        indexed: indexedCalls || 0,
        filtered_total: count || 0,
        page: pageNumber,
        page_size: pageSize,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET SCORE FOR A CALL ────────────────────────────────────────────────
    if (action === "get-score") {
      if (!call_id) {
        return jsonResponse({ ok: false, error: "call_id required" }, 400);
      }
      const { data: call, error: callErr } = await supabaseAdmin
        .from("ghl_calls")
        .select("score_id")
        .eq("id", call_id)
        .single();
      if (callErr || !call) {
        return jsonResponse({ ok: false, error: "Call not found" }, 404);
      }
      if (!call.score_id) {
        return jsonResponse({ ok: true, score: null });
      }
      const { data: score, error: scoreErr } = await supabaseAdmin
        .from("call_scores")
        .select("*")
        .eq("id", call.score_id)
        .single();
      if (scoreErr) {
        return jsonResponse({ ok: false, error: errorMessage(scoreErr) }, 500);
      }
      return jsonResponse({ ok: true, score });
    }

    // ── LIST SCORES ─────────────────────────────────────────────────────────
    // Kept as a first-class action so older frontend bundles and demo loaders
    // never fail with "Unknown action: list-scores".
    if (action === "list-scores") {
      if (!account_id) {
        return jsonResponse({ error: "account_id required" }, 400);
      }
      const pageNumber = Math.max(Number(page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(page_size) || 500, 1), 500);
      const from = (pageNumber - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from("call_scores")
        .select("*", { count: "exact" })
        .eq("account_id", account_id)
        .order("scored_at", { ascending: false })
        .range(from, to);

      if (repFilterGhlIds) {
        query = query.in("rep_ghl_user_id", repFilterGhlIds);
      } else if (assigned_user_id) {
        query = query.eq("rep_ghl_user_id", assigned_user_id);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return jsonResponse({ scores: data || [], total: count || 0, page: pageNumber, page_size: pageSize });
    }

    if (action === "score-call") {
      if (!call_id) {
        return new Response(JSON.stringify({ error: "call_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: call, error: callErr } = await supabaseAdmin
        .from("ghl_calls")
        .select("*")
        .eq("id", call_id)
        .single();
      if (callErr || !call) throw callErr || new Error("Call not found");

      // Wallet balance gate (5¢ per scoring)
      const { data: w } = await supabaseAdmin.from("wallets").select("balance_cents").eq("account_id", call.account_id).maybeSingle();
      if (!w || w.balance_cents < 5) {
        return new Response(JSON.stringify({ ok: false, error: "insufficient_balance", message: "Wallet balance too low. Top up to continue.", balance_cents: w?.balance_cents || 0 }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Skip blocked numbers
      const fromN = normalizePhone(call.raw_data?.from);
      const toN = normalizePhone(call.raw_data?.to);
      if (fromN || toN) {
        const { data: blockedHit } = await supabaseAdmin
          .from("blocked_numbers")
          .select("id")
          .eq("account_id", call.account_id)
          .in("phone_number", [fromN, toN].filter(Boolean))
          .limit(1);
        if (blockedHit && blockedHit.length > 0) {
          return jsonResponse({ ok: false, error: "Number is blocked", status: "blocked" });
        }
      }

      if (!call.transcript || call.transcript.trim().length < 50) {
        await supabaseAdmin.from("ghl_calls").update({ status: "no_transcript" }).eq("id", call_id);
        return jsonResponse({ ok: false, error: "Call has no usable transcript", status: "no_transcript" });
      }

      // Get contact name for the score record
      let sellerName = "Unknown";
      if (call.contact_id) {
        const { data: contact } = await supabaseAdmin
          .from("ghl_contacts")
          .select("name")
          .eq("ghl_contact_id", call.contact_id)
          .eq("account_id", call.account_id)
          .single();
        if (contact?.name) sellerName = contact.name;
      }

      // Get rep name
      let repName = "Unknown";
      if (call.assigned_user_id) {
        const { data: user } = await supabaseAdmin
          .from("ghl_users")
          .select("name")
          .eq("ghl_user_id", call.assigned_user_id)
          .eq("account_id", call.account_id)
          .single();
        if (user?.name) repName = user.name;
      }

      // Call AI for scoring
      const scoringPrompt = `You are ACQ Coach AI for real estate wholesalers. Analyze this acquisition call transcript.

Detect: sellerType (probate/inherited/pre-foreclosure/tired-landlord/divorce/absentee-owner/cold-unknown), callType (first-contact/follow-up/re-engagement/offer-presentation), and estimate talk ratios.

Score 0-10 each category: Introduction and Positioning, Rapport Building, Motivation Discovery, Timeline Discovery, Financial Discovery, Offer Presentation, Objection Handling, First No Recovery, Next Step Close.

Status per category: strong (8-10), ok (6-7.9), weak (4-5.9), critical (0-3.9).

Coaching rules: seller should talk 60%+, never give price before situation discovery, end with specific next step time.

Respond ONLY valid JSON, no markdown:
{"detected":{"sellerType":"string","sellerTypeLabel":"string","callType":"string","callTypeLabel":"string","sellerTalkRatio":"string","repTalkRatio":"string"},"score":{"overall":0,"grade":"string","categories":[{"name":"string","score":0,"status":"string","oneliner":"string"}]},"verdict":"string","moments":[{"category":"string","status":"string","what":"string","why":"string","rewrite":"string"}],"strengths":["string"]}`;

      const openaiKey = Deno.env.get("OPENAI_API_KEY");

      if (!openaiKey) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let aiResult: any = null;
      const usedProvider = "openai";
      const usedModel = "gpt-5.4-mini";
      let tokensIn = 0;
      let tokensOut = 0;

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: usedModel,
            messages: [
              { role: "system", content: scoringPrompt },
              { role: "user", content: call.transcript },
            ],
            max_completion_tokens: 3000,
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          aiResult = JSON.parse(cleaned);
          tokensIn = data.usage?.prompt_tokens || 0;
          tokensOut = data.usage?.completion_tokens || 0;
        } else {
          const t = await res.text();
          console.error("OpenAI scoring failed:", res.status, t);
        }
      } catch (e) {
        console.error("OpenAI scoring error:", e);
      }

      if (!aiResult) {
        await supabaseAdmin.from("ghl_calls").update({ status: "failed" }).eq("id", call_id);
        return new Response(JSON.stringify({ error: "AI scoring failed" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save to call_scores
      const detected = aiResult.detected || {};
      const score = aiResult.score || {};
      const repTalk = integerPercent(detected.repTalkRatio, 50);
      const sellerTalk = integerPercent(detected.sellerTalkRatio, 50);
      const categoryScores = Array.isArray(score.categories)
        ? score.categories.map((category: Record<string, unknown>) => ({
            ...category,
            score: Math.max(0, Math.min(10, firstNumber(category.score, 0))),
          }))
        : [];

      const { data: scoreRecord, error: scoreErr } = await supabaseAdmin
        .from("call_scores")
        .insert({
          account_id: call.account_id,
          rep_ghl_user_id: call.assigned_user_id,
          rep_name: repName,
          seller_name: sellerName,
          seller_type: detected.sellerType || "unknown",
          call_type: detected.callType || "first-contact",
          overall_score: normalizedOverallScore(score.overall),
          grade: score.grade || "F",
          category_scores: categoryScores,
          moments: aiResult.moments || [],
          strengths: aiResult.strengths || [],
          verdict: aiResult.verdict || null,
          rep_talk_ratio: repTalk,
          seller_talk_ratio: sellerTalk,
          transcript: call.transcript,
          duration: call.call_duration ? `${Math.floor(call.call_duration / 60)}m ${call.call_duration % 60}s` : null,
          scored_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (scoreErr) {
        console.error("Score insert error:", scoreErr);
        await supabaseAdmin.from("ghl_calls").update({ status: "failed" }).eq("id", call_id);
        return jsonResponse({ ok: false, error: "Score insert failed", detail: errorMessage(scoreErr), status: "failed" });
      }

      // Update call status
      await supabaseAdmin.from("ghl_calls").update({
        status: "scored",
        score_id: scoreRecord.id,
      }).eq("id", call_id);

      // ── Cost tracking: provider rates × per-customer markup
      const scoreRules = await loadBillingRules(supabaseAdmin, call.account_id);
      const providerCostCents = gptCost(tokensIn, tokensOut, scoreRules);
      const billedCents = billCents(providerCostCents, scoreRules);
      try {
        await supabaseAdmin.rpc("debit_wallet", {
          _account_id: call.account_id,
          _amount_cents: billedCents,
          _reason: "Call scoring",
          _metadata: { call_id, score_id: scoreRecord.id, provider: usedProvider, model: usedModel, markup: scoreRules.markup },
        });
      } catch (e) { console.log("debit_wallet (score) failed:", e); }
      try {
        await supabaseAdmin.from("usage_events").insert({
          account_id: call.account_id,
          operation: "scoring",
          provider: usedProvider,
          model: usedModel,
          call_id,
          ghl_message_id: call.ghl_message_id,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          provider_cost_cents: providerCostCents,
          billed_cents: billedCents,
          
          markup_multiplier: scoreRules.markup,
          status: "success",
          metadata: { score_id: scoreRecord.id, source: "manual-score" },
        });
      } catch (e) { console.log("usage_events (score) failed:", e); }


      return new Response(JSON.stringify({
        ok: true,
        score: scoreRecord,
        ai_result: aiResult,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FETCH CONVERSATIONS (batched, all messages saved to DB) ─────────────
    if (action === "fetch-conversations") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account, error: accErr } = await supabaseAdmin
        .from("ghl_accounts")
        .select("api_key, location_id")
        .eq("id", account_id)
        .single();
      if (accErr || !account) throw accErr || new Error("Account not found");

      const ghlHeaders = {
        Authorization: `Bearer ${account.api_key}`,
        Version: "2021-04-15",
        Accept: "application/json",
      };

      // Location-level search sorted by last_message_date DESC, filtered to
      // CALL conversations. This is the only viable strategy at scale: a
      // per-contact loop would scan thousands of stale contacts before
      // finding recent calls. We page through the location feed, stop once
      // lastMessageDate falls outside the 10-day window, then fetch CALL
      // messages per conversation.
      const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
      const cutoffMs = Date.now() - TEN_DAYS_MS;
      const startedAt = Date.now();
      const TIME_BUDGET_MS = 110_000;

      // batch_offset here = the lastMessageDate cursor (ms). 0 = start fresh.
      const cursorMs = Number(batch_offset) || 0;
      const pageLimit = 100;

      let conversationsScanned = 0;
      let conversationsSaved = 0;
      let messagesSaved = 0;
      let callMessagesFound = 0;
      let budgetExhausted = false;
      let reachedCutoff = false;
      let lastSeenMs = cursorMs || Date.now();
      let pagesFetched = 0;
      const MAX_PAGES_PER_BATCH = 4;

      console.log(`[fetch-conversations] Location scan loc=${account.location_id} cursorMs=${cursorMs} cutoffMs=${cutoffMs}`);

      // Build a Set of known contact ids so we can populate assigned_user_id from our DB
      const { data: knownContacts } = await supabaseAdmin
        .from("ghl_contacts")
        .select("ghl_contact_id, assigned_user_id")
        .eq("account_id", account_id);
      const contactAssignMap = new Map<string, string | null>();
      for (const c of (knownContacts || [])) contactAssignMap.set(c.ghl_contact_id, c.assigned_user_id);

      while (pagesFetched < MAX_PAGES_PER_BATCH) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetExhausted = true; break; }

        const params = new URLSearchParams({
          locationId: account.location_id,
          lastMessageType: "TYPE_CALL",
          sort: "desc",
          sortBy: "last_message_date",
          limit: String(pageLimit),
        });
        // GHL conversation search uses startAfterDate for cursor pagination.
        // `endAt` is ignored by this endpoint, which made the UI keep fetching
        // the same first call page over and over.
        if (cursorMs > 0 || pagesFetched > 0) {
          params.set("startAfterDate", String(lastSeenMs));
        }

        const convUrl = `https://services.leadconnectorhq.com/conversations/search?${params.toString()}`;
        let convData: any = null;
        try {
          const convRes = await fetch(convUrl, { headers: ghlHeaders });
          if (!convRes.ok) {
            const txt = await convRes.text();
            console.log(`[fetch-conversations] conv search failed ${convRes.status}: ${txt.slice(0, 200)}`);
            break;
          }
          convData = await convRes.json();
        } catch (e) {
          console.log(`[fetch-conversations] conv search threw:`, errorMessage(e));
          break;
        }

        const conversations: any[] = convData?.conversations || [];
        pagesFetched++;
        if (conversations.length === 0) break;

        for (const conv of conversations) {
          conversationsScanned++;
          const lastMs = conv.lastMessageDate ? new Date(conv.lastMessageDate).getTime() : 0;
          if (lastMs && lastMs < lastSeenMs) lastSeenMs = lastMs;

          if (lastMs && lastMs < cutoffMs) {
            reachedCutoff = true;
            continue;
          }

          if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetExhausted = true; break; }

          let messages: any[] = [];
          try {
            const msgUrl = `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?type=TYPE_CALL&limit=100`;
            const msgRes = await fetch(msgUrl, { headers: ghlHeaders });
            if (!msgRes.ok) continue;
            const msgData = await msgRes.json();
            const all = (msgData.messages?.messages || msgData.messages || []);
            messages = Array.isArray(all)
              ? all.filter((msg: any) => {
                  const ms = msg.dateAdded ? new Date(msg.dateAdded).getTime() : 0;
                  return ms >= cutoffMs;
                })
              : [];
          } catch { continue; }

          if (messages.length === 0) continue;

          const convRow = {
            account_id,
            ghl_conversation_id: conv.id,
            contact_id: conv.contactId || null,
            assigned_user_id: conv.assignedTo || contactAssignMap.get(conv.contactId) || null,
            last_message_body: conv.lastMessageBody || null,
            last_message_type: conv.lastMessageType || null,
            last_message_date: conv.lastMessageDate ? new Date(conv.lastMessageDate).toISOString() : null,
            unread_count: conv.unreadCount || 0,
            type: conv.type || null,
            raw_data: conv,
          };
          const { error: convUpsertErr } = await supabaseAdmin
            .from("ghl_conversations")
            .upsert([convRow], { onConflict: "account_id,ghl_conversation_id" });
          if (convUpsertErr) { console.log(`[fetch-conversations] Conv upsert error:`, convUpsertErr); continue; }
          conversationsSaved += 1;

          const msgRows = messages.map((msg: any) => {
            const msgType = msg.messageType || msg.type || "TYPE_CALL";
            const isCall = typeof msgType === "string" && msgType.toUpperCase().includes("CALL");
            if (isCall) callMessagesFound++;
            return {
              account_id,
              conversation_id: conv.id,
              ghl_message_id: msg.id,
              contact_id: conv.contactId || null,
              user_id: msg.userId || null,
              message_type: msgType,
              direction: msg.direction || null,
              status: msg.status || null,
              body: msg.body || null,
              call_duration: msg.meta?.call?.duration ?? msg.meta?.callDuration ?? null,
              call_status: msg.meta?.call?.status ?? msg.meta?.callStatus ?? null,
              recording_url: msg.meta?.call?.recordingUrl ?? null,
              transcript: null,
              message_date: msg.dateAdded ? new Date(msg.dateAdded).toISOString() : null,
              raw_data: msg,
            };
          });

          for (let k = 0; k < msgRows.length; k += 50) {
            const chunk = msgRows.slice(k, k + 50);
            const { error: msgUpsertErr } = await supabaseAdmin
              .from("ghl_messages")
              .upsert(chunk, { onConflict: "account_id,ghl_message_id" });
            if (msgUpsertErr) { console.log(`[fetch-conversations] Msg upsert error:`, msgUpsertErr); }
            else { messagesSaved += chunk.length; }
          }
        }

        if (reachedCutoff || budgetExhausted) break;
      }

      const hasMore = !reachedCutoff && (budgetExhausted || pagesFetched >= MAX_PAGES_PER_BATCH);

      const { count: storedConvCount } = await supabaseAdmin
        .from("ghl_conversations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);

      const { count: storedMsgCount } = await supabaseAdmin
        .from("ghl_messages")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);

      const { count: storedCallCount } = await supabaseAdmin
        .from("ghl_messages")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .ilike("message_type", "%CALL%");

      console.log(`[fetch-conversations] Done: pages=${pagesFetched} scanned=${conversationsScanned} convs_saved=${conversationsSaved} msgs=${messagesSaved} calls=${callMessagesFound} hasMore=${hasMore} reachedCutoff=${reachedCutoff} nextCursor=${lastSeenMs}`);

      return jsonResponse({
        ok: true,
        contacts_processed: 0,
        total_contacts: 0,
        conversations_scanned: conversationsScanned,
        conversations_saved: conversationsSaved,
        messages_saved: messagesSaved,
        call_messages_found: callMessagesFound,
        stored_conversations: storedConvCount || 0,
        stored_messages: storedMsgCount || 0,
        stored_call_messages: storedCallCount || 0,
        batch_offset: lastSeenMs,
        has_more: hasMore,
        next_offset: lastSeenMs,
        cutoff_ms: cutoffMs,
        reached_cutoff: reachedCutoff,
      });
    }

    // ── LIST CONVERSATIONS ──────────────────────────────────────────────────
    if (action === "list-conversations") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pageNumber = Math.max(Number(page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(page_size) || 50, 1), 100);
      const from = (pageNumber - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from("ghl_conversations")
        .select("id, ghl_conversation_id, contact_id, assigned_user_id, last_message_body, last_message_type, last_message_date, unread_count, type", { count: "exact" })
        .eq("account_id", account_id)
        .order("last_message_date", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (contact_id) query = query.eq("contact_id", contact_id);
      if (assigned_user_id) query = query.eq("assigned_user_id", assigned_user_id);

      const { data, error, count } = await query;
      if (error) throw error;

      const { count: totalConvs } = await supabaseAdmin
        .from("ghl_conversations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);

      const { count: totalMsgs } = await supabaseAdmin
        .from("ghl_messages")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id);

      const { count: totalCalls } = await supabaseAdmin
        .from("ghl_messages")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account_id)
        .ilike("message_type", "%CALL%");

      return new Response(JSON.stringify({
        conversations: data,
        total: totalConvs || 0,
        total_messages: totalMsgs || 0,
        total_calls: totalCalls || 0,
        filtered_total: count || 0,
        page: pageNumber,
        page_size: pageSize,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST MESSAGES (for a conversation or contact) ───────────────────────
    if (action === "list-messages") {
      if (!account_id) {
        return new Response(JSON.stringify({ error: "account_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let query = supabaseAdmin
        .from("ghl_messages")
        .select("id, ghl_message_id, conversation_id, contact_id, user_id, message_type, direction, status, body, call_duration, call_status, recording_url, transcript, message_date")
        .eq("account_id", account_id)
        .order("message_date", { ascending: false, nullsFirst: false })
        .limit(500);

      if (conversation_id) query = query.eq("conversation_id", conversation_id);
      if (contact_id) query = query.eq("contact_id", contact_id);

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ messages: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-ghl-user-role") {
      const ghlUserId = (body as any).ghl_user_id;
      const newRole = (body as any).role;
      if (!account_id || !ghlUserId || !newRole) {
        return jsonResponse({ error: "account_id, ghl_user_id, role required" }, 400);
      }
      const { error } = await supabaseAdmin.from("ghl_users")
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq("account_id", account_id).eq("ghl_user_id", ghlUserId);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    const message = errorMessage(err);
    console.error("ghl-proxy error:", message, err);
    return jsonResponse({ ok: false, error: message, status: "failed" }, 200);
  }
});
