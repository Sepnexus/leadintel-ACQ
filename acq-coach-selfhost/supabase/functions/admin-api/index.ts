import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const SUPER_ADMIN_BOOTSTRAP_EMAIL = "akshay@sepnexus.com";

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = u.user.id;
    const callerEmail = (u.user.email || "").toLowerCase();

    if (callerEmail === SUPER_ADMIN_BOOTSTRAP_EMAIL) {
      const { data: existing } = await admin.from("user_roles")
        .select("id").eq("user_id", callerId).eq("role", "super_admin").maybeSingle();
      if (!existing) {
        await admin.from("user_roles").insert({ user_id: callerId, role: "super_admin", account_id: null });
      }
    }

    const { data: roles } = await admin.from("user_roles").select("role, account_id").eq("user_id", callerId);
    const isSuper = !!roles?.some(r => r.role === "super_admin");
    const adminAccs = new Set((roles || []).filter(r => r.role === "account_admin").map(r => r.account_id));

    const body = await req.json();
    const { action } = body;

    // ════════════════════════════ CUSTOMERS ════════════════════════════

    if (action === "list-customers" || action === "list-tenants") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { search = "", balance_filter = "all", limit = 200, offset = 0 } = body as any;
      let aq = admin.from("ghl_accounts")
        .select("id, name, location_id, company_id, integrated_at, is_active, created_at", { count: "exact" })
        .order("created_at", { ascending: false });
      if (search) aq = aq.or(`name.ilike.%${search}%,location_id.ilike.%${search}%`);
      const { data: accounts, count: totalCount } = await aq.range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 200) - 1);
      const ids = (accounts || []).map(a => a.id);
      let admins: Record<string, any[]> = {};
      let repCounts: Record<string, number> = {};
      let wallets: Record<string, number> = {};
      if (ids.length) {
        const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const usersById = new Map(usersResp.data.users.map(x => [x.id, x]));
        const { data: ur } = await admin.from("user_roles")
          .select("user_id, account_id, role").in("account_id", ids);
        for (const r of ur || []) {
          if (r.role === "account_admin") {
            const us = usersById.get(r.user_id);
            if (us) (admins[r.account_id] ||= []).push({ id: us.id, email: us.email });
          } else if (r.role === "rep") {
            repCounts[r.account_id] = (repCounts[r.account_id] || 0) + 1;
          }
        }
        const { data: ws } = await admin.from("wallets").select("account_id, balance_cents").in("account_id", ids);
        for (const w of ws || []) wallets[w.account_id] = w.balance_cents;
      }
      let result = (accounts || []).map(a => ({
        ...a,
        admins: admins[a.id] || [],
        rep_count: repCounts[a.id] || 0,
        balance_cents: wallets[a.id] || 0,
      }));
      if (balance_filter === "empty") result = result.filter(c => c.balance_cents <= 0);
      else if (balance_filter === "low") result = result.filter(c => c.balance_cents > 0 && c.balance_cents < 500);
      else if (balance_filter === "ok") result = result.filter(c => c.balance_cents >= 500);
      return json({ accounts: result, total: totalCount || result.length });
    }

    if (action === "create-customer" || action === "create-tenant") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { name, api_key, location_id, company_id, admin_email, admin_password, is_test } = body;
      if (!name || !api_key || !location_id || !company_id || !admin_email || !admin_password) {
        return json({ error: "All fields required" }, 400);
      }
      const { data: acc, error: accErr } = await admin.from("ghl_accounts")
        .insert({ name, api_key, location_id, company_id, is_test: !!is_test }).select().single();
      if (accErr) throw accErr;
      let adminUserId: string;
      const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing.data.users.find(x => (x.email || "").toLowerCase() === admin_email.toLowerCase());
      if (found) adminUserId = found.id;
      else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: admin_email, password: admin_password, email_confirm: true,
          user_metadata: { full_name: admin_email.split("@")[0] },
        });
        if (cErr) throw cErr;
        adminUserId = created.user!.id;
      }
      await admin.from("user_roles").insert({ user_id: adminUserId, role: "account_admin", account_id: acc.id });
      await admin.from("profiles").upsert({ id: adminUserId, account_id: acc.id, created_by: callerId });
      // Initialize wallet & billing settings
      await admin.from("wallets").insert({ account_id: acc.id, balance_cents: 0 });
      await admin.from("billing_settings").insert({ account_id: acc.id });
      return json({ account: acc, admin_user_id: adminUserId });
    }

    if (action === "update-customer") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { account_id, name, location_id, company_id, api_key, is_active, demo_mode } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);

      // Detect demo_mode transition so we can seed/unseed sample data.
      let prevDemo: boolean | null = null;
      if (typeof demo_mode === "boolean") {
        const { data: prev } = await admin.from("ghl_accounts").select("demo_mode").eq("id", account_id).maybeSingle();
        prevDemo = !!prev?.demo_mode;
      }

      const patch: any = {};
      if (name !== undefined) patch.name = name;
      if (location_id !== undefined) patch.location_id = location_id;
      if (company_id !== undefined) patch.company_id = company_id;
      if (api_key) patch.api_key = api_key;
      if (typeof is_active === "boolean") patch.is_active = is_active;
      if (typeof demo_mode === "boolean") patch.demo_mode = demo_mode;
      const { error } = await admin.from("ghl_accounts").update(patch).eq("id", account_id);
      if (error) throw error;

      // Seed/unseed sample dataset on demo_mode toggle
      if (typeof demo_mode === "boolean" && demo_mode !== prevDemo) {
        if (demo_mode) {
          const { error: seedErr } = await admin.rpc("seed_demo_data", { _account_id: account_id });
          if (seedErr) console.error("seed_demo_data failed", seedErr);
        } else {
          const { error: unseedErr } = await admin.rpc("unseed_demo_data", { _account_id: account_id });
          if (unseedErr) console.error("unseed_demo_data failed", unseedErr);
        }
      }

      return json({ ok: true });
    }

    if (action === "delete-customer") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { account_id } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);
      const { error } = await admin.from("ghl_accounts").delete().eq("id", account_id);
      if (error) throw error;
      return json({ ok: true });
    }

    // ════════════════════════════ TEAM (within a customer) ════════════════════════════

    if (action === "list-team") {
      const { account_id } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      const { data: ur } = await admin.from("user_roles")
        .select("user_id, role, created_at").eq("account_id", account_id).order("created_at");
      const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const usersById = new Map(usersResp.data.users.map(x => [x.id, x]));
      const { data: assigns } = await admin.from("rep_assignments")
        .select("user_id, ghl_user_id").eq("account_id", account_id);
      const assignsByUser: Record<string, string[]> = {};
      for (const a of assigns || []) (assignsByUser[a.user_id] ||= []).push(a.ghl_user_id);
      return json({
        team: (ur || []).map(r => {
          const us = usersById.get(r.user_id);
          return {
            user_id: r.user_id, email: us?.email || null, role: r.role,
            ghl_user_ids: assignsByUser[r.user_id] || [],
            created_at: r.created_at,
          };
        }),
      });
    }

    // Combined add-team-member: pass either { existing_user_id } OR { email, password }.
    // role: "rep" | "account_admin". For rep, optional ghl_user_id assigns immediately.
    if (action === "add-team-member") {
      const { account_id, role, existing_user_id, email, password, ghl_user_id } = body;
      if (!account_id || !role) return json({ error: "account_id and role required" }, 400);
      if (!["rep", "account_admin"].includes(role)) return json({ error: "Invalid role" }, 400);
      if (role === "account_admin" && !isSuper) return json({ error: "Forbidden — only super admin can add admins" }, 403);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);

      let userId: string;
      if (existing_user_id) {
        userId = existing_user_id;
      } else {
        if (!email || !password) return json({ error: "email and password required for new user" }, 400);
        const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = existing.data.users.find(x => (x.email || "").toLowerCase() === email.toLowerCase());
        if (found) {
          userId = found.id;
        } else {
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email, password, email_confirm: true,
            user_metadata: { full_name: email.split("@")[0] },
          });
          if (cErr) throw cErr;
          userId = created.user!.id;
        }
      }
      await admin.from("user_roles").upsert({ user_id: userId, role, account_id }, { onConflict: "user_id,role,account_id" });
      await admin.from("profiles").upsert({ id: userId, account_id, created_by: callerId });
      if (role === "rep" && ghl_user_id) {
        await admin.from("rep_assignments").upsert({ user_id: userId, account_id, ghl_user_id }, { onConflict: "account_id,ghl_user_id" });
      }
      return json({ ok: true, user_id: userId });
    }

    // Legacy aliases — unchanged behavior
    if (action === "create-rep" || action === "create-account-admin") {
      const role = action === "create-rep" ? "rep" : "account_admin";
      const { account_id, email, password, ghl_user_id } = body;
      if (!account_id || !email || !password) return json({ error: "account_id, email, password required" }, 400);
      if (role === "account_admin" && !isSuper) return json({ error: "Forbidden" }, 403);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing.data.users.find(x => (x.email || "").toLowerCase() === email.toLowerCase());
      let userId: string;
      if (found) userId = found.id;
      else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: email.split("@")[0] },
        });
        if (cErr) throw cErr;
        userId = created.user!.id;
      }
      await admin.from("user_roles").upsert({ user_id: userId, role, account_id }, { onConflict: "user_id,role,account_id" });
      await admin.from("profiles").upsert({ id: userId, account_id, created_by: callerId });
      if (role === "rep" && ghl_user_id) {
        await admin.from("rep_assignments").upsert({ user_id: userId, account_id, ghl_user_id }, { onConflict: "account_id,ghl_user_id" });
      }
      return json({ ok: true, user_id: userId });
    }

    // Lightweight directory of every auth user (super only) — used by add-team-member picker.
    if (action === "list-existing-users") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      return json({
        users: usersResp.data.users
          .map(u => ({ id: u.id, email: u.email || "", created_at: u.created_at }))
          .sort((a, b) => a.email.localeCompare(b.email)),
      });
    }

    if (action === "set-rep-assignment") {
      const { account_id, user_id, ghl_user_ids } = body;
      if (!account_id || !user_id || !Array.isArray(ghl_user_ids)) return json({ error: "bad request" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      await admin.from("rep_assignments").delete().eq("user_id", user_id).eq("account_id", account_id);
      if (ghl_user_ids.length) {
        await admin.from("rep_assignments").insert(ghl_user_ids.map((g: string) => ({ user_id, account_id, ghl_user_id: g })));
      }
      return json({ ok: true });
    }

    if (action === "remove-team-member") {
      const { account_id, user_id } = body;
      if (!account_id || !user_id) return json({ error: "bad request" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      await admin.from("rep_assignments").delete().eq("user_id", user_id).eq("account_id", account_id);
      await admin.from("user_roles").delete().eq("user_id", user_id).eq("account_id", account_id);
      return json({ ok: true });
    }

    if (action === "reset-user-password") {
      const { user_id, new_password, account_id } = body;
      if (!user_id || !new_password || new_password.length < 6) return json({ error: "user_id and 6+ char password required" }, 400);
      if (!isSuper) {
        if (!account_id || !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
        // Verify the target user is in this admin's account
        const { data: rcheck } = await admin.from("user_roles").select("user_id").eq("account_id", account_id).eq("user_id", user_id).maybeSingle();
        if (!rcheck) return json({ error: "Forbidden" }, 403);
      }
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) throw error;
      return json({ ok: true });
    }

    // ════════════════════════════ USERS (across all customers — super only) ════════════════════════════

    if (action === "list-all-users") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const { data: ur } = await admin.from("user_roles").select("user_id, role, account_id, created_at");
      const { data: accs } = await admin.from("ghl_accounts").select("id, name");
      const accsById = new Map((accs || []).map(a => [a.id, a]));
      const rolesByUser: Record<string, any[]> = {};
      for (const r of ur || []) (rolesByUser[r.user_id] ||= []).push({ role: r.role, account_id: r.account_id, account_name: r.account_id ? accsById.get(r.account_id)?.name : null, created_at: r.created_at });
      const users = usersResp.data.users
        .map(u => ({
          id: u.id, email: u.email, created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          roles: rolesByUser[u.id] || [],
        }))
        .filter(u => u.roles.length > 0)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return json({ users });
    }

    // ════════════════════════════ BILLING ════════════════════════════

    if (action === "get-billing") {
      const { account_id } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      const { data: w } = await admin.from("wallets").select("balance_cents, updated_at").eq("account_id", account_id).maybeSingle();
      const { data: s } = await admin.from("billing_settings").select("*").eq("account_id", account_id).maybeSingle();
      const { data: txs } = await admin.from("wallet_transactions").select("*").eq("account_id", account_id).order("created_at", { ascending: false }).limit(50);
      return json({
        wallet: w || { balance_cents: 0, updated_at: null },
        settings: s || { auto_recharge_enabled: false, threshold_cents: 500, topup_amount_cents: 2000 },
        transactions: txs || [],
      });
    }

    if (action === "save-billing-settings") {
      const { account_id, auto_recharge_enabled, threshold_cents, topup_amount_cents, markup_multiplier, min_call_seconds_for_ai } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      const patch: any = { account_id, updated_at: new Date().toISOString() };
      if (typeof auto_recharge_enabled === "boolean") patch.auto_recharge_enabled = auto_recharge_enabled;
      if (typeof threshold_cents === "number") patch.threshold_cents = Math.max(100, threshold_cents);
      if (typeof topup_amount_cents === "number") patch.topup_amount_cents = Math.max(500, topup_amount_cents);
      // Per-customer overrides — super-admin only (commercial knobs)
      if (isSuper) {
        if (markup_multiplier === null) patch.markup_multiplier = null;
        else if (typeof markup_multiplier === "number" && markup_multiplier > 0) patch.markup_multiplier = markup_multiplier;
        if (min_call_seconds_for_ai === null) patch.min_call_seconds_for_ai = null;
        else if (typeof min_call_seconds_for_ai === "number" && min_call_seconds_for_ai >= 0) patch.min_call_seconds_for_ai = Math.floor(min_call_seconds_for_ai);
      }
      const { error } = await admin.from("billing_settings").upsert(patch, { onConflict: "account_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "remove-saved-card") {
      const { account_id, environment } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      const { data: bs } = await admin.from("billing_settings").select("default_payment_method_id").eq("account_id", account_id).maybeSingle();
      const pmId = bs?.default_payment_method_id;
      if (pmId) {
        try {
          const env: StripeEnv = environment === "live" ? "live" : "sandbox";
          const stripe = createStripeClient(env);
          await stripe.paymentMethods.detach(pmId);
        } catch (e) {
          console.warn("[remove-saved-card] detach warning:", e instanceof Error ? e.message : e);
        }
      }
      const { error } = await admin.from("billing_settings").update({
        default_payment_method_id: null,
        card_brand: null,
        card_last4: null,
        card_exp_month: null,
        card_exp_year: null,
        auto_recharge_enabled: false,
        updated_at: new Date().toISOString(),
      }).eq("account_id", account_id);
      if (error) throw error;
      return json({ ok: true });
    }

    // Global app-wide pricing/markup/threshold defaults — super only.
    if (action === "get-app-settings") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { data } = await admin.from("app_settings").select("*").eq("id", true).maybeSingle();
      return json({ settings: data });
    }
    if (action === "save-app-settings") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const allowed = [
        "default_markup_multiplier", "default_min_call_seconds_for_ai",
        "whisper_cents_per_minute",
        "openai_input_cents_per_1k", "openai_output_cents_per_1k",
      ];
      const patch: any = { id: true, updated_at: new Date().toISOString() };
      for (const k of allowed) if (typeof body[k] === "number") patch[k] = body[k];
      const { error } = await admin.from("app_settings").upsert(patch, { onConflict: "id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "manual-credit") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { account_id, amount_cents, reason, type = "adjustment", payment_method, reference } = body;
      if (!account_id || typeof amount_cents !== "number" || amount_cents === 0) return json({ error: "account_id and non-zero amount_cents required" }, 400);
      const meta: Record<string, unknown> = { actor: callerEmail };
      if (payment_method) meta.payment_method = payment_method;
      if (reference) meta.reference = reference;
      const { data, error } = await admin.rpc("credit_wallet", {
        _account_id: account_id,
        _amount_cents: amount_cents,
        _reason: reason || (amount_cents > 0 ? "Manual credit" : "Manual debit"),
        _stripe_session_id: null,
        _metadata: meta,
        _type: type,
      });
      if (error) throw error;
      return json(data);
    }

    if (action === "list-all-transactions") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { limit = 100, offset = 0, search = "", type_filter = "all", since_days } = body as any;
      let q = admin.from("wallet_transactions")
        .select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (type_filter && type_filter !== "all") q = q.eq("type", type_filter);
      if (typeof since_days === "number" && since_days > 0) {
        q = q.gte("created_at", new Date(Date.now() - since_days * 86400000).toISOString());
      }
      if (search) q = q.ilike("reason", `%${search}%`);
      const lim = Math.min(Number(limit) || 100, 500);
      const off = Math.max(0, Number(offset) || 0);
      const { data: txs, count: total } = await q.range(off, off + lim - 1);
      const { data: accs } = await admin.from("ghl_accounts").select("id, name");
      const accsById = new Map((accs || []).map(a => [a.id, a.name]));
      return json({
        transactions: (txs || []).map(t => ({ ...t, account_name: accsById.get(t.account_id) || t.account_id.slice(0, 8) })),
        total: total || 0,
      });
    }

    // ════════════════════════════ COST TRACKING ════════════════════════════

    if (action === "cost-summary") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { since_days = 30 } = body;
      const sinceIso = new Date(Date.now() - Math.max(1, Number(since_days) || 30) * 86400000).toISOString();
      const { data: events } = await admin.from("usage_events")
        .select("account_id, operation, provider, audio_seconds, tokens_in, tokens_out, provider_cost_cents, billed_cents, created_at")
        .gte("created_at", sinceIso);
      const { data: accs } = await admin.from("ghl_accounts").select("id, name");
      const accsById = new Map((accs || []).map(a => [a.id, a.name]));
      // Aggregate per-account
      const byAcct: Record<string, any> = {};
      let totals = { events: 0, transcriptions: 0, scorings: 0, audio_seconds: 0, tokens_in: 0, tokens_out: 0, provider_cost_cents: 0, billed_cents: 0 };
      for (const e of events || []) {
        const a = (byAcct[e.account_id] ||= { account_id: e.account_id, account_name: accsById.get(e.account_id) || e.account_id.slice(0,8), events: 0, transcriptions: 0, scorings: 0, audio_seconds: 0, tokens_in: 0, tokens_out: 0, provider_cost_cents: 0, billed_cents: 0 });
        a.events++; totals.events++;
        if (e.operation === "transcription") { a.transcriptions++; totals.transcriptions++; }
        if (e.operation === "scoring") { a.scorings++; totals.scorings++; }
        a.audio_seconds += e.audio_seconds || 0; totals.audio_seconds += e.audio_seconds || 0;
        a.tokens_in += e.tokens_in || 0; totals.tokens_in += e.tokens_in || 0;
        a.tokens_out += e.tokens_out || 0; totals.tokens_out += e.tokens_out || 0;
        a.provider_cost_cents += Number(e.provider_cost_cents) || 0; totals.provider_cost_cents += Number(e.provider_cost_cents) || 0;
        a.billed_cents += e.billed_cents || 0; totals.billed_cents += e.billed_cents || 0;
      }
      // Aggregate per-provider
      const byProvider: Record<string, any> = {};
      for (const e of events || []) {
        const p = (byProvider[e.provider] ||= { provider: e.provider, events: 0, provider_cost_cents: 0, billed_cents: 0 });
        p.events++;
        p.provider_cost_cents += Number(e.provider_cost_cents) || 0;
        p.billed_cents += e.billed_cents || 0;
      }
      return json({
        since: sinceIso,
        totals: { ...totals, margin_cents: totals.billed_cents - totals.provider_cost_cents },
        by_account: Object.values(byAcct).map((a: any) => ({ ...a, margin_cents: a.billed_cents - a.provider_cost_cents })).sort((a: any, b: any) => b.billed_cents - a.billed_cents),
        by_provider: Object.values(byProvider).map((p: any) => ({ ...p, margin_cents: p.billed_cents - p.provider_cost_cents })),
      });
    }

    if (action === "cost-events") {
      const { account_id: aid, limit = 100, offset = 0, operation_filter = "all", status_filter = "all" } = body as any;
      let q = admin.from("usage_events").select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (aid) {
        if (!isSuper && !adminAccs.has(aid)) return json({ error: "Forbidden" }, 403);
        q = q.eq("account_id", aid);
      } else if (!isSuper) {
        if (adminAccs.size === 0) return json({ events: [], total: 0 });
        q = q.in("account_id", Array.from(adminAccs) as string[]);
      }
      if (operation_filter && operation_filter !== "all") q = q.eq("operation", operation_filter);
      if (status_filter && status_filter !== "all") q = q.eq("status", status_filter);
      const lim = Math.min(Number(limit) || 100, 500);
      const off = Math.max(0, Number(offset) || 0);
      const { data: events, count: total } = await q.range(off, off + lim - 1);
      const { data: accs } = await admin.from("ghl_accounts").select("id, name");
      const accsById = new Map((accs || []).map(a => [a.id, a.name]));
      return json({ events: (events || []).map(e => ({ ...e, account_name: accsById.get(e.account_id) || e.account_id.slice(0,8) })), total: total || 0 });
    }

    // ════════════════════════════ SYNC ════════════════════════════

    if (action === "list-sync-runs") {
      const { account_id, limit = 20, offset = 0, status_filter = "all", since_days } = body as any;
      let q = admin.from("sync_runs").select("*", { count: "exact" }).order("started_at", { ascending: false });
      if (account_id) {
        if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
        q = q.eq("account_id", account_id);
      } else {
        if (!isSuper) {
          if (adminAccs.size === 0) return json({ runs: [], total: 0 });
          q = q.in("account_id", Array.from(adminAccs) as string[]);
        }
      }
      if (status_filter && status_filter !== "all") q = q.eq("status", status_filter);
      if (typeof since_days === "number" && since_days > 0) {
        q = q.gte("started_at", new Date(Date.now() - since_days * 86400000).toISOString());
      }
      const lim = Math.min(Number(limit) || 20, 200);
      const off = Math.max(0, Number(offset) || 0);
      const { data: runs, count: total, error: rErr } = await q.range(off, off + lim - 1);
      if (rErr) throw rErr;
      const { data: states } = await admin.from("sync_state").select("*");
      return json({ runs: runs || [], states: states || [], total: total || 0 });
    }

    if (action === "trigger-sync") {
      const { account_id, backfill_seconds } = body;
      if (account_id && !isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      if (!account_id && !isSuper) return json({ error: "Forbidden" }, 403);
      // Block sync for inactive customers
      if (account_id) {
        const { data: acc } = await admin.from("ghl_accounts").select("is_active, demo_mode, name").eq("id", account_id).maybeSingle();
        if (!acc) return json({ error: "Customer not found" }, 404);
        if (!acc.is_active) return json({ error: `Customer "${acc.name}" is inactive. Re-activate it before syncing.` }, 409);
        if (acc.demo_mode) return json({ error: `Customer "${acc.name}" is in demo mode — sync is disabled.` }, 409);
      }
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cron-sync`;
      const payload: Record<string, unknown> = {};
      if (account_id) payload.account_id = account_id;
      if (typeof backfill_seconds === "number") payload.backfill_seconds = backfill_seconds;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d.error || "Sync failed", details: d }, r.status);
      return json(d);
    }

    // Detail of a single sync run — what was scanned, when, and what samples were saved.
    if (action === "sync-run-detail") {
      const { run_id } = body;
      if (!run_id) return json({ error: "run_id required" }, 400);
      const { data: run, error: rErr } = await admin.from("sync_runs").select("*").eq("id", run_id).maybeSingle();
      if (rErr) throw rErr;
      if (!run) return json({ error: "Run not found" }, 404);
      if (!isSuper && !adminAccs.has(run.account_id)) return json({ error: "Forbidden" }, 403);
      const startIso = run.started_at;
      const endIso = run.finished_at || new Date().toISOString();
      const { data: msgs } = await admin
        .from("ghl_messages")
        .select("ghl_message_id, message_type, direction, contact_id, user_id, body, message_date, created_at, recording_url, call_duration")
        .eq("account_id", run.account_id)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("message_date", { ascending: false })
        .limit(50);
      const { data: convos } = await admin
        .from("ghl_conversations")
        .select("ghl_conversation_id, contact_id, last_message_date, last_message_body, last_message_type, unread_count, updated_at")
        .eq("account_id", run.account_id)
        .gte("updated_at", startIso)
        .lte("updated_at", endIso)
        .order("last_message_date", { ascending: false })
        .limit(20);
      return json({ run, sample_messages: msgs || [], sample_conversations: convos || [] });
    }

    // ════════════════════════════ CUSTOMER DETAIL (one batched call) ════════════════════════════
    if (action === "customer-detail") {
      const { account_id } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);

      const [
        customerR, urR, ghlUsersR, walletR, settingsR, txsR, runsR, stateR,
        eventsR, callsCountR, scoresCountR, contactsCountR, repAssignR,
      ] = await Promise.all([
        admin.from("ghl_accounts").select("*").eq("id", account_id).maybeSingle(),
        admin.from("user_roles").select("user_id, role, created_at").eq("account_id", account_id).order("created_at"),
        admin.from("ghl_users").select("ghl_user_id, name, email, role").eq("account_id", account_id).order("name").limit(500),
        admin.from("wallets").select("balance_cents, updated_at").eq("account_id", account_id).maybeSingle(),
        admin.from("billing_settings").select("*").eq("account_id", account_id).maybeSingle(),
        admin.from("wallet_transactions").select("*").eq("account_id", account_id).order("created_at", { ascending: false }).limit(30),
        admin.from("sync_runs").select("*").eq("account_id", account_id).order("started_at", { ascending: false }).limit(20),
        admin.from("sync_state").select("*").eq("account_id", account_id).maybeSingle(),
        admin.from("usage_events").select("*").eq("account_id", account_id).order("created_at", { ascending: false }).limit(30),
        admin.from("ghl_calls").select("id", { count: "exact", head: true }).eq("account_id", account_id),
        admin.from("call_scores").select("id", { count: "exact", head: true }).eq("account_id", account_id),
        admin.from("ghl_contacts").select("id", { count: "exact", head: true }).eq("account_id", account_id),
        admin.from("rep_assignments").select("user_id, ghl_user_id").eq("account_id", account_id),
      ]);

      const userIds = (urR.data || []).map(r => r.user_id);
      let emailById = new Map<string, string>();
      if (userIds.length) {
        const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        for (const u of usersResp.data.users) {
          if (userIds.includes(u.id)) emailById.set(u.id, u.email || "");
        }
      }
      const assignsByUser: Record<string, string[]> = {};
      for (const a of repAssignR.data || []) (assignsByUser[a.user_id] ||= []).push(a.ghl_user_id);
      const team = (urR.data || []).map(r => ({
        user_id: r.user_id,
        email: emailById.get(r.user_id) || "(unknown)",
        role: r.role,
        ghl_user_ids: assignsByUser[r.user_id] || [],
        created_at: r.created_at,
      }));

      const usage30 = (eventsR.data || []).reduce(
        (acc, e: any) => ({
          provider_cost_cents: acc.provider_cost_cents + Number(e.provider_cost_cents || 0),
          billed_cents: acc.billed_cents + (e.billed_cents || 0),
          events: acc.events + 1,
        }),
        { provider_cost_cents: 0, billed_cents: 0, events: 0 },
      );

      return json({
        customer: customerR.data,
        team,
        ghl_users: ghlUsersR.data || [],
        wallet: walletR.data || { balance_cents: 0, updated_at: null },
        billing_settings: settingsR.data || { auto_recharge_enabled: false, threshold_cents: 500, topup_amount_cents: 2000 },
        transactions: txsR.data || [],
        sync_runs: runsR.data || [],
        sync_state: stateR.data || null,
        usage_events: eventsR.data || [],
        usage_recent: { ...usage30, margin_cents: usage30.billed_cents - usage30.provider_cost_cents },
        counts: {
          calls: callsCountR.count || 0,
          scores: scoresCountR.count || 0,
          contacts: contactsCountR.count || 0,
        },
      });
    }

    if (action === "get-call-detail") {
      const { call_id, ghl_message_id } = body as { call_id?: string; ghl_message_id?: string };
      if (!call_id && !ghl_message_id) return json({ error: "call_id or ghl_message_id required" }, 400);
      let q = admin.from("ghl_calls").select("*");
      if (call_id) q = q.eq("id", call_id); else q = q.eq("ghl_message_id", ghl_message_id!);
      const { data: call } = await q.maybeSingle();
      if (!call) return json({ error: "Call not found" }, 404);
      if (!isSuper && !adminAccs.has(call.account_id)) return json({ error: "Forbidden" }, 403);
      const [scoreR, contactR, repR, eventsR] = await Promise.all([
        call.score_id ? admin.from("call_scores").select("overall_score, grade, verdict, rep_name, seller_name").eq("id", call.score_id).maybeSingle() : Promise.resolve({ data: null }),
        call.contact_id ? admin.from("ghl_contacts").select("name, email, phone").eq("ghl_contact_id", call.contact_id).eq("account_id", call.account_id).maybeSingle() : Promise.resolve({ data: null }),
        call.assigned_user_id ? admin.from("ghl_users").select("name, email").eq("ghl_user_id", call.assigned_user_id).eq("account_id", call.account_id).maybeSingle() : Promise.resolve({ data: null }),
        admin.from("usage_events").select("operation, model, provider_cost_cents, billed_cents, audio_seconds, tokens_in, tokens_out, status, created_at").eq("call_id", call.id).order("created_at"),
      ]);
      return json({
        call: {
          id: call.id, ghl_message_id: call.ghl_message_id, direction: call.direction,
          call_duration: call.call_duration, call_date: call.call_date, status: call.status,
        },
        score: scoreR.data || null,
        contact: contactR.data || null,
        rep: repR.data || null,
        usage_events: eventsR.data || [],
      });
    }

    // ════════════════════════════ STRIPE ADMIN ════════════════════════════

    if (action === "get-stripe-details") {
      const { account_id } = body;
      if (!account_id) return json({ error: "account_id required" }, 400);
      if (!isSuper && !adminAccs.has(account_id)) return json({ error: "Forbidden" }, 403);
      const { data: bs } = await admin.from("billing_settings")
        .select("stripe_customer_id, default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year")
        .eq("account_id", account_id).maybeSingle();
      const { data: appS } = await admin.from("app_settings").select("stripe_mode").eq("id", true).maybeSingle();
      const mode: "test" | "live" = appS?.stripe_mode === "live" ? "live" : "test";
      const { data: lastTopup } = await admin.from("wallet_transactions")
        .select("id, amount_cents, created_at, stripe_session_id, metadata")
        .eq("account_id", account_id).eq("type", "credit")
        .not("stripe_session_id", "is", null)
        .order("created_at", { ascending: false }).limit(5);
      return json({ billing: bs || null, mode, recent_topups: lastTopup || [] });
    }

    if (action === "reconcile-stripe-session") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { session_id, environment } = body as { session_id?: string; environment?: string };
      if (!session_id) return json({ error: "session_id required" }, 400);
      const env: StripeEnv = environment === "live" ? "live" : "sandbox";
      const stripe = createStripeClient(env);
      const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ["payment_intent.payment_method"] });
      if (session.payment_status !== "paid") {
        return json({ error: `Session not paid (status: ${session.payment_status})` }, 400);
      }
      const account_id = (session.metadata as any)?.account_id;
      const amount_cents = Number((session.metadata as any)?.amount_cents || session.amount_total || 0);
      if (!account_id || !amount_cents) return json({ error: "Session missing account_id metadata" }, 400);

      const pi: any = session.payment_intent;
      const stripe_customer_id = (typeof session.customer === "string" ? session.customer : session.customer?.id) || (typeof pi?.customer === "string" ? pi.customer : pi?.customer?.id) || null;
      const pm: any = pi?.payment_method;
      const payment_method_id = typeof pm === "string" ? pm : pm?.id || null;
      const card = pm?.card || null;

      const { data: cr, error: ce } = await admin.rpc("credit_wallet", {
        _account_id: account_id,
        _amount_cents: amount_cents,
        _reason: "Stripe top-up (reconciled)",
        _stripe_session_id: session.id,
        _metadata: {
          reconciled_by: callerEmail, stripe_customer_id, payment_intent_id: pi?.id || null,
          payment_method_id, card_brand: card?.brand || null, card_last4: card?.last4 || null,
          stripe_mode: env === "live" ? "live" : "test",
        },
        _type: "credit",
      });
      if (ce) throw ce;

      const patch: Record<string, unknown> = { account_id, updated_at: new Date().toISOString() };
      if (stripe_customer_id) patch.stripe_customer_id = stripe_customer_id;
      if (payment_method_id) patch.default_payment_method_id = payment_method_id;
      if (card?.brand) patch.card_brand = card.brand;
      if (card?.last4) patch.card_last4 = card.last4;
      if (card?.exp_month) patch.card_exp_month = card.exp_month;
      if (card?.exp_year) patch.card_exp_year = card.exp_year;
      await admin.from("billing_settings").upsert(patch, { onConflict: "account_id" });

      // Attach PM to customer for future off-session use
      if (payment_method_id && stripe_customer_id) {
        try { await stripe.paymentMethods.attach(payment_method_id, { customer: stripe_customer_id }); } catch {}
      }
      return json({ ok: true, result: cr });
    }

    if (action === "charge-saved-card") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { account_id, amount_cents } = body as { account_id?: string; amount_cents?: number };
      if (!account_id || !amount_cents || amount_cents < 100) return json({ error: "account_id and amount_cents (min $1) required" }, 400);
      const { data: bs } = await admin.from("billing_settings")
        .select("stripe_customer_id, default_payment_method_id").eq("account_id", account_id).maybeSingle();
      if (!bs?.stripe_customer_id || !bs?.default_payment_method_id) return json({ error: "No saved card on file" }, 400);
      const { data: appS } = await admin.from("app_settings").select("stripe_mode").eq("id", true).maybeSingle();
      const env: StripeEnv = appS?.stripe_mode === "live" ? "live" : "sandbox";
      const stripe = createStripeClient(env);
      try {
        const pi = await stripe.paymentIntents.create({
          amount: Math.round(amount_cents),
          currency: "usd",
          customer: bs.stripe_customer_id!,
          payment_method: bs.default_payment_method_id!,
          off_session: true,
          confirm: true,
          description: `Manual top-up by super-admin`,
          metadata: { account_id, type: "wallet_topup", amount_cents: String(amount_cents), source: "manual_admin_charge", stripe_mode: env === "live" ? "live" : "test" },
        });
        if (pi.status !== "succeeded") return json({ error: `Charge ${pi.status}`, payment_intent: pi.id }, 400);
        await admin.rpc("credit_wallet", {
          _account_id: account_id, _amount_cents: amount_cents,
          _reason: "Admin-initiated card charge",
          _stripe_session_id: `pi_admin_${pi.id}`,
          _metadata: { actor: callerEmail, payment_intent_id: pi.id, stripe_mode: env === "live" ? "live" : "test", source: "manual_admin_charge" },
          _type: "credit",
        });
        return json({ ok: true, payment_intent: pi.id });
      } catch (e: any) {
        return json({ error: e?.message || "Charge failed", code: e?.code }, 400);
      }
    }

    if (action === "refund-topup") {
      if (!isSuper) return json({ error: "Forbidden" }, 403);
      const { transaction_id, amount_cents, reason } = body as { transaction_id?: string; amount_cents?: number; reason?: string };
      if (!transaction_id) return json({ error: "transaction_id required" }, 400);
      const { data: tx } = await admin.from("wallet_transactions").select("*").eq("id", transaction_id).maybeSingle();
      if (!tx) return json({ error: "Transaction not found" }, 404);
      if (tx.type !== "credit") return json({ error: "Can only refund credit transactions" }, 400);

      // Resolve PI from metadata or session
      const meta = (tx.metadata || {}) as any;
      let payment_intent_id: string | null = meta.payment_intent_id || null;
      const stripe_mode = meta.stripe_mode === "live" ? "live" : "test";
      const env: StripeEnv = stripe_mode === "live" ? "live" : "sandbox";
      const stripe = createStripeClient(env);

      if (!payment_intent_id && tx.stripe_session_id && tx.stripe_session_id.startsWith("cs_")) {
        const sess = await stripe.checkout.sessions.retrieve(tx.stripe_session_id);
        payment_intent_id = typeof sess.payment_intent === "string" ? sess.payment_intent : sess.payment_intent?.id || null;
      }
      if (!payment_intent_id) return json({ error: "No Stripe payment_intent linked to this transaction" }, 400);

      const refundAmount = amount_cents && amount_cents > 0 ? Math.min(amount_cents, tx.amount_cents) : tx.amount_cents;
      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment_intent_id,
          amount: refundAmount,
          reason: "requested_by_customer",
          metadata: { account_id: tx.account_id, original_tx_id: tx.id, actor: callerEmail },
        });
        // Debit the wallet to mirror the refund
        await admin.rpc("credit_wallet", {
          _account_id: tx.account_id,
          _amount_cents: -refundAmount,
          _reason: reason || "Refund (Stripe)",
          _stripe_session_id: `re_${refund.id}`,
          _metadata: { actor: callerEmail, refund_id: refund.id, payment_intent_id, original_tx_id: tx.id, stripe_mode },
          _type: "refund",
        });
        return json({ ok: true, refund_id: refund.id, amount_cents: refundAmount });
      } catch (e: any) {
        return json({ error: e?.message || "Refund failed" }, 400);
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
