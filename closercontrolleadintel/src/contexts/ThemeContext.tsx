import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { applyLeadIntelTheme } from "@/utils/leadUtils";

type ThemeContextValue = {
  theme: string;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem("acqcoach_theme") ?? "dark"; } catch { return "dark"; }
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyLeadIntelTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
