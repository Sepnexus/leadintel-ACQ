// Color constants
export const COLORS = {
  BG: "#000000",
  S1: "#0a0a0a",
  S2: "#111111",
  S3: "#1a1a1a",
  B1: "#1f1f1f",
  B2: "#2a2a2a",
  B3: "#333333",
  TEXT: "#f4f4f4",
  T2: "#959595",
  T3: "#565656",
  GRN: "#4e7d3d",
  GRNL: "#5a9147",
  GRND: "#3a6030",
  RED: "#f04444",
  AMB: "#f5a623",
  BLU: "#4a9eff",
  PRP: "#a78bfa",
};

export function urgencyColor(u: string) {
  if (u === "hot") return COLORS.RED;
  if (u === "warm") return COLORS.AMB;
  return COLORS.T3;
}

export function urgencyLabel(u: string) {
  if (u === "hot") return "HOT";
  if (u === "warm") return "WARM";
  return "COLD";
}

export function stageColor(s: string) {
  if (s === "New Lead") return COLORS.GRN;
  if (s === "Contacted") return "#c084fc";
  if (s === "Interested / Warm") return COLORS.AMB;
  if (s === "Appointment Set") return COLORS.BLU;
  if (s === "Needs Underwriting") return "#34d399";
  if (s === "Offer Sent") return COLORS.BLU;
  if (s === "Under Contract") return COLORS.GRN;
  if (s === "Closed Deal") return "#f0f2f0";
  if (s === "Follow-Up") return COLORS.T2;
  if (s === "Dead / Not Interested") return COLORS.T3;
  return COLORS.T2;
}

export function sourceColor(s: string) {
  if (s === "Probate") return COLORS.PRP;
  if (s === "Pre-foreclosure") return COLORS.RED;
  if (s === "Signal Sniping") return COLORS.AMB;
  if (s === "Divorce List") return COLORS.BLU;
  if (s === "Tired Landlord") return COLORS.GRN;
  if (s === "Absentee Owner") return "#34d399";
  return COLORS.T2;
}

export function healthColor(score: number) {
  return score >= 75 ? COLORS.GRN : score >= 55 ? COLORS.AMB : COLORS.RED;
}

export function nameToColor(name: string) {
  const cols = [COLORS.GRN, COLORS.BLU, COLORS.PRP, COLORS.AMB, "#34d399", "#f472b6", "#60a5fa", "#fb923c"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return cols[h % cols.length];
}

export function nameInitials(name: string) {
  return name.split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 2);
}

export function fmt$(n: number) {
  if (!n) return "-";
  return "$" + (n / 1000).toFixed(0) + "k";
}
