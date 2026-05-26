import { COLORS } from "@/utils/leadUtils";
import type { LeadSignals } from "@/lib/leadIntelligenceTypes";

interface Props {
  signals: LeadSignals | null | undefined;
}

const LEVEL_COLORS: Record<string, string> = {
  high: COLORS.RED,
  medium: COLORS.AMB,
  low: COLORS.GRN,
  open: COLORS.GRN,
  resistant: COLORS.RED,
};

function chipColor(value: string) {
  return LEVEL_COLORS[value] ?? COLORS.T2;
}

export function SignalsCard({ signals }: Props) {
  if (!signals) return null;
  const chips: { label: string; value: string }[] = [];
  if (signals.price_sensitivity && signals.price_sensitivity !== "unknown")
    chips.push({ label: "Price sensitivity", value: signals.price_sensitivity });
  if (signals.financing_openness && signals.financing_openness !== "unknown")
    chips.push({ label: "Financing", value: signals.financing_openness });
  if (signals.urgency && signals.urgency !== "unknown")
    chips.push({ label: "Urgency", value: signals.urgency });
  if (
    signals.last_seller_intent &&
    signals.last_seller_intent !== "unknown" &&
    signals.last_seller_intent.trim()
  )
    chips.push({ label: "Seller intent", value: signals.last_seller_intent });

  const blockers = (signals.blockers ?? []).filter(Boolean);
  if (chips.length === 0 && blockers.length === 0) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: COLORS.T3,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Signals
      </div>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: blockers.length ? 10 : 0 }}>
          {chips.map((c, i) => {
            const col = chipColor(c.value);
            return (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  background: col + "18",
                  color: col,
                  border: "1px solid " + col + "33",
                  borderRadius: 999,
                  padding: "3px 9px",
                  textTransform: "capitalize",
                }}
              >
                <span style={{ color: COLORS.T3, marginRight: 4, textTransform: "none" }}>
                  {c.label}:
                </span>
                {c.value}
              </span>
            );
          })}
        </div>
      )}
      {blockers.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              color: COLORS.T3,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 4,
            }}
          >
            Blockers
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, color: COLORS.T2, fontSize: 12.5, lineHeight: 1.5 }}>
            {blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}