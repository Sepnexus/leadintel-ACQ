// Shared theme system — mirrors ACQ Coach / Lead Intel. Uses the same
// localStorage key ("acqcoach_theme") so the preference is shared platform-wide.

export const THEMES: Record<string, Record<string, string>> = {
  dark: {
    BG: "#000000", S1: "#0d0d0d", S2: "#141414",
    B1: "#1c1c1c", B2: "#222222", B3: "#2a2a2a",
    TEXT: "#f4f4f4", T2: "#999999", T3: "#777777",
    GREEN: "#4e7d3d", RED: "#c0392b", AMBER: "#b7860b", BLU: "#4a9eff",
  },
  light: {
    BG: "#f5f7f5", S1: "#ffffff", S2: "#f0f4f0",
    B1: "#dde8dd", B2: "#c8d8c8", B3: "#b8ccb8",
    TEXT: "#1a2e1a", T2: "#4a6b4a", T3: "#7a9b7a",
    GREEN: "#2e7d32", RED: "#c62828", AMBER: "#e65100", BLU: "#1565c0",
  },
};

// Mutated in place by applyTheme so components reading COLORS at render get live values.
export const COLORS: Record<string, string> = { ...THEMES.dark };

export function applyTheme(name: string): void {
  const t = THEMES[name] || THEMES.dark;
  Object.assign(COLORS, t);
  try { localStorage.setItem("acqcoach_theme", name); } catch { /* noop */ }
  if (typeof document !== "undefined") document.body.style.background = t.BG;
}

export function getInitialTheme(): string {
  try { return localStorage.getItem("acqcoach_theme") || "dark"; } catch { return "dark"; }
}
