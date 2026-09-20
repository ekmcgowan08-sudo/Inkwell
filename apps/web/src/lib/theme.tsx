import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadRemotePreferences, saveRemotePreferences } from "./repos/preferences";
import { isLocalOnlyMode } from "./env";

export type ThemeChoice = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "inkwell.theme";
const MOTION_KEY = "inkwell.reducedMotion";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => (localStorage.getItem(THEME_KEY) as ThemeChoice) || "system");
  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => localStorage.getItem(MOTION_KEY) === "true");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduced-motion", String(reducedMotion));
  }, [reducedMotion]);

  // Best-effort cross-device sync for cloud accounts: fetch the server's copy once (may briefly
  // override the localStorage-based initial paint if they differ — the same trade every other
  // "load then reconcile" flow in this app makes), local-only mode skips it entirely.
  useEffect(() => {
    if (isLocalOnlyMode) return;
    loadRemotePreferences().then((remote) => {
      if (!remote) return;
      setThemeState(remote.theme);
      setReducedMotionState(remote.reducedMotion);
      localStorage.setItem(THEME_KEY, remote.theme);
      localStorage.setItem(MOTION_KEY, String(remote.reducedMotion));
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (t) => {
        setThemeState(t);
        localStorage.setItem(THEME_KEY, t);
        void saveRemotePreferences({ theme: t, reducedMotion });
      },
      reducedMotion,
      setReducedMotion: (v) => {
        setReducedMotionState(v);
        localStorage.setItem(MOTION_KEY, String(v));
        void saveRemotePreferences({ theme, reducedMotion: v });
      },
    }),
    [theme, reducedMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
