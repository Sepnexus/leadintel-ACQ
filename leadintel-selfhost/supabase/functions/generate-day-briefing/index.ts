// redeploy: 2026-04-30 (force pickup of _shared/billing.ts changes)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveTenantContext, TenantContextError } from "../_shared/tenantContext.ts";
import { meteredAiCall, estimateCostCents } from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_MODEL = "google/gemini-2.5-flash";
const CLAUDE_MODEL = "claude-sonnet-4-5";

function tryParseJson(text: string): any | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callClaude(systemPrompt: string, userPrompt: string, maxTokens = 1500): Promise<{ text: string | null; raw: any }> {
  if (!ANTHROPIC_API_KEY) return { text: null, raw: null };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: systemPrompt + "\n\nRespond with valid JSON only. Do not include any text before or after the JSON object.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { text: null, raw: null };
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return { text: typeof text === "string" ? text : null, raw: data };
  } catch (e) {
    clearTimeout(t);
    console.warn("Anthropic call failed:", e instanceof Error ? e.message : e);
    return { text: null, raw: null };
  }
}

function shapeBriefing(parsed: any, modelLabel: string): BriefingShape {
  return {
    headline: String(parsed.headline ?? "").slice(0, 240),
    top_callouts: Array.isArray(parsed.top_callouts) ? parsed.top_callouts.slice(0, 3) : [],
    themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 3) : [],
    start_order: Array.isArray(parsed.start_order) ? parsed.start_order.slice(0, 5) : [],
    watch_for: Array.isArray(parsed.watch_for) ? parsed.watch_for.slice(0, 4) : [],
    model: modelLabel,
  };
}

interface BriefingShape {
  headline: string;
  top_callouts: { lead_id?: string; lead_name: string; callout: string; urgency: "act_now" | "important" | "follow_up" }[];
  themes: { theme: string; evidence: string; lead_ids?: string[] }[];
  start_order: { lead_id?: string; lead_name: string; reason: string }[];
  watch_for: string[];
  model?: string;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ruleBased(leads: any[]): BriefingShape {
  const hot = leads.filter((l) => (l.tier ?? "cold") === "hot");
  const value = leads.reduce((s, l) => s + (l.estimated_equity ?? l.market_value ?? 0), 0);
  const fmt = value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value || 0}`;
  const topHot = hot[0] ?? leads[0];
  const firstName = topHot?.first_name || topHot?.name?.split(" ")[0] || "your top lead";
  return {
    headline: `${leads.length} priority call${leads.length !== 1 ? "s" : ""} today, ${hot.length} hot. ${fmt} estimated pipeline.`,
    top_callouts: topHot
      ? [{ lead_id: topHot.id, lead_name: firstName, callout: "Tier 1 priority based on disposition and tags.", urgency: "act_now" }]
      : [],
    themes: [],
    start_order: topHot ? [{ lead_id: topHot.id, lead_name: firstName, reason: "Highest priority score." }] : [],
    watch_for: [],
    model: "rule-based-fallback",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { lead_ids, rep_id, force } = body;
    const callerHint: string | null = typeof body?.caller_hint === "string"
      ? body.caller_hint
      : (typeof body?.metadata?.caller_hint === "string" ? body.metadata.caller_hint : null);
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return new Response(JSON.stringify({ error: "lead_ids required" }), {
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

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

    const sortedIds = [...lead_ids].sort();
    const cacheKey = await sha256Hex(JSON.stringify({ tenant: tenantId, ids: sortedIds, rep: rep_id ?? null }));

    if (!force) {
      const { data: cached } = await admin
        .from("day_briefing_cache")
        .select("briefing, generated_at, expires_at")
        .eq("tenant_id", tenantId)
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({
          briefing: cached.briefing,
          cached: true,
          generated_at: cached.generated_at,
          model_used: (cached.briefing as any)?.model ?? null,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Pull lead data — note we deliberately do NOT use lead_intelligence in the prompt
    // (it's interpretive AI-on-AI output and was causing fabricated details).
    const [{ data: contacts }, { data: tagsRows }, { data: opps }, { data: convos }] = await Promise.all([
      admin.from("ghl_contacts").select("*").eq("tenant_id", tenantId).in("ghl_contact_id", sortedIds),
      admin.from("ghl_contact_tags").select("ghl_contact_id, tag").eq("tenant_id", tenantId).in("ghl_contact_id", sortedIds),
      admin.from("ghl_opportunities").select("ghl_contact_id, stage_name, monetary_value, ghl_date_updated").eq("tenant_id", tenantId).in("ghl_contact_id", sortedIds),
      admin.from("ghl_conversations").select("ghl_contact_id, last_message_at").eq("tenant_id", tenantId).in("ghl_contact_id", sortedIds),
    ]);

    const tagsByContact: Record<string, string[]> = {};
    (tagsRows ?? []).forEach((r: any) => {
      (tagsByContact[r.ghl_contact_id] ??= []).push(r.tag);
    });
    const oppByContact: Record<string, any> = {};
    (opps ?? []).forEach((o: any) => {
      const cur = oppByContact[o.ghl_contact_id];
      if (!cur || (o.ghl_date_updated && o.ghl_date_updated > (cur.ghl_date_updated ?? ""))) {
        oppByContact[o.ghl_contact_id] = o;
      }
    });
    // Latest conversation last_message_at per contact
    const lastMsgByContact: Record<string, string | null> = {};
    (convos ?? []).forEach((c: any) => {
      const cur = lastMsgByContact[c.ghl_contact_id];
      if (!cur || (c.last_message_at && c.last_message_at > cur)) {
        lastMsgByContact[c.ghl_contact_id] = c.last_message_at ?? null;
      }
    });

    const daysAgo = (iso: string | null | undefined): number | null =>
      iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

    const enriched = sortedIds.map((id) => {
      const c: any = (contacts ?? []).find((x: any) => x.ghl_contact_id === id) ?? {};
      const t = tagsByContact[id] ?? [];
      const o = oppByContact[id];
      const lastSmsAt = lastMsgByContact[id] ?? null;
      const lastCallAt = c.last_called_date ?? null;
      // Combined recency = MAX(last SMS activity, last call) — same source as Today list
      const lastActivityAt =
        lastSmsAt && lastCallAt
          ? (lastSmsAt > lastCallAt ? lastSmsAt : lastCallAt)
          : (lastSmsAt ?? lastCallAt);
      return {
        id,
        first_name: c.first_name ?? "Unknown",
        last_name: c.last_name ?? "",
        niche: c.niche_motivation ?? "—",
        stage: o?.stage_name ?? "—",
        disposition: c.seller_disposition ?? null,
        tags: t.slice(0, 4),
        days_since: daysAgo(lastActivityAt),
        days_since_sms: daysAgo(lastSmsAt),
        days_since_call: daysAgo(lastCallAt),
        estimated_equity: c.estimated_equity ?? null,
        market_value: c.market_value ?? null,
      };
    });

    const totalValue = enriched.reduce((s, l) => s + (l.estimated_equity ?? l.market_value ?? 0), 0);
    const hot = enriched.filter((l) => l.disposition === "Hit List" || (l.tags ?? []).some((t) => /hit list|hot/i.test(t))).length;
    const warm = enriched.filter((l) => l.disposition === "Interested" || (l.tags ?? []).some((t) => /interested/i.test(t))).length;
    const cold = Math.max(0, enriched.length - hot - warm);

    const leadBlock = enriched.map((l) => {
      const tier = (l.disposition === "Hit List" || (l.tags ?? []).some((t: string) => /hit list|hot/i.test(t)))
        ? "hot"
        : (l.disposition === "Interested" || (l.tags ?? []).some((t: string) => /interested/i.test(t)))
          ? "warm"
          : "cold";
      const value = l.estimated_equity ?? l.market_value ?? 0;
      const smsLine = l.days_since_sms !== null ? `${l.days_since_sms}d ago` : "none on record";
      const callLine = l.days_since_call !== null ? `${l.days_since_call}d ago` : "none on record";
      return `- ${l.first_name} ${l.last_name} [id=${l.id}] (${tier})
  Niche: ${l.niche}, Stage: ${l.stage}, Disposition: ${l.disposition ?? "—"}, Tags: ${(l.tags ?? []).join(", ") || "—"}
  Last SMS activity: ${smsLine}
  Last call: ${callLine}
  Est value: $${value}`;
    }).join("\n");

    const userPrompt = `Today's priority leads (${enriched.length} total — ${hot} hot, ${warm} warm, ${cold} cold):

${leadBlock}

Pipeline value across these leads: $${totalValue}`;

    const systemPrompt = `You are a real estate wholesaling sales coach giving an acquisitions rep a 30-second-read morning briefing on their priority calls. You produce a structured briefing: top callouts, recurring themes, recommended call order, and things to watch for.

ANTI-FABRICATION RULES (CRITICAL):
- You may ONLY reference facts that appear verbatim in the lead data block below: first/last name, niche, stage, disposition, tags, "Last SMS activity", "Last call", and est value.
- Do NOT invent or infer: property addresses, cities, neighborhoods, decedent names, family details, dollar offers, appointment times, conversation topics, seller motivations, or anything else not literally present in the data.
- Do NOT describe what a lead "said" or "wants" — you do not have message content. You only have recency timestamps.
- If a lead has conflicting tags (e.g. "appointment booked" AND "cold follow up"), state the tag conflict factually. Do not narrate a story explaining it.
- Tags are status labels, not events. Do not say "X happened N days ago" based on a tag — only recency fields ("Last SMS activity", "Last call") carry timing.
- "Disposition" is the current bucket. Do not invent transitions between dispositions.
- If you cannot say something useful for a lead using only the provided fields, omit it. Empty arrays are acceptable.
- Never reference any prior briefing, prior AI summary, or "intelligence" — none is provided and none should be assumed.

Output ONLY valid JSON matching this schema:
{
  "headline": "string, max 18 words",
  "top_callouts": [{ "lead_id": "string", "lead_name": "string", "callout": "string", "urgency": "act_now"|"important"|"follow_up" }],
  "themes": [{ "theme": "string", "evidence": "string", "lead_ids": ["string", "string"] }],
  "start_order": [{ "lead_id": "string", "lead_name": "string", "reason": "string" }],
  "watch_for": ["string"]
}

Rules: top_callouts max 3. themes max 3, empty array if no real pattern across multiple leads. start_order max 5. watch_for max 4. Reference real lead first names exactly as given. No markdown, no preamble — JSON only.

ID REQUIREMENTS:
- Each top_callout MUST include the lead_id from the [id=...] tag exactly as provided.
- Each start_order entry MUST include the lead_id.
- Themes MUST include lead_ids referencing at least 2 leads from the data block.
- If you cannot find a real cross-lead pattern, return empty themes — do not fabricate themes to fill space.`;

    const metered = await meteredAiCall({
      tenantId,
      userId: ctx.userId,
      operation: "generate_briefing",
      model: CLAUDE_MODEL,
      provider: "anthropic",
      estimateCents: estimateCostCents("generate_briefing"),
      callerHint,
      metadata: { lead_count: enriched.length, rep_id: rep_id ?? null },
      fn: async () => {
        let parsedBriefing: any = null;
        let modelUsed = "rule-based-fallback";
        let providerResponse: any = null;

        const { text: claudeText, raw: claudeRaw } = await callClaude(systemPrompt, userPrompt, 1500);
        if (claudeText) {
          const candidate = tryParseJson(claudeText);
          if (candidate && typeof candidate.headline === "string") {
            parsedBriefing = candidate;
            modelUsed = CLAUDE_MODEL;
            providerResponse = claudeRaw;
          }
        }

        if (!parsedBriefing && LOVABLE_API_KEY) {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 45_000);
            const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              signal: ctrl.signal,
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: GEMINI_MODEL,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                temperature: 0.2,
                response_format: { type: "json_object" },
              }),
            });
            clearTimeout(t);
            if (aiRes.ok) {
              const aiJson = await aiRes.json();
              const text = aiJson.choices?.[0]?.message?.content ?? "";
              const candidate = tryParseJson(text);
              if (candidate && typeof candidate.headline === "string") {
                parsedBriefing = candidate;
                modelUsed = GEMINI_MODEL;
                providerResponse = aiJson;
              }
            } else {
              console.warn(`Gemini gateway ${aiRes.status}: ${(await aiRes.text()).slice(0, 200)}`);
            }
          } catch (e) {
            console.warn("Gemini call failed:", e instanceof Error ? e.message : e);
          }
        }

        const briefing = parsedBriefing
          ? shapeBriefing(parsedBriefing, modelUsed)
          : ruleBased(enriched);
        return { result: briefing, providerResponse, modelUsed };
      },
    });

    if (!metered.ok) {
      return new Response(JSON.stringify({ ok: false, error: metered.error, code: metered.code }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const briefing: BriefingShape = metered.result;

    // Cache result
    await admin.from("day_briefing_cache").upsert(
      {
        tenant_id: tenantId,
        cache_key: cacheKey,
        briefing: briefing as any,
        rep_id: rep_id ?? null,
        lead_ids: sortedIds,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      },
      { onConflict: "tenant_id,cache_key" },
    );

    return new Response(JSON.stringify({ briefing, cached: false, generated_at: new Date().toISOString(), model_used: briefing.model ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof TenantContextError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("generate-day-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});