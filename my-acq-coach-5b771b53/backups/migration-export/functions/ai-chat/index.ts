import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Single source of truth for the OpenAI model used across the app.
const OPENAI_MODEL = "gpt-5.4-mini";

// gpt-5.4-mini pricing in cents per 1M tokens: $0.75 in, $4.50 out
function computeCostCents(tokensIn: number, tokensOut: number): number {
  return (tokensIn * 75 + tokensOut * 450) / 1_000_000;
}

async function callOpenAI(key: string, system: string, messages: any[], max_tokens: number) {
  const openaiMessages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...messages,
  ];
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: openaiMessages,
      max_completion_tokens: max_tokens || 2000,
    }),
  });
}

// Match the legacy Anthropic-shaped response so frontend callers don't need changes.
function toAnthropicFormat(data: any) {
  const content = data.choices?.[0]?.message?.content || "";
  return {
    content: [{ type: "text", text: content }],
    model: data.model,
    role: "assistant",
    stop_reason: "end_turn",
    type: "message",
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
      cost_cents: computeCostCents(
        data.usage?.prompt_tokens || 0,
        data.usage?.completion_tokens || 0,
      ),
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { system, messages, max_tokens } = await req.json();
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await callOpenAI(openaiKey, system, messages, max_tokens);
    if (res.ok) {
      const data = await res.json();
      return new Response(JSON.stringify(toAnthropicFormat(data)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const t = await res.text();
    console.error("OpenAI error:", res.status, t);
    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited by OpenAI, please retry shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 401) {
      return new Response(JSON.stringify({ error: "OpenAI authentication failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: `OpenAI error ${res.status}` }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
