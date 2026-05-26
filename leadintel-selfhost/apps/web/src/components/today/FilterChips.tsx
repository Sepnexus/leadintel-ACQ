import { COLORS } from "@/utils/leadUtils";
import type { UrgencyTier } from "@/hooks/useTodaysLeads";

export type ChipFilter = "all" | UrgencyTier;

interface FilterChipsProps {
  counts: { all: number; hot: number; warm: number; cold: number };
  active: ChipFilter;
  onChange: (f: ChipFilter) => void;
}

const CHIP_DEFS: { key: ChipFilter; label: string; icon?: string; color: string }[] = [
  { key: "all", label: "All", color: COLORS.T2 },
  { key: "hot", label: "Hot", icon: "🔥", color: COLORS.RED },
  { key: "warm", label: "Warm", icon: "🌤", color: COLORS.AMB },
  { key: "cold", label: "Cold", icon: "❄", color: COLORS.T3 },
];

export function FilterChips({ counts, active, onChange }: FilterChipsProps) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
      {CHIP_DEFS.map((c) => {
        const count = counts[c.key as keyof typeof counts];
        if (c.key !== "all" && !count) return null;
        // Hide tier chips that would be identical to "All" (e.g. all top leads are hot).
        if (c.key !== "all" && count === counts.all) return null;
        const isActive = active === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onChange(c.key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: isActive ? c.color + "18" : "transparent",
              border: "1px solid " + (isActive ? c.color + "55" : COLORS.B1),
              borderRadius: 999,
              padding: "5px 12px",
              color: isActive ? c.color : COLORS.T2,
              fontSize: 11, fontWeight: isActive ? 600 : 400,
              cursor: "pointer", fontFamily: "inherit", transition: "all .12s",
            }}
          >
            {c.icon && <span>{c.icon}</span>}
            <span>{c.label}</span>
            <span className="font-mono" style={{ opacity: 0.7 }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}