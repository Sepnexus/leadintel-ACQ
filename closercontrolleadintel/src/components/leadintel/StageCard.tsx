import { COLORS, stageColor, fmt$ } from "@/utils/leadUtils";

interface StageCardProps {
  stage: string;
  count: number;
  totalValue: number;
  active: boolean;
  onClick: () => void;
}

export function StageCard({ stage, count, totalValue, active, onClick }: StageCardProps) {
  const sc = stageColor(stage);
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 148,
        maxWidth: 160,
        background: active ? COLORS.S2 : COLORS.S1,
        border: "1px solid " + (active ? sc + "40" : COLORS.B1),
        borderLeft: "3px solid " + sc,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all .15s",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: sc,
          marginBottom: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {stage}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div
          style={{ fontSize: 22, fontWeight: 900, color: count > 0 ? COLORS.TEXT : COLORS.T3, lineHeight: 1 }}
          className="font-mono"
        >
          {count}
        </div>
        <div style={{ fontSize: 10, color: COLORS.T3, fontWeight: 500 }}>{fmt$(totalValue)}</div>
      </div>
    </div>
  );
}
