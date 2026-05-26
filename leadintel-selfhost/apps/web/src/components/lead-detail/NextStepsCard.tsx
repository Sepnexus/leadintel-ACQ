import { COLORS } from "@/utils/leadUtils";
import type { NextStep } from "@/lib/leadIntelligenceTypes";

interface Props {
  steps: NextStep[] | null | undefined;
}

export function NextStepsCard({ steps }: Props) {
  if (!steps || steps.length === 0) return null;
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
        Suggested next steps
      </div>
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {steps.slice(0, 3).map((s, i) => (
          <li
            key={i}
            style={{
              background: COLORS.S1,
              border: "1px solid " + COLORS.B1,
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: COLORS.GRN + "22",
                color: COLORS.GRN,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.TEXT, lineHeight: 1.4 }}>
                {s.action}
              </div>
              {s.reason && (
                <div style={{ fontSize: 12, color: COLORS.T3, marginTop: 3, lineHeight: 1.45 }}>
                  {s.reason}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}