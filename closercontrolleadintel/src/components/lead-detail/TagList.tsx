import { COLORS } from "@/utils/leadUtils";

interface Props {
  tags: string[] | undefined;
}

export function TagList({ tags }: Props) {
  if (!tags || tags.length === 0) return null;
  const sorted = [...tags].sort((a, b) => a.localeCompare(b));
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
        Tags
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {sorted.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10.5,
              color: COLORS.T2,
              background: COLORS.S2,
              border: "1px solid " + COLORS.B2,
              borderRadius: 999,
              padding: "3px 9px",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}