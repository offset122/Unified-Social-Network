/**
 * Semantic design tokens for Vibe (Apple HIG Light & OLED Dark).
 * Preserves legacy token names alongside the 3-tier Apple-grade token system.
 */

export const RADIUS = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const TYPE = {
  largeTitle: {
    fontSize: 30,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  headline: {
    fontSize: 17,
    fontWeight: "600" as const,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  body: {
    fontSize: 15.5,
    fontWeight: "400" as const,
    lineHeight: 22,
  },
  subhead: {
    fontSize: 13.5,
    fontWeight: "500" as const,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
    lineHeight: 16,
  },
  tabular: {
    fontVariant: ["tabular-nums"] as ("tabular-nums")[],
  },
};

export interface ThemePalette {
  // 3-tier Apple HIG semantics
  bgCanvas: string;
  bgElevated: string;
  bgMaterial: string;
  bgOverlay: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  separator: string;
  accentPrimary: string;
  accentTint: string;
  semanticDanger: string;
  semanticSuccess: string;
  semanticWarning: string;

  // Legacy compatibility tokens (mapped to cohesive palette)
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
}

const light: ThemePalette = {
  bgCanvas: "#FFFFFF",
  bgElevated: "#F7F7FA",
  bgMaterial: "rgba(255,255,255,0.86)",
  bgOverlay: "rgba(0,0,0,0.45)",
  textPrimary: "#0B0B0F",
  textSecondary: "#63636B",
  textTertiary: "#8E8E93",
  separator: "rgba(60,60,67,0.12)",
  accentPrimary: "#6D28D9",
  accentTint: "rgba(109,40,217,0.10)",
  semanticDanger: "#E11D48",
  semanticSuccess: "#059669",
  semanticWarning: "#D97706",

  text: "#0B0B0F",
  tint: "#6D28D9",
  background: "#FFFFFF",
  foreground: "#0B0B0F",
  card: "#F7F7FA",
  cardForeground: "#0B0B0F",
  primary: "#6D28D9",
  primaryForeground: "#FFFFFF",
  secondary: "#F2F2F7",
  secondaryForeground: "#1C1C1E",
  muted: "#E5E5EA",
  mutedForeground: "#63636B",
  accent: "rgba(109,40,217,0.10)",
  accentForeground: "#5B21B6",
  destructive: "#E11D48",
  destructiveForeground: "#FFFFFF",
  border: "rgba(60,60,67,0.12)",
  input: "#F2F2F7",
};

const dark: ThemePalette = {
  bgCanvas: "#000000",
  bgElevated: "#121216",
  bgMaterial: "rgba(18,18,22,0.86)",
  bgOverlay: "rgba(0,0,0,0.68)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9AA6",
  textTertiary: "#6E6E78",
  separator: "rgba(255,255,255,0.12)",
  accentPrimary: "#8B5CF6",
  accentTint: "rgba(139,92,246,0.16)",
  semanticDanger: "#FB7185",
  semanticSuccess: "#34D399",
  semanticWarning: "#FBBF24",

  text: "#F5F5F7",
  tint: "#8B5CF6",
  background: "#000000",
  foreground: "#F5F5F7",
  card: "#121216",
  cardForeground: "#F5F5F7",
  primary: "#8B5CF6",
  primaryForeground: "#FFFFFF",
  secondary: "#1C1C22",
  secondaryForeground: "#F5F5F7",
  muted: "#2C2C34",
  mutedForeground: "#9A9AA6",
  accent: "rgba(139,92,246,0.16)",
  accentForeground: "#DDD6FE",
  destructive: "#FB7185",
  destructiveForeground: "#FFFFFF",
  border: "rgba(255,255,255,0.12)",
  input: "#1C1C22",
};

const colors = {
  light,
  dark,
  radius: RADIUS.md,
};

export default colors;
