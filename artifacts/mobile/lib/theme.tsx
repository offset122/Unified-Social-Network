import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? "light",
  );

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") {
        Appearance.setColorScheme(saved);
        setThemeMode(saved);
      }
    });
    const sub = Appearance.addChangeListener(({ colorScheme: cs }) => {
      setSystemScheme(cs);
    });
    return () => sub.remove();
  }, []);

  const setTheme = useCallback((scheme: "light" | "dark") => {
    Appearance.setColorScheme(scheme);
    setThemeMode(scheme);
    AsyncStorage.setItem(THEME_KEY, scheme);
  }, []);

  const useSystemTheme = useCallback(() => {
    Appearance.setColorScheme(null);
    setThemeMode("system");
    AsyncStorage.removeItem(THEME_KEY);
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
