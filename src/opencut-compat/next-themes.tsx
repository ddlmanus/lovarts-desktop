import type React from "react";
import { useThemeStore } from "@/stores/themeStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useTheme() {
  const { theme, setTheme } = useThemeStore();

  return {
    theme,
    resolvedTheme: theme === "auto" ? "dark" : theme,
    setTheme,
  };
}
