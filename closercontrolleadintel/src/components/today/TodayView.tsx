import { useEffect, useState } from "react";
import type { Lead } from "@/data/leads";
import { useTodaysLeads, type UrgencyTier } from "@/hooks/useTodaysLeads";
import { HeaderStrip, type AiStatus } from "./HeaderStrip";
import { BriefingCard } from "./BriefingCard";
import { FilterChips, type ChipFilter } from "./FilterChips";
import { TodayLeadRow } from "./LeadRow";
import { COLORS } from "@/utils/leadUtils";

interface TodayViewProps {
  leads: Lead[];
  isMobile: boolean;
  reps: string[];
  repFilter: string;
  onRepChange: (v: string) => void;
  onAddLead: () => void;
  onSelectLead: (lead: Lead) => void;
  aiStatus: AiStatus;
  loading: boolean;
  userMenu?: React.ReactNode;
}

export function TodayView({
  leads, isMobile, reps, repFilter, onRepChange, onAddLead, onSelectLead, aiStatus, loading, userMenu,
}: TodayViewProps) {
  const [filter, setFilter] = useState<ChipFilter>("all");
  const [showCount, setShowCount] = useState(10);

  // Defensive cleanup of stale demo cache (one-time per mount).
  useEffect(() => { try { localStorage.removeItem("leadIntel_leads"); } catch {} }, []);

  const { scored, counts, totalEstimatedValue } = useTodaysLeads(leads, showCount);
  const overdueTaskTotal = scored.reduce((sum, s) => sum + (s.lead.overdueTaskCount ?? 0), 0);
  const visible = filter === "all" ? scored : scored.filter((s) => s.tier === (filter as UrgencyTier));
  const aiAvailable = aiStatus === "ready";
  const top10 = scored.slice(0, 10).map((s) => s.lead);
  const top10Ids = top10.map((l) => l.ghlContactId).filter((x): x is string => !!x);

  return (
    <div>
      <HeaderStrip
        isMobile={isMobile}
        reps={reps}
        repFilter={repFilter}
        onRepChange={onRepChange}
        onAddLead={onAddLead}
        aiStatus={aiStatus}
        userMenu={userMenu}
      />

      <BriefingCard
        isMobile={isMobile}
        counts={counts}
        totalEstimatedValue={totalEstimatedValue}
        overdueTaskTotal={overdueTaskTotal}
        aiAvailable={aiAvailable}
        topLeadIds={top10Ids}
        topLeads={top10}
        onSelectLead={onSelectLead}
      />

      <FilterChips counts={counts} active={filter} onChange={setFilter} />

      {loading && scored.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              height: 56, borderRadius: 10, background: COLORS.S1,
              border: "1px solid " + COLORS.B1,
              animation: "pulse-glow 1.6s ease-in-out " + i * 0.12 + "s infinite",
            }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12,
          padding: "32px 20px", textAlign: "center", color: COLORS.T3, fontSize: 12,
        }}>
          No leads in this filter.
        </div>
      ) : (
        <>
          {visible.map((s, idx) => (
            <TodayLeadRow
              key={s.lead.id}
              lead={s.lead}
              rank={idx + 1}
              tier={s.tier}
              rationale={s.rationale}
              isMobile={isMobile}
              onClick={() => onSelectLead(s.lead)}
            />
          ))}
          {scored.length === showCount && leads.length > showCount && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button
                onClick={() => setShowCount((n) => n + 10)}
                style={{
                  background: "transparent", border: "1px solid " + COLORS.B2,
                  borderRadius: 8, padding: "6px 14px", color: COLORS.T2,
                  fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Show 10 more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}