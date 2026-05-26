// redeploy: 2026-04-30 (force pickup of _shared/billing.ts changes)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveTenantContext, TenantContextError } from "../_shared/tenantContext.ts";
import { meteredAiCall, estimateCostCents } from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const SYSTEM_PROMPT = `You are a real estate wholesaling sales coach. You read a seller's full SMS thread with our acquisitions rep and produce decision-relevant intelligence for the rep's next call.

You output ONLY valid JSON, matching this schema exactly:
{
  "rationale": "one sentence under 18 words explaining why this lead matters right now",
  "opening_line": "one or two natural sentences the rep can say verbatim. Start with 'Hi {first name}'. No preamble.",
  "next_steps": [
    { "action": "short imperative verb phrase", "reason": "one-clause why" }
  ],
  "signals": {
    "price_sensitivity": "high" | "medium" | "low" | "unknown",
    "financing_openness": "open" | "resistant" | "unknown",
    "urgency": "high" | "medium" | "low" | "unknown",
    "blockers": ["short phrases describing what's blocking the deal"],
    "last_seller_intent": "short phrase describing what the seller seems to want"
  }
}

Rules:
- Be specific. "Follow up" is not a next step. "Send creative-financing breakdown — she said she can't afford repairs" is.
- Read the FULL thread including unanswered messages. If the rep asked a question and the seller didn't respond, that's a signal.
- If the seller has been ghosting, say so — don't pretend they're warm.
- Maximum 3 next_steps. One is fine if there's only one obvious move.
- Do NOT invent facts. If you don't know, say "unknown".
- Use the Call Notes section to understand what was discussed on previous calls, the seller's personality type (if noted by the AI notetaker), AI lead scores from prior calls, and any specific objections or commitments made. This context should directly inform the rationale and opening line.`;

const JSON_ONLY_SUFFIX = "\n\nRespond with valid JSON only. Do not include any text before or after the JSON object.";

async function callClaude(systemPrompt: string, userPrompt: string, maxTokens = 1024): Promise<{ text: string | null; raw: any }> {
  if (!ANTHROPIC_API_KEY) return { text: null, raw: null };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system: systemPrompt + JSON_ONLY_SUFFIX,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`Anthropic API ${res.status}: ${errBody.slice(0, 300)}`);
      return { text: null, raw: null };
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return { text: typeof text === "string" ? text : null, raw: data };
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn("Anthropic call failed:", e instanceof Error ? e.message : e);
    return { text: null, raw: null };
  }
}

function ruleBasedFallback(ctx: any) {
  const first = ctx.first_name || "there";
  const niche = ctx.niche || "the property";
  return {
    rationale: ctx.disposition
      ? `${ctx.disposition} disposition — review thread before next call.`
      : `Active ${niche} lead at stage "${ctx.stage}" — re-engage.`,
    opening_line: `Hi ${first}, following up on ${ctx.address || "the property"} — wanted to see where you're at and if there's anything I can help with.`,
    next_steps: [],
    signals: {
      price_sensitivity: "unknown",
      financing_openness: "unknown",
      urgency: "unknown",
      blockers: [],
      last_seller_intent: "unknown",
    },
  };
}

function truncateMessages(msgs: any[], maxChars = 24000): { rendered: string; kept: number } {
  // Approx 4 chars/token. 8K tokens ≈ 32K chars. Leave headroom for system + context.
  const lines = msgs.map(
    (m) =>
      `[${(m.date_added || "").slice(0, 16)} ${m.direction}] ${String(m.body || "").replace(/\s+/g, " ").trim()}`,
  );
  let total = 0;
  const kept: string[] = [];
  // walk from newest backwards
  for (let i = lines.length - 1; i >= 0; i--) {
    const len = lines[i].length + 1;
    if (total + len > maxChars) break;
    kept.unshift(lines[i]);
    total += len;
  }
  const omitted = lines.length - kept.length;
  if (omitted > 0) kept.unshift(`[...${omitted} earlier messages omitted...]`);
  return { rendered: kept.join("\n"), kept: lines.length - omitted };
}

async function gatherContext(tenantId: string, contactId: string) {
  const [{ data: contact }, { data: tagRows }, { data: messages }, { data: tasks }, { data: opp }, { data: notesRaw }] =
    await Promise.all([
      admin.from("ghl_contacts").select("*").eq("tenant_id", tenantId).eq("ghl_contact_id", contactId).maybeSingle(),
      admin.from("ghl_contact_tags").select("tag").eq("tenant_id", tenantId).eq("ghl_contact_id", contactId),
      admin
        .from("ghl_messages")
        .select("date_added, direction, body, message_type")
        .eq("tenant_id", tenantId)
        .eq("ghl_contact_id", contactId)
        .order("date_added", { ascending: true })
        .limit(50),
      admin
        .from("ghl_tasks")
        .select("title, body, due_date")
        .eq("tenant_id", tenantId)
        .eq("ghl_contact_id", contactId)
        .eq("completed", false),
      admin
        .from("ghl_opportunities")
        .select("stage_name, pipeline_name, ghl_date_updated")
        .eq("tenant_id", tenantId)
        .eq("ghl_contact_id", contactId)
        .order("ghl_date_updated", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("ghl_contact_notes")
        .select("body_text, date_added")
        .eq("tenant_id", tenantId)
        .eq("ghl_contact_id", contactId)
        .not("body_text", "is", null)
        .order("date_added", { ascending: false })
        .limit(30),
    ]);

  if (!contact) throw new Error("contact not found in this tenant");

  const tags = (tagRows ?? []).map((r: any) => r.tag);
  const notes = (notesRaw ?? [])
    .filter((n: any) => typeof n.body_text === "string" && n.body_text.length > 20)
    .slice(0, 10);
  const lastContact = contact.last_called_date
    ? Math.floor((Date.now() - new Date(contact.last_called_date).getTime()) / 86400000)
    : null;

  return {
    first_name: contact.first_name,
    last_name: contact.last_name,
    niche: contact.niche_motivation,
    address: contact.full_address || contact.mailing_address,
    stage: opp?.stage_name || "—",
    disposition: contact.seller_disposition,
    value: contact.estimated_equity ?? contact.market_value,
    tags,
    last_contact_days: lastContact,
    open_tasks: (tasks ?? []).map((t: any) => t.title).filter(Boolean),
    messages: messages ?? [],
    notes,
    seller_temperature: contact.seller_temperature,
    last_offer_date: contact.last_offer_date,
    last_offer_feedback: contact.last_offer_feedback,
    last_offer_type: contact.last_offer_type,
    last_offer_made: contact.last_offer_made,
    timeline: contact.timeline,
    asking_price: contact.asking_price,
    condition: contact.condition,
    motivation: contact.motivation,
    seller_note: contact.seller_note,
    lead_identity: contact.lead_identity,
    lead_source: contact.lead_source,
    personality_type: contact.personality_type,
  };
}

function buildUserPrompt(ctx: any, messageBlock: string) {
  const notesBlock = (ctx.notes ?? [])
    .map((n: any) => `[${(n.date_added || "").slice(0, 10)}]: ${n.body_text}`)
    .join("\n");
  const notesSection = notesBlock
    ? `\n## Call Notes & Rep Observations (most recent first)\n${notesBlock}\n`
    : "";
  const w3Keys = [
    "seller_temperature","last_offer_date","last_offer_feedback","last_offer_type",
    "last_offer_made","timeline","asking_price","condition","motivation",
    "seller_note","lead_identity","lead_source","personality_type",
  ];
  const hasW3 = w3Keys.some((k) => ctx[k] !== null && ctx[k] !== undefined && ctx[k] !== "");
  const fmtMoney = (v: any) => (v != null && !isNaN(Number(v)) ? `$${Number(v).toLocaleString()}` : "—");
  const fmtDate = (v: any) => (v ? String(v).slice(0, 10) : "—");
  const w3Section = hasW3
    ? `\n## Lead Signals (Weight-3)
Seller Temperature: ${ctx.seller_temperature ?? "—"}
Last Offer Date: ${fmtDate(ctx.last_offer_date)}
Last Offer Type: ${ctx.last_offer_type ?? "—"}
Last Offer Made: ${fmtMoney(ctx.last_offer_made)}
Last Offer Feedback: ${ctx.last_offer_feedback ?? "—"}
Timeline: ${ctx.timeline ?? "—"}
Asking Price: ${fmtMoney(ctx.asking_price)}
Condition: ${ctx.condition ?? "—"}
Motivation: ${ctx.motivation ?? "—"}
Seller Note: ${ctx.seller_note ?? "—"}
Lead Identity: ${ctx.lead_identity ?? "—"}
Lead Source: ${ctx.lead_source ?? "—"}
Personality Type: ${ctx.personality_type ?? "—"}
`
    : "";
  return `Lead: ${ctx.first_name ?? ""} ${ctx.last_name ?? ""}
Niche: ${ctx.niche ?? "unknown"}
Property: ${ctx.address ?? "—"}
Pipeline stage: ${ctx.stage}
Disposition: ${ctx.disposition ?? "—"}
Estimated value: ${ctx.value ? `$${Number(ctx.value).toLocaleString()}` : "unknown"}
Tags: ${ctx.tags.length ? ctx.tags.join(", ") : "none"}
Last contact: ${ctx.last_contact_days != null ? `${ctx.last_contact_days} days ago` : "unknown"}
Open tasks: ${ctx.open_tasks.length ? ctx.open_tasks.join(", ") : "none"}
${w3Section}${notesSection}
Message history (chronological, oldest first):
${messageBlock || "(no messages)"}`;
}

function tryParse(text: string): any | null {
  // Strip code fences if model wrapped them
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // attempt to extract first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function validShape(o: any): boolean {
  return (
    o &&
    typeof o.rationale === "string" &&
    typeof o.opening_line === "string" &&
    Array.isArray(o.next_steps) &&
    o.signals &&
    typeof o.signals === "object"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { contact_id, force } = body;
    const callerHint: string | null = typeof body?.caller_hint === "string"
      ? body.caller_hint
      : (typeof body?.metadata?.caller_hint === "string" ? body.metadata.caller_hint : null);
    if (!contact_id || typeof contact_id !== "string") {
      return new Response(JSON.stringify({ error: "contact_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = await resolveTenantContext(req, {
      requireTenantForAdmin: true,
      bodyTenantId: typeof body?.tenant_id === "string" ? body.tenant_id : null,
    });
    if (!ctx.tenantId) throw new TenantContextError("tenant_id required", 400);
    const tenantId = ctx.tenantId;

    // Block calls for non-active tenants (paused/disabled)
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("status")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenantRow || tenantRow.status !== "active") {
      return new Response(JSON.stringify({ error: "Tenant is not active" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache check
    if (!force) {
      const { data: cached } = await admin
        .from("lead_intelligence")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("ghl_contact_id", contact_id)
        .maybeSingle();
      if (cached && cached.stale === false) {
        return new Response(JSON.stringify({ intelligence: cached, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const lead = await gatherContext(tenantId, contact_id);
    const { rendered, kept } = truncateMessages(lead.messages);
    const messageCount = lead.messages.length;
    const lastMessageAt = lead.messages.length
      ? lead.messages[lead.messages.length - 1].date_added
      : null;

    const userPrompt = buildUserPrompt(lead, rendered);
    const metered = await meteredAiCall({
      tenantId,
      userId: ctx.userId,
      operation: "analyze_lead",
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      estimateCents: estimateCostCents("analyze_lead"),
      callerHint,
      metadata: { contact_id, message_count: messageCount },
      fn: async () => {
        let parsed: any = null;
        let modelUsed = "rule-based-fallback";
        let providerResponse: any = null;

        if (messageCount > 0) {
          const { text, raw } = await callClaude(SYSTEM_PROMPT, userPrompt, 1024);
          if (text) {
            const candidate = tryParse(text);
            if (validShape(candidate)) {
              parsed = candidate;
              modelUsed = "claude-sonnet-4-5";
              providerResponse = raw;
            }
          }
        }

        if (!parsed && LOVABLE_API_KEY && messageCount > 0) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: userPrompt },
                ],
                response_format: { type: "json_object" },
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (resp.ok) {
              const data = await resp.json();
              const text = data?.choices?.[0]?.message?.content ?? "";
              const candidate = tryParse(text);
              if (validShape(candidate)) {
                parsed = candidate;
                modelUsed = "google/gemini-2.5-flash";
                providerResponse = data;
              }
            } else {
              console.warn("AI gateway error", resp.status, (await resp.text()).slice(0, 200));
            }
          } catch (e) {
            console.warn("AI call failed:", e instanceof Error ? e.message : e);
          }
        }

        if (!parsed) {
          parsed = ruleBasedFallback(lead);
          modelUsed = "rule-based-fallback";
        }

        return { result: { parsed, model: modelUsed }, providerResponse, modelUsed };
      },
    });

    if (!metered.ok) {
      return new Response(JSON.stringify({ ok: false, error: metered.error, code: metered.code }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { parsed, model } = metered.result;

    const row = {
      tenant_id: tenantId,
      ghl_contact_id: contact_id,
      rationale: String(parsed.rationale ?? "").slice(0, 1000),
      opening_line: String(parsed.opening_line ?? "").slice(0, 1000),
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.slice(0, 3) : [],
      signals: parsed.signals ?? {},
      message_count: kept,
      last_message_at: lastMessageAt,
      model,
      generated_at: new Date().toISOString(),
      stale: false,
    };

    const { data: upserted, error } = await admin
      .from("lead_intelligence")
      .upsert(row, { onConflict: "tenant_id,ghl_contact_id" })
      .select()
      .maybeSingle();
    if (error) throw error;

    return new Response(JSON.stringify({ intelligence: upserted, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof TenantContextError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("analyze-lead error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});