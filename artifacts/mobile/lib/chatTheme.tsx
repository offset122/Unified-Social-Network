import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "chat_theme_v1";

export type BubbleStyle = "rounded" | "sharp" | "pill" | "minimal";
export type WallpaperKey = "none" | "dots" | "grid" | "waves" | "gradient";
export type FontSize = "sm" | "md" | "lg";

export interface ChatTheme {
  accentColor: string;
  myBubbleColor: string;
  theirBubbleColor: string;
  bubbleStyle: BubbleStyle;
  wallpaper: WallpaperKey;
  fontSize: FontSize;
  showReadReceipts: boolean;
  showLinkPreviews: boolean;
  messageSounds: boolean;
  sendOnEnter: boolean;
}

const DEFAULT: ChatTheme = {
  accentColor: "#6366F1",
  myBubbleColor: "#6366F1",
  theirBubbleColor: "#1E2232",
  bubbleStyle: "rounded",
  wallpaper: "none",
  fontSize: "md",
  showReadReceipts: true,
  showLinkPreviews: true,
  messageSounds: true,
  sendOnEnter: false,
};

interface ChatThemeCtx {
  theme: ChatTheme;
  setTheme: (patch: Partial<ChatTheme>) => void;
  resetTheme: () => void;
}

const Ctx = createContext<ChatThemeCtx>({
  theme: DEFAULT,
  setTheme: () => {},
  resetTheme: () => {},
});

export function ChatThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ChatTheme>(DEFAULT);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try { setThemeState({ ...DEFAULT, ...JSON.parse(raw) }); } catch {}
      }
    });
  }, []);

  const setTheme = useCallback((patch: Partial<ChatTheme>) => {
    setThemeState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetTheme = useCallback(() => {
    setThemeState(DEFAULT);
    AsyncStorage.setItem(KEY, JSON.stringify(DEFAULT));
  }, []);

  return <Ctx.Provider value={{ theme, setTheme, resetTheme }}>{children}</Ctx.Provider>;
}

export function useChatTheme() {
  return useContext(Ctx);
}

// Derived helpers consumed by the chat screen
export function getBubbleRadius(style: BubbleStyle, isMine: boolean) {
  switch (style) {
    case "sharp":   return { borderRadius: 6, ...(isMine ? { borderBottomRightRadius: 2 } : { borderBottomLeftRadius: 2 }) };
    case "pill":    return { borderRadius: 24 };
    case "minimal": return { borderRadius: 10, borderWidth: 1 };
    default:        return { borderRadius: 18, ...(isMine ? { borderBottomRightRadius: 5 } : { borderBottomLeftRadius: 5 }) };
  }
}

export function getFontSize(size: FontSize) {
  return size === "sm" ? 13 : size === "lg" ? 17 : 15;
}

export const ACCENT_PRESETS = [
  { label: "Indigo",  value: "#6366F1" },
  { label: "Violet",  value: "#8B5CF6" },
  { label: "Pink",    value: "#EC4899" },
  { label: "Rose",    value: "#F43F5E" },
  { label: "Orange",  value: "#F97316" },
  { label: "Amber",   value: "#F59E0B" },
  { label: "Emerald", value: "#10B981" },
  { label: "Cyan",    value: "#06B6D4" },
  { label: "Sky",     value: "#0EA5E9" },
  { label: "White",   value: "#E2E8F0" },
];

export const WALLPAPERS: { key: WallpaperKey; label: string; emoji: string }[] = [
  { key: "none",     label: "None",     emoji: "⬛" },
  { key: "dots",     label: "Dots",     emoji: "🔵" },
  { key: "grid",     label: "Grid",     emoji: "🔲" },
  { key: "waves",    label: "Waves",    emoji: "🌊" },
  { key: "gradient", label: "Gradient", emoji: "🌈" },
];
