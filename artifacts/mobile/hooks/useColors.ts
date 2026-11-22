import { useColorScheme } from "react-native";

import colors, { RADIUS, SPACE, TYPE } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

/**
 * Returns the design tokens for the active ThemeProvider / system color scheme.
 * Wiring `useTheme().colorScheme` ensures manual Light/Dark toggling works uniformly
 * across Web, iOS, and Android.
 */
export function useColors() {
  const { colorScheme } = useTheme();
  const systemScheme = useColorScheme();
  const effectiveScheme = colorScheme ?? systemScheme ?? "light";
  const palette = effectiveScheme === "dark" ? colors.dark : colors.light;
  return {
    ...palette,
    isDark: effectiveScheme === "dark",
    radius: colors.radius,
    radii: RADIUS,
    space: SPACE,
    type: TYPE,
  };
}
