export interface NextStep {
  action: string;
  reason: string;
}

export interface LeadSignals {
  price_sensitivity?: "high" | "medium" | "low" | "unknown";
  financing_openness?: "open" | "resistant" | "unknown";
  urgency?: "high" | "medium" | "low" | "unknown";
  blockers?: string[];
  last_seller_intent?: string;
}

export interface LeadIntelligence {
  ghl_contact_id: string;
  rationale: string | null;
  opening_line: string | null;
  next_steps: NextStep[] | null;
  signals: LeadSignals | null;
  message_count: number | null;
  last_message_at: string | null;
  model: string | null;
  generated_at: string;
  stale: boolean;
}