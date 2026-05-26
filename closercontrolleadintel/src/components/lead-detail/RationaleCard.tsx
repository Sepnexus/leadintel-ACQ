import { COLORS } from "@/utils/leadUtils";
import type { Lead } from "@/data/leads";
import { buildRationale, relWhen } from "./leadDetailUtils";

interface Props {
  lead: Lead;
  aiAvailable: boolean;
  override?: string | null;
  onRegenerate?: () => void;
  refreshing?: boolean;
  modelLabel?: string | null;
}

export function RationaleCard({ lead, aiAvailable, override, onRegenerate, refreshing, modelLabel }: Props) {
  const rationale = override && override.trim() ? override.trim() : buildRationale(lead);
  const usingAi = !!(override && override.trim()) && modelLabel !== "rule-based-fallback";
  const stage = lead.pipelineStageName || lead.stage;
  const tags = (lead.tags || []).slice(0, 4);

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            color: COLORS.GRN,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          Why call this lead
          {refreshing && <span style={{ color: COLORS.T3, marginLeft: 6 }}>· refreshing…</span>}
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={refreshing}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.T3,
              fontSize: 10,
              cursor: refreshing ? "default" : "pointer",
              fontFamily: "inherit",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            ↻ Regenerate
          </button>
        )}
      </div>
      <div
        style={{
          background: COLORS.GRN + "10",
          border: "1px solid " + COLORS.GRN + "30",
          borderRadius: 10,
          padding: "12px 14px",
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.TEXT, lineHeight: 1.5, marginBottom: 8 }}>
          {rationale}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <SignalChip label={`Stage: ${stage}`} />
          <SignalChip label={`Last contact: ${relWhen(lead.daysSince ?? null)}`} />
          {tags.map((t) => (
            <SignalChip key={t} label={t} />
          ))}
        </div>
        {!usingAi && (
          <div style={{ fontSize: 10, color: COLORS.T3, marginTop: 8, fontStyle: "italic" }}>
            {aiAvailable ? "Rule-based — AI rationale unavailable" : "Rule-based"}
          </div>
        )}
      </div>
    </div>
  );
}

function SignalChip({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: COLORS.T2,
        border: "1px solid " + COLORS.B2,
        background: COLORS.S2,
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {label}
    </span>
  );
}