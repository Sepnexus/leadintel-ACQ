import { useEffect } from "react";
import { COLORS } from "@/utils/leadUtils";
import type { Lead } from "@/data/leads";
import { useLeadDetail } from "@/hooks/useLeadDetail";
import { useLeadIntelligence } from "@/hooks/useLeadIntelligence";
import { resolveDisplayName, tierForLead, fmtPhone } from "./leadDetailUtils";
import { RationaleCard } from "./RationaleCard";
import { OpeningLineCard } from "./OpeningLineCard";
import { LeadFacts } from "./LeadFacts";
import { TagList } from "./TagList";
import { ConversationSummary } from "./ConversationSummary";
import { CallHistoryStub } from "./CallHistoryStub";
import { OpenInGhlLink } from "./OpenInGhlLink";
import { NextStepsCard } from "./NextStepsCard";
import { SignalsCard } from "./SignalsCard";
import { OpenTasksCard } from "./OpenTasksCard";
import { CallNotesCard } from "./CallNotesCard";

interface Props {
  lead: Lead | null;
  isMobile: boolean;
  aiAvailable: boolean;
  onClose: () => void;
}

const TIER_META = {
  hot: { color: COLORS.RED, icon: "🔥", label: "Hot" },
  warm: { color: COLORS.AMB, icon: "🌤", label: "Warm" },
  cold: { color: COLORS.T3, icon: "❄", label: "Cold" },
} as const;

export function LeadDetailPanel({ lead, isMobile, aiAvailable, onClose }: Props) {
  const open = !!lead;
  const { conversation, tasks, loading: convLoading } = useLeadDetail(lead?.ghlContactId ?? null);
  const { intelligence, refreshing, regenerate } = useLeadIntelligence(lead?.ghlContactId ?? null);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!lead) return null;

  const name = resolveDisplayName(lead);
  const tier = tierForLead(lead);
  const tm = TIER_META[tier];
  const niche =
    lead.niche === "probate"
      ? "Probate"
      : lead.niche === "auction"
      ? "Auction"
      : lead.niche === "pre-foreclosure"
      ? "Pre-foreclosure"
      : lead.source && lead.source !== "Unknown"
      ? lead.source
      : null;
  const stage = lead.pipelineStageName || lead.stage;

  return (
    <>
      {/* Backdrop — dims but doesn't block clicks on underlying list */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 400,
          animation: "fadeIn .15s ease-out",
        }}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Lead details"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: isMobile ? "100vw" : 480,
          maxWidth: "100vw",
          background: COLORS.BG,
          borderLeft: "1px solid " + COLORS.B1,
          zIndex: 401,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.5)",
          animation: "slideInRight .22s ease-out",
        }}
      >
        {/* Sticky header */}
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid " + COLORS.B1,
            background: COLORS.BG,
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: COLORS.TEXT,
                  fontStyle: name.degraded ? "italic" : "normal",
                  opacity: name.degraded ? 0.85 : 1,
                  fontFamily: "'League Spartan', sans-serif",
                  lineHeight: 1.25,
                  marginBottom: 4,
                  wordBreak: "break-word",
                }}
              >
                {name.text}
              </div>
              <div style={{ fontSize: 13, color: COLORS.T2, lineHeight: 1.4 }}>
                {[lead.phone ? fmtPhone(lead.phone) : null, niche, stage]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: tm.color + "18",
                color: tm.color,
                border: "1px solid " + tm.color + "40",
                borderRadius: 999,
                padding: "2px 9px",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                flexShrink: 0,
              }}
            >
              <span>{tm.icon}</span>
              {tm.label}
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: COLORS.S1,
                border: "1px solid " + COLORS.B1,
                borderRadius: 8,
                width: 32,
                height: 32,
                color: COLORS.TEXT,
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.B1;
                e.currentTarget.style.borderColor = COLORS.T3;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.S1;
                e.currentTarget.style.borderColor = COLORS.B1;
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>
          <RationaleCard
            lead={lead}
            aiAvailable={aiAvailable}
            override={intelligence?.rationale}
            onRegenerate={regenerate}
            refreshing={refreshing}
            modelLabel={intelligence?.model}
          />
          <OpeningLineCard
            lead={lead}
            aiAvailable={aiAvailable}
            override={intelligence?.opening_line}
          />
          <NextStepsCard steps={intelligence?.next_steps} />
          <CallNotesCard
            ghlContactId={lead.ghlContactId ?? null}
            refreshKey={intelligence?.generated_at ?? null}
          />
          <LeadFacts lead={lead} />
          <OpenTasksCard tasks={tasks} />
          <TagList tags={lead.tags} />
          <SignalsCard signals={intelligence?.signals} />
          <ConversationSummary
            conversation={conversation}
            loading={convLoading}
            ghlContactId={lead.ghlContactId ?? null}
          />
          <CallHistoryStub />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid " + COLORS.B1,
            background: COLORS.BG,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 10, color: COLORS.T3 }}>Read-only · ESC to close</span>
          <OpenInGhlLink ghlContactId={lead.ghlContactId} />
        </div>
      </aside>
    </>
  );
}