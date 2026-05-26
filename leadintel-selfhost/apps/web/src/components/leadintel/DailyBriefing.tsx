import { COLORS } from "@/utils/leadUtils";
import type { DailyBriefingData } from "@/data/leads";

interface DailyBriefingProps {
  briefing: DailyBriefingData | null;
  isMobile: boolean;
  onReplay?: () => void;
  showReplay?: boolean;
}

export function DailyBriefing({ briefing, isMobile, onReplay, showReplay }: DailyBriefingProps) {
  if (!briefing) return null;
  return (
    <div
      style={{
        background: COLORS.S1,
        border: "1px solid " + COLORS.B1,
        borderRadius: 14,
        padding: isMobile ? "14px 16px" : "20px 22px",
        marginBottom: 18,
      }}
    >
      {briefing.greeting && (
        <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: COLORS.TEXT, marginBottom: 10 }}>
          {briefing.greeting}
        </div>
      )}
      {briefing.bullets && briefing.bullets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: briefing.criticalAlert ? 12 : 0 }}>
          {briefing.bullets.map((bullet, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: COLORS.GRN,
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              <span style={{ fontSize: isMobile ? 11.5 : 12.5, color: COLORS.T2, lineHeight: 1.6 }}>{bullet}</span>
            </div>
          ))}
        </div>
      )}
      {briefing.criticalAlert && (
        <div
          style={{
            background: COLORS.RED + "08",
            border: "1px solid " + COLORS.RED + "30",
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginTop: isMobile ? 10 : 4,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: COLORS.RED,
              flexShrink: 0,
              marginTop: 3,
              animation: "pulse-glow 1.5s infinite",
            }}
          />
          <span style={{ fontSize: isMobile ? 11 : 12, color: COLORS.RED, lineHeight: 1.6, fontWeight: 500 }}>
            {briefing.criticalAlert}
          </span>
        </div>
      )}
      {showReplay && onReplay && (
        <div style={{ marginTop: 12, borderTop: "1px solid " + COLORS.B1, paddingTop: 10 }}>
          <button
            onClick={onReplay}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.T3,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: 0,
            }}
          >
            ▶ Replay briefing
          </button>
        </div>
      )}
    </div>
  );
}
