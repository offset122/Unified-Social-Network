import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, Platform, type ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "app_theme_preference";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  colorScheme: ColorSchemeName;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (scheme: "light" | "dark") => void;
  useSystemTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colorScheme: "light",
  themeMode: "system",
  toggleTheme: () => {},
  setTheme: () => {},
  useSystemTheme: () => {},
});

function applyNativeColorScheme(scheme: "light" | "dark" | null) {
  if (Platform.OS === "web") return;
  if (typeof (Appearance as any)?.setColorScheme === "function") {
    try {
      (Appearance as any).setColorScheme(scheme);
    } catch {}
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? "light",
  );

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark") {
          applyNativeColorScheme(saved);
          setThemeMode(saved);
        }
      })
      .catch(() => {});

    const sub = Appearance.addChangeListener(({ colorScheme: cs }) => {
      setSystemScheme(cs);
    });
    return () => sub.remove();
  }, []);

  const setTheme = useCallback((scheme: "light" | "dark") => {
    applyNativeColorScheme(scheme);
    setThemeMode(scheme);
    AsyncStorage.setItem(THEME_KEY, scheme).catch(() => {});
  }, []);

  const useSystemTheme = useCallback(() => {
    applyNativeColorScheme(null);
    setThemeMode("system");
    AsyncStorage.removeItem(THEME_KEY).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    const current = themeMode === "system" ? systemScheme : themeMode;
    setTheme(current === "dark" ? "light" : "dark");
  }, [themeMode, systemScheme, setTheme]);

  const colorScheme: ColorSchemeName = themeMode === "system" ? systemScheme : themeMode;

  return (
    <ThemeContext.Provider value={{ colorScheme, themeMode, toggleTheme, setTheme, useSystemTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
