import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "app_theme_preference";

interface ThemeContextValue {
  colorScheme: ColorSchemeName;
  toggleTheme: () => void;
  setTheme: (scheme: "light" | "dark") => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colorScheme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? "light",
  );

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") {
        Appearance.setColorScheme(saved);
        setColorScheme(saved);
      }
    });
    const sub = Appearance.addChangeListener(({ colorScheme: cs }) => {
      setColorScheme(cs);
    });
    return () => sub.remove();
  }, []);

  const setTheme = useCallback((scheme: "light" | "dark") => {
    Appearance.setColorScheme(scheme);
    setColorScheme(scheme);
    AsyncStorage.setItem(THEME_KEY, scheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = colorScheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [colorScheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ colorScheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
