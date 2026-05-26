import { COLORS } from "@/utils/leadUtils";
import type { Lead } from "@/data/leads";
import type { UrgencyTier } from "@/hooks/useTodaysLeads";

interface TodayLeadRowProps {
  lead: Lead;
  rank: number;
  tier: UrgencyTier;
  rationale: string;
  isMobile: boolean;
  onClick: () => void;
}

const TIER_META: Record<UrgencyTier, { color: string; icon: string; label: string }> = {
  hot: { color: COLORS.RED, icon: "🔥", label: "Hot" },
  warm: { color: COLORS.AMB, icon: "🌤", label: "Warm" },
  cold: { color: COLORS.T3, icon: "❄", label: "Cold" },
};

function fmtVal(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  return "$" + Math.round(n / 1_000) + "k";
}

function relWhen(days: number | null | undefined): string {
  if (days == null || days >= 999) return "no contact";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

function looksLikeAddress(s: string, address?: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (/^\d/.test(t)) return true;
  if (t.includes(",")) return true;
  if (address && t.toLowerCase() === address.trim().toLowerCase()) return true;
  return false;
}

function resolveDisplayName(lead: Lead): { text: string; degraded: boolean } {
  const first = (lead.firstName || "").trim();
  const last = (lead.lastName || "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined && combined.toLowerCase() !== "unknown" && !looksLikeAddress(combined, lead.address)) {
    return { text: combined, degraded: false };
  }
  // legacy fallback for already-mapped leads where name might already be set
  if (lead.name && lead.name !== "Unknown" && lead.firstName === undefined && !looksLikeAddress(lead.name, lead.address)) {
    return { text: lead.name, degraded: false };
  }
  if (lead.address) return { text: `(unnamed) ${lead.address}`, degraded: true };
  if (lead.phone) return { text: formatPhone(lead.phone), degraded: true };
  return { text: "(no name)", degraded: true };
}

export function TodayLeadRow({ lead, rank, tier, rationale, isMobile, onClick }: TodayLeadRowProps) {
  const meta = TIER_META[tier];
  const name = resolveDisplayName(lead);
  const value = fmtVal(lead.estimatedEquity ?? lead.marketValue ?? lead.value ?? null);
  const niche = lead.source && lead.source !== "Unknown" ? lead.source : null;
  const overdue = lead.overdueTaskCount ?? 0;

  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.S2; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.S1; }}
      style={{
        background: COLORS.S1,
        border: "1px solid " + COLORS.B1,
        borderLeft: "3px solid " + meta.color,
        borderRadius: 10,
        padding: isMobile ? "10px 12px" : "12px 16px",
        marginBottom: 6,
        cursor: "pointer",
        transition: "background .12s",
        display: "grid",
        gridTemplateColumns: isMobile ? "26px 1fr auto" : "32px 1fr auto",
        gap: isMobile ? 10 : 14,
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 12, color: COLORS.T3, fontWeight: 500 }} className="font-mono">
        #{rank}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 15, fontWeight: 600, color: COLORS.TEXT,
              fontStyle: name.degraded ? "italic" : "normal",
              opacity: name.degraded ? 0.85 : 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? 180 : 320,
            }}
          >
            {name.text}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: meta.color + "18", color: meta.color,
            border: "1px solid " + meta.color + "40",
            borderRadius: 999, padding: "1px 8px",
            fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
          }}>
            <span>{meta.icon}</span>{meta.label}
          </span>
          {niche && !isMobile && (
            <span style={{
              marginLeft: "auto",
              fontSize: 9.5, color: COLORS.T3,
              border: "1px solid " + COLORS.B2, borderRadius: 4,
              padding: "1px 6px",
              textTransform: "uppercase", letterSpacing: 0.4,
            }}>{niche}</span>
          )}
          {overdue > 0 && (
            <span
              title={`${overdue} overdue task${overdue !== 1 ? "s" : ""}`}
              style={{
                marginLeft: niche && !isMobile ? 0 : "auto",
                fontSize: 9.5, fontWeight: 700,
                color: COLORS.RED,
                background: COLORS.RED + "18",
                border: "1px solid " + COLORS.RED + "40",
                borderRadius: 4,
                padding: "1px 6px",
                letterSpacing: 0.4,
              }}
            >
              !{overdue}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11.5, color: COLORS.T2, lineHeight: 1.5,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {rationale}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {value && (
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.GRN, marginBottom: 2 }}>
            {value}
          </div>
        )}
        <div style={{ fontSize: 10, color: COLORS.T3 }}>
          {relWhen(lead.daysSince)}
        </div>
      </div>
    </div>
  );
}