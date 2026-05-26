// Forward-only background sync + auto-pipeline.
// 1. Pull new GHL conversations & call messages (forward-only from cursor).
// 2. Promote call messages with duration ≥ 5 min into ghl_calls.
// 3. Fetch GHL transcripts; if missing, transcribe the recording with Whisper.
// 4. Score every call that ends up with a transcript via gpt-5.4-mini.
// Anything < 5 min is ignored end-to-end.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const errMsg = (e: unknown) => e instanceof Error ? e.message : (typeof e === "string" ? e : "Unknown");

const MAX_PIPELINE_CALLS = 10; // per-tenant per-run cap to stay within edge function time budget

// ── Billing rules (read once per sync run) ───────────────────────────────
// We only use OpenAI (Whisper + GPT). All costs are token/second based and
// multiplied by the per-customer markup (or the global default).
type BillingRules = {
  markup: number;
  minSeconds: number;
  whisperCentsPerMin: number;
  openaiInCentsPer1k: number;
  openaiOutCentsPer1k: number;
};
async function loadBillingRules(admin: any, accountId: string): Promise<BillingRules> {
  const [{ data: app }, { data: cust }] = await Promise.all([
    admin.from("app_settings").select("*").eq("id", true).maybeSingle(),
    admin.from("billing_settings").select("markup_multiplier, min_call_seconds_for_ai").eq("account_id", accountId).maybeSingle(),
  ]);
  const a = app || {};
  return {
    markup: Number(cust?.markup_multiplier ?? a.default_markup_multiplier ?? 2.0),
    minSeconds: Number(cust?.min_call_seconds_for_ai ?? a.default_min_call_seconds_for_ai ?? 300),
    whisperCentsPerMin: Number(a.whisper_cents_per_minute ?? 0.6),
    openaiInCentsPer1k: Number(a.openai_input_cents_per_1k ?? 0.025),
    openaiOutCentsPer1k: Number(a.openai_output_cents_per_1k ?? 0.10),
  };
}
function whisperCost(seconds: number, r: BillingRules) {
  return (Math.max(0, seconds) / 60) * r.whisperCentsPerMin;
}
function gptCost(tokIn: number, tokOut: number, r: BillingRules) {
  return (tokIn / 1000) * r.openaiInCentsPer1k + (tokOut / 1000) * r.openaiOutCentsPer1k;
}
function bill(providerCents: number, r: BillingRules) {
  return Math.max(1, Math.round(providerCents * r.markup));
}


const firstNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const m = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : fallback;
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

const fetchWithTimeout = async (input: string, init: RequestInit = {}, timeoutMs = 60000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal || controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const SCORING_PROMPT = `You are ACQ Coach AI for real estate wholesalers. Analyze this acquisition call transcript.

Detect: sellerType (probate/inherited/pre-foreclosure/tired-landlord/divorce/absentee-owner/cold-unknown), callType (first-contact/follow-up/re-engagement/offer-presentation), and estimate talk ratios.

Score 0-10 each category: Introduction and Positioning, Rapport Building, Motivation Discovery, Timeline Discovery, Financial Discovery, Offer Presentation, Objection Handling, First No Recovery, Next Step Close.

Status per category: strong (8-10), ok (6-7.9), weak (4-5.9), critical (0-3.9).

Coaching rules: seller should talk 60%+, never give price before situation discovery, end with specific next step time.

Respond ONLY valid JSON, no markdown:
{"detected":{"sellerType":"string","sellerTypeLabel":"string","callType":"string","callTypeLabel":"string","sellerTalkRatio":"string","repTalkRatio":"string"},"score":{"overall":0,"grade":"string","categories":[{"name":"string","score":0,"status":"string","oneliner":"string"}]},"verdict":"string","moments":[{"category":"string","status":"string","what":"string","why":"string","rewrite":"string"}],"strengths":["string"]}`;

// Pull GHL users (reps) for a tenant and upsert into ghl_users.
// Independent of conversation cursor — runs on every sync so reps appear
// even before any calls have happened.
async function syncGhlUsers(admin: any, account: any): Promise<number> {
  if (!account.company_id || !account.location_id) return 0;
  const url = `https://services.leadconnectorhq.com/users/search?companyId=${account.company_id}&locationId=${account.location_id}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${account.api_key}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    console.log(`syncGhlUsers: GHL ${res.status} for account ${account.id}`);
    return 0;
  }
  const data = await res.json();
  const users: any[] = data?.users || [];
  let saved = 0;
  for (const u of users) {
    const fullName = u.name || [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    const { error } = await admin.from("ghl_users").upsert(
      {
        account_id: account.id,
        ghl_user_id: u.id,
        name: fullName || u.email || "Unnamed",
        email: u.email || "",
        phone: u.phone || null,
        raw_data: u,
      },
      { onConflict: "account_id,ghl_user_id" },
    );
    if (!error) saved++;
  }
  return saved;
}


// `backfillSeconds` (optional): if provided on a manual run, look back that many seconds
// from now instead of using the stored cursor (lets admins replay a window of history).
async function syncTenant(admin: any, account: any, trigger: "cron" | "manual", backfillSeconds?: number): Promise<any> {
  const startedAt = Date.now();
  const integratedMs = new Date(account.integrated_at).getTime();

  // Read prior cursor
  const { data: state } = await admin
    .from("sync_state").select("cursor_ms").eq("account_id", account.id).maybeSingle();
  let cursorBefore = Math.max(Number(state?.cursor_ms || 0), integratedMs);
  if (typeof backfillSeconds === "number" && backfillSeconds > 0) {
    // Override: pull anything newer than (now - backfillSeconds), but never older than integration date.
    const overrideMs = Math.max(integratedMs, Date.now() - backfillSeconds * 1000);
    cursorBefore = Math.min(cursorBefore, overrideMs);
  } else if (backfillSeconds === -1) {
    // -1 = "all history since integration"
    cursorBefore = integratedMs;
  }

  // Insert run row (running)
  const { data: runRow, error: runErr } = await admin.from("sync_runs").insert({
    account_id: account.id,
    trigger,
    status: "running",
    cursor_before_ms: cursorBefore,
  }).select("id").single();
  if (runErr) throw runErr;
  const runId = runRow.id;

  let convScanned = 0, convSaved = 0, msgSaved = 0, callMsgFound = 0;
  let highestSeenMs = cursorBefore;
  let errorMessage: string | null = null;

  const ghlHeaders = {
    Authorization: `Bearer ${account.api_key}`,
    Version: "2021-04-15",
    Accept: "application/json",
  };

  // Always refresh GHL users (reps) on every sync — independent of cursor / call data.
  let usersSynced = 0;
  try {
    usersSynced = await syncGhlUsers(admin, account);
  } catch (e) {
    console.log("syncGhlUsers failed:", errMsg(e));
  }

  // Checkpoint helper: persist cursor + run row partial progress so a 150s
  // edge-function timeout still leaves the next run able to resume forward.
  let lastCheckpointAt = Date.now();
  const checkpoint = async () => {
    const cursorNow = highestSeenMs > cursorBefore ? highestSeenMs : cursorBefore;
    try {
      await Promise.all([
        admin.from("sync_state").upsert({
          account_id: account.id,
          cursor_ms: cursorNow,
          last_run_at: new Date().toISOString(),
          last_status: "running",
          updated_at: new Date().toISOString(),
        }, { onConflict: "account_id" }),
        admin.from("sync_runs").update({
          conversations_scanned: convScanned,
          conversations_saved: convSaved,
          messages_saved: msgSaved,
          call_messages_found: callMsgFound,
          cursor_after_ms: cursorNow,
        }).eq("id", runId),
      ]);
    } catch (_) { /* checkpoint best-effort */ }
    lastCheckpointAt = Date.now();
  };

  try {
    // Pull conversations sorted DESC by last_message_date, stop when older than cursorBefore
    // Tight budget so a long manual backfill still has time to persist progress + finalize.
    const TIME_BUDGET_MS = trigger === "manual" ? 90_000 : 60_000;
    const MAX_PAGES = trigger === "manual" ? 20 : 6;
    const PAGE_LIMIT = 100;
    let pages = 0;
    let pageCursorMs = Date.now() + 1; // start "now" and walk back
    let stopped = false;

    while (pages < MAX_PAGES && !stopped) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      const params = new URLSearchParams({
        locationId: account.location_id,
        lastMessageType: "TYPE_CALL",
        sort: "desc",
        sortBy: "last_message_date",
        limit: String(PAGE_LIMIT),
      });
      if (pages > 0) params.set("startAfterDate", String(pageCursorMs));

      const url = `https://services.leadconnectorhq.com/conversations/search?${params.toString()}`;
      const res = await fetchWithTimeout(url, { headers: ghlHeaders }, 15_000);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`GHL search failed ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      const conversations: any[] = data?.conversations || [];
      pages++;
      if (conversations.length === 0) break;

      // Pre-filter: only conversations newer than cursor need per-message work.
      const eligible: any[] = [];
      for (const conv of conversations) {
        convScanned++;
        const lastMs = conv.lastMessageDate ? new Date(conv.lastMessageDate).getTime() : 0;
        if (lastMs && lastMs < pageCursorMs) pageCursorMs = lastMs;
        if (lastMs && lastMs <= cursorBefore) { stopped = true; continue; }
        if (lastMs > highestSeenMs) highestSeenMs = lastMs;
        eligible.push(conv);
      }

      // Fetch messages for eligible conversations in parallel batches (5 at a time).
      const BATCH = 5;
      for (let b = 0; b < eligible.length; b += BATCH) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) { stopped = true; break; }
        const batch = eligible.slice(b, b + BATCH);
        const results = await Promise.all(batch.map(async (conv) => {
          try {
            const msgUrl = `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?type=TYPE_CALL&limit=100`;
            const msgRes = await fetchWithTimeout(msgUrl, { headers: ghlHeaders }, 10_000);
            if (!msgRes.ok) return { conv, messages: [] as any[] };
            const msgData = await msgRes.json();
            const all = (msgData.messages?.messages || msgData.messages || []);
            const messages = Array.isArray(all)
              ? all.filter((m: any) => {
                  const ms = m.dateAdded ? new Date(m.dateAdded).getTime() : 0;
                  return ms > cursorBefore;
                })
              : [];
            return { conv, messages };
          } catch { return { conv, messages: [] as any[] }; }
        }));

        for (const { conv, messages } of results) {
          if (messages.length === 0) continue;

          const convRow = {
            account_id: account.id,
            ghl_conversation_id: conv.id,
            contact_id: conv.contactId || null,
            assigned_user_id: conv.assignedTo || null,
            last_message_body: conv.lastMessageBody || null,
            last_message_type: conv.lastMessageType || null,
            last_message_date: conv.lastMessageDate ? new Date(conv.lastMessageDate).toISOString() : null,
            unread_count: conv.unreadCount || 0,
            type: conv.type || null,
            raw_data: conv,
          };
          const { error: convErr } = await admin.from("ghl_conversations")
            .upsert([convRow], { onConflict: "account_id,ghl_conversation_id" });
          if (convErr) continue;
          convSaved++;

          const msgRows = messages.map((msg: any) => {
            const t = msg.messageType || msg.type || "TYPE_CALL";
            if (typeof t === "string" && t.toUpperCase().includes("CALL")) callMsgFound++;
            return {
              account_id: account.id,
              conversation_id: conv.id,
              ghl_message_id: msg.id,
              contact_id: conv.contactId || null,
              user_id: msg.userId || null,
              message_type: t,
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
            const { error: mErr } = await admin.from("ghl_messages")
              .upsert(chunk, { onConflict: "account_id,ghl_message_id" });
            if (!mErr) msgSaved += chunk.length;
          }
        }

        // Checkpoint every ~10s so a 504 still preserves forward progress.
        if (Date.now() - lastCheckpointAt > 10_000) await checkpoint();
      }
    }
  } catch (e) {
    errorMessage = errMsg(e);
  }

  const cursorAfter = highestSeenMs > cursorBefore ? highestSeenMs : cursorBefore;

  // ── PIPELINE: promote ≥minSeconds messages into ghl_calls, fetch transcripts,
  //    Whisper-fallback, then score everything that ends up with a transcript.
  let pipelineSummary: any = { promoted: 0, transcripts_fetched: 0, transcribed: 0, scored: 0, skipped_short: 0, skipped_no_funds: 0, errors: [] };
  try {
    const rules = await loadBillingRules(admin, account.id);
    pipelineSummary = await runPipelineForTenant(admin, account, ghlHeaders, rules);
  } catch (e) {
    pipelineSummary.errors.push(errMsg(e));
  }

  const finishedAt = Date.now();

  // Persist cursor + run result
  await admin.from("sync_state").upsert({
    account_id: account.id,
    cursor_ms: cursorAfter,
    last_run_at: new Date(finishedAt).toISOString(),
    last_status: errorMessage ? "error" : "success",
    updated_at: new Date(finishedAt).toISOString(),
  }, { onConflict: "account_id" });

  await admin.from("sync_runs").update({
    status: errorMessage ? "error" : "success",
    conversations_scanned: convScanned,
    conversations_saved: convSaved,
    messages_saved: msgSaved,
    call_messages_found: callMsgFound,
    duration_ms: finishedAt - startedAt,
    error_message: errorMessage,
    cursor_after_ms: cursorAfter,
    finished_at: new Date(finishedAt).toISOString(),
  }).eq("id", runId);

  return {
    account_id: account.id, name: account.name,
    status: errorMessage ? "error" : "success",
    conversations_scanned: convScanned, conversations_saved: convSaved,
    messages_saved: msgSaved, call_messages_found: callMsgFound,
    duration_ms: finishedAt - startedAt,
    cursor_before_ms: cursorBefore, cursor_after_ms: cursorAfter,
    pipeline: pipelineSummary,
    users_synced: usersSynced,
    error: errorMessage,
  };
}

// ── End-to-end pipeline for one tenant ──────────────────────────────────────
async function runPipelineForTenant(admin: any, account: any, ghlHeaders: Record<string, string>, rules: BillingRules) {
  const summary: any = { promoted: 0, transcripts_fetched: 0, transcribed: 0, scored: 0, scoring_failed: 0, skipped_short: 0, skipped_no_funds: 0, errors: [] as string[] };

  // 0. Mark any existing calls below the threshold as skipped_short so they
  //    stop showing up in the pending pipeline.
  await admin.from("ghl_calls")
    .update({ status: "skipped_short" })
    .eq("account_id", account.id)
    .lt("call_duration", rules.minSeconds)
    .in("status", ["indexed", "pending", "no_transcript"]);

  // 1. Promote call messages (>= minSeconds) into ghl_calls if not already there.
  const { data: callMsgs } = await admin
    .from("ghl_messages")
    .select("ghl_message_id, conversation_id, contact_id, user_id, direction, call_status, call_duration, body, message_date, raw_data")
    .eq("account_id", account.id)
    .ilike("message_type", "%CALL%")
    .gte("call_duration", rules.minSeconds)
    .limit(500);

  if (callMsgs && callMsgs.length > 0) {
    const ids = callMsgs.map((m: any) => m.ghl_message_id);
    const existingIds = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { data: existing } = await admin
        .from("ghl_calls")
        .select("ghl_message_id")
        .eq("account_id", account.id)
        .in("ghl_message_id", slice);
      (existing || []).forEach((e: any) => existingIds.add(e.ghl_message_id));
    }
    const toInsert = callMsgs
      .filter((m: any) => !existingIds.has(m.ghl_message_id))
      .map((m: any) => ({
        account_id: account.id,
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
    for (let i = 0; i < toInsert.length; i += 50) {
      const { error } = await admin.from("ghl_calls").upsert(toInsert.slice(i, i + 50), { onConflict: "account_id,ghl_message_id" });
      if (!error) summary.promoted += toInsert.slice(i, i + 50).length;
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  // 2. Fetch GHL transcripts for indexed calls (>= minSeconds, no transcript yet).
  const { data: indexed } = await admin
    .from("ghl_calls")
    .select("id, ghl_message_id, body, call_duration, contact_id, assigned_user_id, account_id")
    .eq("account_id", account.id)
    .in("status", ["indexed", "no_transcript"])
    .is("transcript", null)
    .gte("call_duration", rules.minSeconds)
    .order("call_date", { ascending: false })
    .limit(MAX_PIPELINE_CALLS);

  for (const call of (indexed || [])) {
    let transcriptText: string | null = null;

    // Try GHL transcription (free)
    try {
      const txUrl = `https://services.leadconnectorhq.com/conversations/locations/${account.location_id}/messages/${call.ghl_message_id}/transcription`;
      const txRes = await fetchWithTimeout(txUrl, { headers: ghlHeaders }, 30000);
      if (txRes.ok) {
        const txData = await txRes.json();
        const sentences = Array.isArray(txData) ? txData : (txData?.transcriptions || txData?.transcript || [txData]);
        if (Array.isArray(sentences) && sentences.length > 0 && sentences.some((s: any) => s.transcript)) {
          transcriptText = sentences
            .filter((s: any) => s.transcript)
            .map((s: any) => `${s.mediaChannel === 0 ? "Rep:" : "Seller:"} ${s.transcript}`)
            .join("\n");
          summary.transcripts_fetched++;
        }
      }
    } catch (e) {
      summary.errors.push(`transcript ${call.ghl_message_id}: ${errMsg(e)}`);
    }

    if (!transcriptText && call.body && call.body.trim().length > 50) {
      transcriptText = call.body;
    }

    // Fallback: Whisper (paid — strict balance gate, real cost × markup)
    if (!transcriptText && openaiKey) {
      // Estimate cost up-front and refuse if balance can't cover it.
      const estSecs = Number(call.call_duration) || rules.minSeconds;
      const estProvider = whisperCost(estSecs, rules);
      const estBilled = bill(estProvider, rules);
      const { data: w } = await admin.from("wallets").select("balance_cents").eq("account_id", account.id).maybeSingle();
      if (!w || w.balance_cents < estBilled) {
        summary.skipped_no_funds++;
        await admin.from("ghl_calls").update({ status: "insufficient_funds" }).eq("id", call.id);
        continue;
      }
      try {
        const recUrl = `https://services.leadconnectorhq.com/conversations/messages/${call.ghl_message_id}/locations/${account.location_id}/recording`;
        const recRes = await fetchWithTimeout(recUrl, { headers: { Authorization: `Bearer ${account.api_key}`, Version: "2021-04-15" } }, 45000);
        if (recRes.ok) {
          const audioBuf = await recRes.arrayBuffer();
          if (audioBuf.byteLength > 1000) {
            const audioBlob = new Blob([audioBuf], { type: "audio/wav" });
            const form = new FormData();
            form.append("file", audioBlob, `${call.ghl_message_id}.wav`);
            form.append("model", "whisper-1");
            form.append("response_format", "verbose_json");
            const wRes = await fetchWithTimeout(
              "https://api.openai.com/v1/audio/transcriptions",
              { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: form },
              120000,
            );
            if (wRes.ok) {
              const wData = await wRes.json();
              const raw = (wData?.text || "").trim();
              if (raw) {
                transcriptText = `// Auto-transcribed by Whisper — speaker labels (Rep:/Seller:) are not available.\n\n${raw}`;
                summary.transcribed++;
                const audioSecs = Math.round(wData?.duration || call.call_duration || 0);
                const providerCostCents = whisperCost(audioSecs, rules);
                const billedCents = bill(providerCostCents, rules);
                try {
                  await admin.rpc("debit_wallet", {
                    _account_id: account.id,
                    _amount_cents: billedCents,
                    _reason: "Transcription (Whisper, auto)",
                    _metadata: { call_id: call.id, ghl_message_id: call.ghl_message_id, audio_seconds: audioSecs, markup: rules.markup },
                  });
                } catch (_) { /* ignore */ }
                {
                  const { error: ueErr } = await admin.from("usage_events").insert({
                    account_id: account.id,
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
                    metadata: { source: "cron-sync" },
                  });
                  if (ueErr) console.log("usage_events (whisper) insert failed:", ueErr.message);
                }
              }
            }
          }
        }
      } catch (e) {
        summary.errors.push(`whisper ${call.ghl_message_id}: ${errMsg(e)}`);
      }
    }

    const nextStatus = transcriptText ? "pending" : "no_transcript";
    await admin
      .from("ghl_calls")
      .update({ transcript: transcriptText, status: nextStatus })
      .eq("id", call.id);
  }

  // 3. Score every call that's now pending (and >= minSeconds, of course).
  if (openaiKey) {
    const { data: toScore } = await admin
      .from("ghl_calls")
      .select("id, ghl_message_id, transcript, call_duration, contact_id, assigned_user_id, account_id")
      .eq("account_id", account.id)
      .eq("status", "pending")
      .gte("call_duration", rules.minSeconds)
      .order("call_date", { ascending: false })
      .limit(MAX_PIPELINE_CALLS);

    for (const call of (toScore || [])) {
      if (!call.transcript || call.transcript.trim().length < 50) continue;

      // Strict balance gate — refuse if not enough to cover even a tiny score.
      const { data: w } = await admin.from("wallets").select("balance_cents").eq("account_id", account.id).maybeSingle();
      if (!w || w.balance_cents <= 0) {
        summary.skipped_no_funds++;
        await admin.from("ghl_calls").update({ status: "insufficient_funds" }).eq("id", call.id);
        continue;
      }

      // Resolve names
      let sellerName = "Unknown";
      if (call.contact_id) {
        const { data: contact } = await admin
          .from("ghl_contacts").select("name")
          .eq("ghl_contact_id", call.contact_id).eq("account_id", account.id).maybeSingle();
        if (contact?.name) sellerName = contact.name;
      }
      let repName = "Unknown";
      if (call.assigned_user_id) {
        const { data: user } = await admin
          .from("ghl_users").select("name")
          .eq("ghl_user_id", call.assigned_user_id).eq("account_id", account.id).maybeSingle();
        if (user?.name) repName = user.name;
      }

      let aiResult: any = null;
      let tokensIn = 0, tokensOut = 0;
      const usedProvider = "openai";
      const usedModel = "gpt-4o-mini";
      try {
        const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: usedModel,
            messages: [
              { role: "system", content: SCORING_PROMPT },
              { role: "user", content: call.transcript },
            ],
            max_completion_tokens: 3000,
            response_format: { type: "json_object" },
          }),
        }, 90000);
        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          aiResult = JSON.parse(content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
          tokensIn = data.usage?.prompt_tokens || 0;
          tokensOut = data.usage?.completion_tokens || 0;
        }
      } catch (e) {
        summary.errors.push(`score ${call.ghl_message_id}: ${errMsg(e)}`);
      }

      if (!aiResult) {
        summary.scoring_failed++;
        // Log the failure for cost transparency (no debit since the call may not have completed).
        {
          const { error: ueErr } = await admin.from("usage_events").insert({
            account_id: account.id, operation: "scoring", provider: usedProvider, model: usedModel,
            call_id: call.id, ghl_message_id: call.ghl_message_id,
            tokens_in: tokensIn, tokens_out: tokensOut,
            provider_cost_cents: 0, billed_cents: 0,
            markup_multiplier: rules.markup, status: "failed",
            error_message: "AI returned no result", metadata: { source: "cron-sync" },
          });
          if (ueErr) console.log("usage_events (score-fail) insert failed:", ueErr.message);
        }
        await admin.from("ghl_calls").update({ status: "failed" }).eq("id", call.id);
        continue;
      }

      const detected = aiResult.detected || {};
      const score = aiResult.score || {};
      const repTalk = integerPercent(detected.repTalkRatio, 50);
      const sellerTalk = integerPercent(detected.sellerTalkRatio, 50);
      const categoryScores = Array.isArray(score.categories)
        ? score.categories.map((c: Record<string, unknown>) => ({ ...c, score: Math.max(0, Math.min(10, firstNumber(c.score, 0))) }))
        : [];

      const { data: scoreRecord, error: scoreErr } = await admin
        .from("call_scores")
        .insert({
          account_id: account.id,
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
        .select("id")
        .single();

      if (scoreErr || !scoreRecord) {
        summary.scoring_failed++;
        summary.errors.push(`score insert ${call.ghl_message_id}: ${errMsg(scoreErr)}`);
        await admin.from("ghl_calls").update({ status: "failed" }).eq("id", call.id);
        continue;
      }

      await admin.from("ghl_calls").update({ status: "scored", score_id: scoreRecord.id }).eq("id", call.id);
      summary.scored++;

      // Real cost from token usage × current OpenAI rates × per-customer markup.
      const providerCostCents = gptCost(tokensIn, tokensOut, rules);
      const billedCents = bill(providerCostCents, rules);
      try {
        await admin.rpc("debit_wallet", {
          _account_id: account.id,
          _amount_cents: billedCents,
          _reason: "Call scoring (auto)",
          _metadata: { call_id: call.id, score_id: scoreRecord.id, model: usedModel, markup: rules.markup },
        });
      } catch (_) { /* ignore */ }
      {
        const { error: ueErr } = await admin.from("usage_events").insert({
          account_id: account.id,
          operation: "scoring",
          provider: usedProvider,
          model: usedModel,
          call_id: call.id,
          ghl_message_id: call.ghl_message_id,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          provider_cost_cents: providerCostCents,
          billed_cents: billedCents,
          markup_multiplier: rules.markup,
          status: "success",
          metadata: { source: "cron-sync", score_id: scoreRecord.id },
        });
        if (ueErr) console.log("usage_events (score) insert failed:", ueErr.message);
      }
    }
  }

  // Trim error list so the sync_runs row stays small
  summary.errors = summary.errors.slice(0, 10);
  return summary;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const requestedAccountId: string | null = body.account_id || null;
    // Manual-only: how far back to look. Number of seconds, or -1 for "all since integration".
    const backfillSeconds: number | undefined =
      typeof body.backfill_seconds === "number" ? body.backfill_seconds : undefined;

    // Authorisation:
    // - Cron passes x-cron-secret matching CRON_SECRET → trigger=cron
    // - Otherwise must be a JWT for super_admin or account_admin of the target → trigger=manual
    const CRON_SECRET = "9bb9b061720176cab6326f7f04d085df4b7a544e4e1212dc3524df2ec6ea12cb";
    const headerSecret = req.headers.get("x-cron-secret") || "";
    const isCronCall = headerSecret === CRON_SECRET;

    let trigger: "cron" | "manual" = "cron";

    if (!isCronCall) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token) return json({ error: "Unauthorized" }, 401);
      const { data: u, error: ue } = await admin.auth.getUser(token);
      if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles")
        .select("role, account_id").eq("user_id", u.user.id);
      const isSuper = !!roles?.some((r: any) => r.role === "super_admin");
      const adminAccs = new Set((roles || []).filter((r: any) => r.role === "account_admin").map((r: any) => r.account_id));
      if (requestedAccountId) {
        if (!isSuper && !adminAccs.has(requestedAccountId)) return json({ error: "Forbidden" }, 403);
      } else {
        if (!isSuper) return json({ error: "Forbidden" }, 403);
      }
      trigger = "manual";
    }

    // ── Stale run reaper ──────────────────────────────────────────────────
    // Mark any run still 'running' for >5 min as failed (timed out) so the UI
    // doesn't show forever-spinning syncs from prior crashes.
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await admin.from("sync_runs")
        .update({ status: "error", error_message: "Timed out (no completion within 5 minutes)", finished_at: new Date().toISOString() })
        .eq("status", "running")
        .lt("started_at", fiveMinAgo);
    } catch (_) { /* non-fatal */ }

    // Pick target tenants
    // Skip accounts in demo mode — they show synthetic data, no real sync.
    // For an explicit requestedAccountId, fail loud if the customer is inactive/demo
    // so the caller (UI "Sync now") gets a clear error instead of a silent no-op.
    if (requestedAccountId) {
      const { data: acc } = await admin.from("ghl_accounts").select("is_active, demo_mode, name").eq("id", requestedAccountId).maybeSingle();
      if (!acc) return json({ error: "Customer not found" }, 404);
      if (!acc.is_active) return json({ error: `Customer "${acc.name}" is inactive — sync blocked.` }, 409);
      if (acc.demo_mode) return json({ error: `Customer "${acc.name}" is in demo mode — sync blocked.` }, 409);
    }
    let q = admin.from("ghl_accounts").select("id, name, api_key, location_id, company_id, integrated_at").eq("is_active", true).eq("demo_mode", false);
    if (requestedAccountId) q = q.eq("id", requestedAccountId);
    const { data: accounts, error: aErr } = await q;
    if (aErr) throw aErr;

    const results = [];
    for (const acc of (accounts || [])) {
      try { results.push(await syncTenant(admin, acc, trigger, trigger === "manual" ? backfillSeconds : undefined)); }
      catch (e) { results.push({ account_id: acc.id, name: acc.name, status: "error", error: errMsg(e) }); }
    }

    return json({ ok: true, ran: results.length, results });
  } catch (e) {
    console.error(e);
    return json({ error: errMsg(e) }, 500);
  }
});
