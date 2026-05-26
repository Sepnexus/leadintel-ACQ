import { COLORS } from "@/utils/leadUtils";
import { useEffect, useRef, useState } from "react";
import type { Lead } from "@/data/leads";
import { useDayBriefing } from "@/hooks/useDayBriefing";
import { FullBriefingPanel } from "./FullBriefingPanel";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { handleAiResponseError } from "@/lib/aiErrorToast";

const BRIEFING_FORCE_FLAG = "briefing_cache_busted_v2";

interface BriefingCardProps {
  isMobile: boolean;
  counts: { all: number; hot: number; warm: number; cold: number };
  totalEstimatedValue: number;
  overdueTaskTotal?: number;
  aiAvailable: boolean;
  topLeadIds?: string[];
  topLeads?: Lead[];
  onSelectLead?: (lead: Lead) => void;
}

function fmtPipeline(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "k";
  return "$" + n;
}

function briefingToScript(b: {
  headline: string;
  top_callouts: { lead_name: string; callout: string }[];
  start_order: { lead_name: string; reason: string }[];
  watch_for: string[];
}, fallbackSummary: string): string {
  const parts: string[] = [];
  parts.push(b.headline || fallbackSummary);
  if (b.top_callouts?.length) {
    parts.push("Top callouts.");
    b.top_callouts.slice(0, 3).forEach((c) => {
      parts.push(`${c.lead_name}: ${c.callout}`);
    });
  }
  if (b.start_order?.length) {
    parts.push("Start order.");
    b.start_order.slice(0, 3).forEach((s, i) => {
      parts.push(`${i + 1}. ${s.lead_name}. ${s.reason}`);
    });
  }
  if (b.watch_for?.length) {
    parts.push("Watch for: " + b.watch_for.slice(0, 3).join("; ") + ".");
  }
  return parts.join(" ");
}

export function BriefingCard({
  isMobile, counts, totalEstimatedValue, overdueTaskTotal = 0, aiAvailable,
  topLeadIds = [], topLeads = [], onSelectLead,
}: BriefingCardProps) {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  // Header counts must reflect the leads actually sent to the briefing (top 10), not the full visible list.
  const briefingCounts = (() => {
    const c = { all: topLeads.length, hot: 0, warm: 0, cold: 0 };
    for (const l of topLeads) {
      const tags = (l.tags ?? []).map((t) => t.toLowerCase());
      const d = l.sellerDisposition;
      if (d === "Hit List" || tags.some((t) => /hit list|hot/.test(t))) c.hot++;
      else if (d === "Interested" || tags.some((t) => t === "interested")) c.warm++;
      else c.cold++;
    }
    return c;
  })();
  const taskPhrase = overdueTaskTotal > 0
    ? ` · ${overdueTaskTotal} overdue task${overdueTaskTotal !== 1 ? "s" : ""} across these leads`
    : "";
  const summary = briefingCounts.all === 0
    ? "No priority calls today. Sync your CRM or add a lead to get started."
    : `You have ${briefingCounts.all} priority call${briefingCounts.all !== 1 ? "s" : ""} today — ${briefingCounts.hot} hot, ${briefingCounts.warm} warm, ${briefingCounts.cold} cold follow-up${briefingCounts.cold !== 1 ? "s" : ""}. ${fmtPipeline(totalEstimatedValue)} estimated value${taskPhrase}.`;

  const [expanded, setExpanded] = useState(false);
  const { data, generatedAt, loading, error, generate, generatedForKey } = useDayBriefing();

  const currentKey = topLeadIds.length > 0 ? [...topLeadIds].sort().join("|") : "";
  const stale = !!data && generatedForKey !== null && generatedForKey !== currentKey;

  // Auto-regenerate when the top-10 lead set changes after an initial briefing exists.
  useEffect(() => {
    if (!stale || loading || topLeadIds.length === 0) return;
    generate(topLeadIds, false);
  }, [stale, loading, currentKey, topLeadIds, generate]);

  // One-time cache bust: first time this session loads the Today page after the
  // anti-hallucination fix, force a fresh briefing to evict any pre-fix cached entries.
  useEffect(() => {
    if (topLeadIds.length === 0 || loading) return;
    try {
      if (sessionStorage.getItem(BRIEFING_FORCE_FLAG)) return;
      sessionStorage.setItem(BRIEFING_FORCE_FLAG, "1");
    } catch { /* ignore */ }
    generate(topLeadIds, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  // Audio playback state
  const [audioState, setAudioState] = useState<"idle" | "preparing" | "playing" | "error">("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const handlePlay = async () => {
    if (audioState === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      setAudioState("idle");
      return;
    }
    setAudioError(null);
    setAudioState("preparing");
    try {
      let briefing = stale ? null : data;
      if (!briefing && topLeadIds.length > 0) {
        await generate(topLeadIds, false);
        // generate() updates state asynchronously; re-fetch directly via invoke for the script
        const { data: result, error: e } = await supabase.functions.invoke("generate-day-briefing", {
          body: { lead_ids: topLeadIds, force: false, tenant_id: tenantId, caller_hint: "briefing_card_playback" },
        });
        if (e) throw e;
        if (handleAiResponseError(result as any)) { setAudioState("idle"); return; }
        if (result?.error) throw new Error(result.error);
        briefing = result.briefing;
      }
      const script = briefing
        ? briefingToScript(briefing, summary)
        : summary;

      const { data: ttsResult, error: ttsErr } = await supabase.functions.invoke("tts-briefing", {
        body: { text: script, tenant_id: tenantId, caller_hint: "briefing_tts" },
      });
      if (ttsErr) throw ttsErr;
      if (handleAiResponseError(ttsResult as any)) { setAudioState("idle"); return; }
      if (ttsResult?.error) throw new Error(ttsResult.error);
      if (!ttsResult?.audioContent) throw new Error("No audio returned");

      const audio = new Audio(`data:${ttsResult.mime || "audio/mpeg"};base64,${ttsResult.audioContent}`);
      audioRef.current = audio;
      audio.onended = () => { setAudioState("idle"); audioRef.current = null; };
      audio.onerror = () => { setAudioState("error"); setAudioError("Audio playback failed"); };
      await audio.play();
      setAudioState("playing");
    } catch (err) {
      console.error("Briefing playback error:", err);
      setAudioError(err instanceof Error ? err.message : String(err));
      setAudioState("error");
    }
  };

  const handleToggle = async () => {
    if (data && !stale) {
      setExpanded((v) => !v);
      return;
    }
    setExpanded(true);
    await generate(topLeadIds, false);
  };

  const handleRegenerate = async () => {
    await generate(topLeadIds, true);
  };

  const playLabel =
    audioState === "preparing" ? "Preparing audio…" :
    audioState === "playing" ? "■ Stop" :
    "▶ Play briefing";
  const playDisabled = !aiAvailable || briefingCounts.all === 0 || audioState === "preparing";

  return (
    <div style={{
      background: COLORS.S1,
      border: "1px solid " + COLORS.B1,
      borderRadius: 14,
      padding: isMobile ? "14px 16px" : "18px 22px",
      marginBottom: 14,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        justifyContent: "space-between", flexWrap: isMobile ? "wrap" : "nowrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: COLORS.GRN, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            Daily Briefing
          </div>
          <div style={{ fontSize: isMobile ? 13 : 15, color: COLORS.TEXT, lineHeight: 1.5, fontWeight: 500 }}>
            {summary}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <button
            onClick={handlePlay}
            disabled={playDisabled}
            title={!aiAvailable ? "AI exhausted — see header" : audioState === "playing" ? "Stop playback" : "Play audio briefing"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: audioState === "playing" ? COLORS.GRN + "30" : aiAvailable ? COLORS.GRN + "15" : COLORS.S2,
              border: "1px solid " + (aiAvailable ? COLORS.GRN + "40" : COLORS.B2),
              borderRadius: 10,
              padding: "10px 14px",
              color: aiAvailable ? COLORS.GRN : COLORS.T3,
              fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
              cursor: playDisabled ? "default" : "pointer",
              opacity: playDisabled && audioState !== "preparing" ? 0.5 : 1,
            }}
          >
            {playLabel}
            {audioState === "idle" && <span style={{ fontSize: 10, opacity: 0.7 }}>(~30s)</span>}
          </button>
          <button
            onClick={handleToggle}
            disabled={briefingCounts.all === 0 || loading || topLeadIds.length === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: COLORS.S2,
              border: "1px solid " + COLORS.B2,
              borderRadius: 10,
              padding: "10px 14px",
              color: COLORS.TEXT,
              fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
              cursor: briefingCounts.all > 0 && !loading ? "pointer" : "default",
              opacity: briefingCounts.all > 0 && !loading ? 1 : 0.5,
            }}
          >
            {loading ? "Analyzing your day…" : data && expanded ? "Hide briefing" : "See full briefing"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: 12, fontSize: 12, color: COLORS.RED,
          background: COLORS.RED + "10", border: "1px solid " + COLORS.RED + "30",
          borderRadius: 8, padding: "8px 12px",
        }}>
          {error}
        </div>
      )}

      {audioError && (
        <div style={{
          marginTop: 12, fontSize: 12, color: COLORS.RED,
          background: COLORS.RED + "10", border: "1px solid " + COLORS.RED + "30",
          borderRadius: 8, padding: "8px 12px",
        }}>
          Audio: {audioError}
        </div>
      )}

      {expanded && data && onSelectLead && (
        <FullBriefingPanel
          briefing={data}
          generatedAt={generatedAt}
          leads={topLeads}
          onSelectLead={onSelectLead}
          onRegenerate={handleRegenerate}
          regenerating={loading}
        />
      )}
    </div>
  );
}