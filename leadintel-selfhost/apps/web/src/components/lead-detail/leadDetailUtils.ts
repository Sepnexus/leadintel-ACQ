import type { Lead } from "@/data/leads";

export function fmtPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1"))
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

export function fmtMoney(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "k";
  return "$" + n;
}

export function relWhen(days: number | null | undefined): string {
  if (days == null || days >= 999) return "no contact";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function relWhenIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return relWhen(days);
}

function looksLikeAddress(s: string, address?: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (/^\d/.test(t)) return true;
  if (t.includes(",")) return true;
  if (address && t.toLowerCase() === address.trim().toLowerCase()) return true;
  return false;
}

export function resolveDisplayName(lead: Lead): { text: string; degraded: boolean } {
  const first = (lead.firstName || "").trim();
  const last = (lead.lastName || "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined && combined.toLowerCase() !== "unknown" && !looksLikeAddress(combined, lead.address)) {
    return { text: combined, degraded: false };
  }
  if (
    lead.name &&
    lead.name !== "Unknown" &&
    lead.firstName === undefined &&
    !looksLikeAddress(lead.name, lead.address)
  ) {
    return { text: lead.name, degraded: false };
  }
  if (lead.address) return { text: `(unnamed) ${lead.address}`, degraded: true };
  if (lead.phone) return { text: fmtPhone(lead.phone), degraded: true };
  return { text: "(no name)", degraded: true };
}

export type UrgencyTier = "hot" | "warm" | "cold";

export function tierForLead(lead: Lead): UrgencyTier {
  const tags = (lead.tags || []).map((t) => t.toLowerCase());
  if (tags.includes("hit list") || tags.includes("hot lead")) return "hot";
  const d = lead.sellerDisposition;
  if (d === "Hit List") return "hot";
  if (d === "Interested" || d === "Appointment Set" || d === "Offer Needed") return "warm";
  if (tags.includes("interested")) return "warm";
  if (lead.motivation === "urgent") return "hot";
  if (lead.motivation === "high") return "warm";
  return "cold";
}

export function buildRationale(lead: Lead): string {
  const tags = (lead.tags || []).map((t) => t.toLowerCase());
  const stage = lead.pipelineStageName || lead.stage;
  const rel = relWhen(lead.daysSince ?? null);
  if (tags.includes("hit list")) return `Tier 1 priority · last contact ${rel}`;
  if (tags.includes("interested")) return `Active conversation · ${stage}`;
  if (tags.includes("cold follow up")) return `Cold follow-up due · last contact ${rel}`;
  if (lead.sellerDisposition === "Hit List") return `Tier 1 priority · last contact ${rel}`;
  if (lead.sellerDisposition === "Interested") return `Active conversation · ${stage}`;
  if ((lead.daysSince ?? 999) >= 999) return `${stage || "New lead"} · never contacted`;
  return `${stage || "Lead"} · last contact ${rel}`;
}

export function fallbackOpeningLine(lead: Lead, repFirstName: string = "REPS"): string {
  const first = (lead.firstName || "").trim() || "there";
  const niche = lead.niche || lead.source;
  const address = lead.address || "your property";
  if (lead.sellerDisposition === "Hit List" || (lead.daysSince ?? 999) <= 7) {
    return `Hi ${first}, following up on our recent conversation — wanted to see if you've had a chance to think things over.`;
  }
  if (niche === "auction" || lead.source === "Auction") {
    return `Hi ${first}, calling about ${address} — I see the auction date is coming up and wanted to see if you'd be open to discussing options before then.`;
  }
  if (niche === "probate" || lead.source === "Probate") {
    return `Hi ${first}, this is ${repFirstName} — I came across the property at ${address} and wanted to reach out about it.`;
  }
  return `Hi ${first}, this is ${repFirstName} — wanted to reach out about ${address} and see if now's a good time to talk.`;
}