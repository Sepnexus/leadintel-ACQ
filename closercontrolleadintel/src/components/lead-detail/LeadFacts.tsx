import { COLORS } from "@/utils/leadUtils";
import type { Lead } from "@/data/leads";
import { fmtMoney, fmtPhone, relWhen, relWhenIso } from "./leadDetailUtils";

interface Props {
  lead: Lead;
}

export function LeadFacts({ lead }: Props) {
  const value = fmtMoney(lead.estimatedEquity ?? lead.marketValue ?? lead.value ?? null);
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

  const rows: { label: string; value: React.ReactNode }[] = [];
  if (lead.phone) {
    rows.push({
      label: "Phone",
      value: (
        <a href={`tel:${lead.phone}`} style={{ color: COLORS.BLU, textDecoration: "none" }}>
          {fmtPhone(lead.phone)}
        </a>
      ),
    });
  }
  if (lead.address) rows.push({ label: "Address", value: lead.address });
  if ((lead as any).county) rows.push({ label: "County", value: (lead as any).county });
  if (niche) rows.push({ label: "Niche", value: niche });
  if (value) rows.push({ label: "Est. value", value });
  if (lead.pipelineStageName || lead.stage)
    rows.push({ label: "Pipeline", value: lead.pipelineStageName || lead.stage });
  if (lead.sellerDisposition) rows.push({ label: "Disposition", value: lead.sellerDisposition });
  rows.push({ label: "Assigned to", value: lead.assignedTo || "Unassigned" });
  if (lead.lastContactAt) {
    rows.push({ label: "Last contact", value: relWhen(lead.daysSince ?? null) });
  } else if (lead.daysSince != null && lead.daysSince < 999) {
    rows.push({ label: "Last contact", value: relWhen(lead.daysSince) });
  }
  if ((lead as any).ghl_date_added)
    rows.push({ label: "Created", value: relWhenIso((lead as any).ghl_date_added) });

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
        Lead facts
      </div>
      <div
        style={{
          background: COLORS.S1,
          border: "1px solid " + COLORS.B1,
          borderRadius: 10,
          padding: "10px 14px",
          display: "grid",
          gridTemplateColumns: "minmax(90px,auto) 1fr",
          rowGap: 6,
          columnGap: 14,
        }}
      >
        {rows.map((r) => (
          <FactRow key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 11, color: COLORS.T3 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: COLORS.TEXT, wordBreak: "break-word" }}>{value}</div>
    </>
  );
}