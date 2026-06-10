import { create } from "zustand";

export type Theme = "auto" | "dark" | "light";

const THEME_STORAGE_KEY = "wavespeed_theme";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark = true;
  root.classList.add("dark");

  // Update Electron title bar overlay colors to match theme
  try {
    (
      window as unknown as {
        electronAPI?: {
          updateTitlebarTheme?: (isDark: boolean) => Promise<void>;
        };
      }
    ).electronAPI?.updateTitlebarTheme?.(isDark);
  } catch {
    /* not in Electron */
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",

  setTheme: (theme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    applyTheme("dark");
    set({ theme: "dark" });
  },

  initTheme: () => {
    const theme = getStoredTheme();
    applyTheme(theme);
    set({ theme });

    // Listen for system theme changes when in auto mode
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (get().theme === "auto") {
        applyTheme("auto");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
  },
}));
