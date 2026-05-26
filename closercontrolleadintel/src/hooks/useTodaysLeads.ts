import { useMemo } from "react";
import type { Lead } from "@/data/leads";

export type UrgencyTier = "hot" | "warm" | "cold";

export interface ScoredLead {
  lead: Lead;
  score: number;
  tier: UrgencyTier;
  rationale: string;
}

function hasTag(lead: Lead, name: string): boolean {
  if (!lead.tags) return false;
  const target = name.toLowerCase();
  return lead.tags.some((t) => t.toLowerCase() === target);
}

function tierFor(lead: Lead, score: number): UrgencyTier {
  const temp = (lead.seller_temperature ?? "").toLowerCase();
  const disp = (lead.seller_disposition ?? lead.sellerDisposition ?? "").toLowerCase();
  if (
    score >= 150 ||
    temp === "hot" ||
    disp === "hit list" ||
    disp === "interested" ||
    disp === "offer needed"
  ) {
    return "hot";
  }
  if (score >= 50) return "warm";
  return "cold";
}

function relativeWhen(days: number | null): string {
  if (days == null) return "never contacted";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function buildRationale(lead: Lead): string {
  const rel = relativeWhen(lead.daysSince ?? null);
  const niche = lead.source && lead.source !== "Unknown" ? lead.source : null;
  const stage = lead.pipelineStageName || lead.stage;

  // Inbound reply recency takes precedence — it's the strongest "call now" signal.
  if (lead.lastInboundAt) {
    const replyDays = Math.floor((Date.now() - new Date(lead.lastInboundAt).getTime()) / 86_400_000);
    if (replyDays <= 7) {
      const replyRel = replyDays <= 0 ? "today" : replyDays === 1 ? "yesterday" : `${replyDays}d ago`;
      return `Replied ${replyRel} · ${lead.sellerDisposition ?? stage ?? "lead"}`;
    }
  }

  let base: string;
  if (hasTag(lead, "hit list")) base = `Tier 1 priority · last contact ${rel}`;
  else if (hasTag(lead, "interested")) base = `Active conversation · ${stage}`;
  else if (hasTag(lead, "00000 error"))
    base = `SMS-incapable phone — call only${niche ? ` · ${niche}` : ""}`;
  else if (lead.sellerDisposition === "Hit List") base = `Tier 1 priority · last contact ${rel}`;
  else if (lead.sellerDisposition === "Interested") base = `Active conversation · ${stage}`;
  else if ((lead.daysSince ?? 999) >= 999) base = `${stage || niche || "New lead"} · never contacted`;
  else base = `${stage || niche || "Lead"} · last contact ${rel}`;

  const overdue = lead.overdueTaskCount ?? 0;
  const open = lead.openTaskCount ?? 0;
  if (overdue > 0) {
    return `${overdue} overdue task${overdue !== 1 ? "s" : ""} · ${base}`;
  }
  if (open > 0) {
    return `${base} · ${open} open task${open !== 1 ? "s" : ""}`;
  }
  return base;
}

const scoreFor = (lead: Lead): number => {
  let score = 0;
  let weight3Count = 0;

  // ── DISPOSITION (Weight-3) ──
  const disp = (lead.seller_disposition ?? lead.sellerDisposition ?? "").toLowerCase();
  if (disp === "hit list")              { score += 100; weight3Count++; }
  else if (disp === "offer needed")     { score += 90;  weight3Count++; }
  else if (disp === "interested")       { score += 80;  weight3Count++; }
  else if (disp === "cold follow up")   score += 10;
  else if (disp === "bad number")       score -= 100;
  else if (disp === "not interested")   score -= 100;
  else if (disp === "already sold")     score -= 50;
  else if (disp === "under contract")   score -= 50;
  else if (disp === "offer delivered")  score -= 30;
  else if (disp === "appointment set")  score -= 20;

  // ── TAGS (supplement disposition) ──
  const tags = lead.tags?.map((t) => t.toLowerCase()) ?? [];
  if (tags.includes("hit list") && disp !== "hit list") { score += 100; weight3Count++; }
  if (tags.includes("interested") && disp !== "interested") { score += 80; weight3Count++; }
  if (tags.includes("need cold call")) score += 30;
  if (tags.includes("not interested")) score -= 100;
  if (tags.includes("00000 error"))    score -= 50;

  // ── SELLER TEMPERATURE (Weight-3) ──
  const temp = (lead.seller_temperature ?? "").toLowerCase();
  if (temp === "hot")       { score += 100; weight3Count++; }
  else if (temp === "warm") score += 40;
  else if (temp === "cold") score -= 20;

  // ── FOLLOW UP DUE DATE (Weight-3) ──
  if (lead.follow_up_due_date) {
    const daysUntilDue = Math.floor(
      (new Date(lead.follow_up_due_date).getTime() - Date.now()) / 86_400_000
    );
    if (daysUntilDue < 0)        { score += 80; weight3Count++; }
    else if (daysUntilDue === 0) { score += 60; weight3Count++; }
    else if (daysUntilDue <= 7)  score += 30;
  }

  // ── LAST OFFER DATE (Weight-3) ──
  if (lead.last_offer_date) {
    const daysSinceOffer = Math.floor(
      (Date.now() - new Date(lead.last_offer_date).getTime()) / 86_400_000
    );
    if (daysSinceOffer >= 7 && daysSinceOffer <= 14)      { score += 50; weight3Count++; }
    else if (daysSinceOffer > 14 && daysSinceOffer <= 30) { score += 70; weight3Count++; }
    else if (daysSinceOffer > 30)                         { score += 40; weight3Count++; }
  }

  // ── LAST OFFER FEEDBACK (Weight-3) ──
  const feedback = (lead.last_offer_feedback ?? "").toLowerCase();
  if (feedback && /interest|wait|negotiat|still|consider|think|maybe|possibly/.test(feedback)) {
    score += 80;
    weight3Count++;
  }

  // ── NICHE MOTIVATION (Weight-3) ──
  const niche = (lead.niche_motivation ?? lead.niche ?? "").toLowerCase();
  if (niche.includes("pre-foreclosure") || niche.includes("foreclosure")) {
    score += 60; weight3Count++;
  } else if (niche.includes("auction")) {
    score += 40; weight3Count++;
  } else if (niche.includes("probate")) {
    score += 20;
  }

  // ── TIMELINE (Weight-3) ──
  const timeline = (lead.timeline ?? "").toLowerCase();
  if (timeline && /urgent|asap|immediately|now|soon|this month/.test(timeline)) {
    score += 60; weight3Count++;
  } else if (timeline) {
    score += 20;
  }

  // ── MOTIVATION (Weight-3) — raw GHL custom field ──
  if (lead.motivation_text) { score += 30; weight3Count++; }

  // ── ASKING PRICE (Weight-3) ──
  if (lead.asking_price) { score += 20; weight3Count++; }

  // ── CONDITION (Weight-3) ──
  if (lead.condition) { score += 15; weight3Count++; }

  // ── LEAD IDENTITY (Weight-3) ──
  if (lead.lead_identity) { score += 20; weight3Count++; }

  // ── SELLER NOTE (Weight-3) ──
  if (lead.seller_note) { score += 25; weight3Count++; }

  // ── CAMPAIGN NAME ──
  if (lead.campaign_name) score += 10;

  // ── LEAD SOURCE ──
  if (lead.lead_source) score += 10;

  // ── LAST OFFER MADE (Weight-2) ──
  if (lead.last_offer_made) score += 20;

  // ── LAST OFFER TYPE (Weight-2) ──
  if (lead.last_offer_type) score += 15;

  // ── TASKS (Weight-3) ──
  const overdueTasks = lead.tasks?.filter((t) => t.is_overdue) ?? [];
  const openTasks = lead.tasks?.filter((t) => !t.is_overdue) ?? [];
  if (overdueTasks.length > 0) { score += 40; weight3Count++; }
  else if (openTasks.length > 0) score += 15;

  // ── NOTES (Weight-3) ──
  if (lead.has_notes) { score += 30; weight3Count++; }

  // ── CONVERSATION RECENCY (Weight-3) ──
  if (lead.last_contact_days != null) {
    if (lead.last_contact_days === 0)       score += 40;
    else if (lead.last_contact_days === 1)  score += 35;
    else if (lead.last_contact_days <= 3)   score += 25;
    else if (lead.last_contact_days <= 7)   { score += 20; weight3Count++; }
    else if (lead.last_contact_days <= 14)  score += 10;
    else if (lead.last_contact_days > 30)   score -= 10;
  }

  // ── AUCTION DATE urgency ──
  if (lead.auction_date) {
    const daysToAuction = Math.floor(
      (new Date(lead.auction_date).getTime() - Date.now()) / 86_400_000
    );
    if (daysToAuction >= 0 && daysToAuction <= 7) { score += 150; weight3Count++; }
    else if (daysToAuction <= 30)                 { score += 60;  weight3Count++; }
  }

  // ── COMPOUND STACKING ──
  if (weight3Count >= 5)      score = Math.round(score * 2.0);
  else if (weight3Count >= 3) score = Math.round(score * 1.5);

  return score;
};

export function useTodaysLeads(allLeads: Lead[], topN: number = 10): {
  scored: ScoredLead[];
  counts: { all: number; hot: number; warm: number; cold: number };
  totalEstimatedValue: number;
} {
  return useMemo(() => {
    const ranked = allLeads
      .map((lead) => {
        const score = scoreFor(lead);
        return { lead, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // tie-break: most-recent contact first (lower daysSince wins)
        const ad = a.lead.daysSince ?? 999;
        const bd = b.lead.daysSince ?? 999;
        return ad - bd;
      })
      .slice(0, topN);

    const scored: ScoredLead[] = ranked.map(({ lead, score }) => ({
      lead,
      score,
      tier: tierFor(lead, score),
      rationale: buildRationale(lead),
    }));

    const counts = { all: scored.length, hot: 0, warm: 0, cold: 0 };
    let totalEstimatedValue = 0;
    for (const s of scored) {
      counts[s.tier]++;
      totalEstimatedValue += s.lead.estimatedEquity ?? s.lead.marketValue ?? 0;
    }
    return { scored, counts, totalEstimatedValue };
  }, [allLeads, topN]);
}