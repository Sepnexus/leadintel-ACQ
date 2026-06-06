// ── Theme system ──────────────────────────────────────────────────────────────
export const THEMES = {
  dark: {
    BG: "#000000", S1: "#0a0a0a", S2: "#111111", S3: "#1a1a1a",
    B1: "#1f1f1f", B2: "#2a2a2a", B3: "#333333",
    TEXT: "#f4f4f4", T2: "#959595", T3: "#565656",
    GRN: "#4e7d3d", GRNL: "#5a9147", GRND: "#3a6030",
    RED: "#f04444", AMB: "#f5a623", BLU: "#4a9eff", PRP: "#a78bfa",
  },
  light: {
    BG: "#f5f7f5", S1: "#ffffff", S2: "#f0f4f0", S3: "#e8ede8",
    B1: "#dde8dd", B2: "#c8d8c8", B3: "#b8ccb8",
    TEXT: "#1a2e1a", T2: "#4a6b4a", T3: "#7a9b7a",
    GRN: "#2e7d32", GRNL: "#388e3c", GRND: "#1b5e20",
    RED: "#c62828", AMB: "#e65100", BLU: "#1565c0", PRP: "#7c3aed",
  },
} as const;

const CSS_VARS: Record<string, Record<string, string>> = {
  dark: {
    "--background": "0 0% 0%", "--foreground": "0 0% 96%",
    "--card": "0 0% 4%", "--card-foreground": "0 0% 96%",
    "--popover": "0 0% 4%", "--popover-foreground": "0 0% 96%",
    "--primary-foreground": "0 0% 0%",
    "--secondary": "0 0% 7%", "--secondary-foreground": "0 0% 96%",
    "--muted": "0 0% 10%", "--muted-foreground": "0 0% 58%",
    "--accent": "0 0% 10%", "--accent-foreground": "0 0% 96%",
    "--destructive": "0 84% 60%", "--destructive-foreground": "0 0% 96%",
    "--warning": "36 90% 55%", "--info": "213 100% 65%", "--purple": "258 73% 76%",
    "--surface-1": "0 0% 4%", "--surface-2": "0 0% 7%", "--surface-3": "0 0% 10%",
    "--border": "0 0% 12%", "--border-strong": "0 0% 17%", "--border-muted": "0 0% 20%",
    "--input": "0 0% 12%",
  },
  light: {
    "--background": "93 5% 97%", "--foreground": "120 26% 14%",
    "--card": "0 0% 100%", "--card-foreground": "120 26% 14%",
    "--popover": "0 0% 100%", "--popover-foreground": "120 26% 14%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "120 5% 95%", "--secondary-foreground": "120 26% 14%",
    "--muted": "120 7% 90%", "--muted-foreground": "120 12% 40%",
    "--accent": "120 5% 92%", "--accent-foreground": "120 26% 14%",
    "--destructive": "0 67% 47%", "--destructive-foreground": "0 0% 100%",
    "--warning": "20 96% 45%", "--info": "213 90% 45%", "--purple": "258 70% 55%",
    "--surface-1": "0 0% 100%", "--surface-2": "120 5% 95%", "--surface-3": "120 7% 90%",
    "--border": "120 10% 85%", "--border-strong": "120 10% 78%", "--border-muted": "120 8% 82%",
    "--input": "120 10% 85%",
  },
};

// Color constants — mutated in-place by applyLeadIntelTheme so all imports stay live
export const COLORS = {
  BG: "#000000", S1: "#0a0a0a", S2: "#111111", S3: "#1a1a1a",
  B1: "#1f1f1f", B2: "#2a2a2a", B3: "#333333",
  TEXT: "#f4f4f4", T2: "#959595", T3: "#565656",
  GRN: "#4e7d3d", GRNL: "#5a9147", GRND: "#3a6030",
  RED: "#f04444", AMB: "#f5a623", BLU: "#4a9eff", PRP: "#a78bfa",
};

export function applyLeadIntelTheme(name: string): void {
  const t = (THEMES as Record<string, Record<string, string>>)[name] ?? THEMES.dark;
  Object.assign(COLORS, t);
  const vars = CSS_VARS[name] ?? CSS_VARS.dark;
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    document.body.style.background = t["BG"];
  }
  try { localStorage.setItem("acqcoach_theme", name); } catch { /* noop */ }
}

// Apply saved theme immediately on module load
if (typeof window !== "undefined") {
  applyLeadIntelTheme((() => { try { return localStorage.getItem("acqcoach_theme") ?? "dark"; } catch { return "dark"; } })());
}

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
