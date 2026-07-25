import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Switch, Alert, Animated,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useChatTheme,
  getBubbleRadius,
  getFontSize,
  ACCENT_PRESETS,
  WALLPAPERS,
  type BubbleStyle,
  type FontSize,
  type WallpaperKey,
} from "@/lib/chatTheme";

const C = {
  bg: "#0F1117",
  surface: "#1A1D27",
  surfaceHigh: "#1E2232",
  border: "#252836",
  text: "#E2E8F0",
  textMuted: "#6B7280",
  textDim: "#4B5168",
  red: "#EF4444",
};

// ─── Wallpaper pattern renderer ─────────────────────────────────────────────

function WallpaperBg({ wallpaper, accent }: { wallpaper: WallpaperKey; accent: string }) {
  if (wallpaper === "none") return null;

  if (wallpaper === "gradient") {
    return (
      <LinearGradient
        colors={[accent + "18", "#0F1117", accent + "10"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    );
  }

  const size = wallpaper === "dots" ? 20 : wallpaper === "grid" ? 28 : 36;
  const count = Math.ceil(200 / size);
  const rows = Math.ceil(160 / size);

  if (wallpaper === "waves") {
    return (
      <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.07 }]}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: -20,
              right: -20,
              top: i * 22 - 10,
              height: 14,
              borderRadius: 7,
              borderWidth: 1.5,
              borderColor: accent,
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.06 }]}>
      {Array.from({ length: rows }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {Array.from({ length: count }).map((_, col) => (
            <View
              key={col}
              style={{
                width: size,
                height: size,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {wallpaper === "dots" ? (
                <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: accent }} />
              ) : (
                <View style={{ width: size - 2, height: size - 2, borderWidth: 0.5, borderColor: accent }} />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Live preview ────────────────────────────────────────────────────────────

function LivePreview() {
  const { theme } = useChatTheme();
  const radius = getBubbleRadius(theme.bubbleStyle, true);
  const radiusThem = getBubbleRadius(theme.bubbleStyle, false);
  const fs = getFontSize(theme.fontSize);
  const isMinimal = theme.bubbleStyle === "minimal";

  return (
    <View style={styles.previewWrap}>
      <WallpaperBg wallpaper={theme.wallpaper} accent={theme.accentColor} />

      {/* Their bubble */}
      <View style={[styles.previewRow, { justifyContent: "flex-start" }]}>
        <View style={[styles.previewAvatar, { backgroundColor: theme.accentColor + "44" }]}>
          <Text style={{ fontSize: 12 }}>👤</Text>
        </View>
        <View
          style={[
            styles.previewBubble,
            radiusThem,
            {
              backgroundColor: theme.theirBubbleColor,
              borderColor: isMinimal ? C.border : "transparent",
            },
          ]}
        >
          <Text style={{ color: C.text, fontSize: fs, lineHeight: fs * 1.45 }}>Hey! How are you? 👋</Text>
          <Text style={{ color: C.textDim, fontSize: 10, marginTop: 3, alignSelf: "flex-end" }}>12:01</Text>
        </View>
      </View>

      {/* My bubble */}
      <View style={[styles.previewRow, { justifyContent: "flex-end" }]}>
        <LinearGradient
          colors={[theme.myBubbleColor, theme.accentColor + "CC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.previewBubble, radius]}
        >
          <Text style={{ color: "#fff", fontSize: fs, lineHeight: fs * 1.45 }}>Doing great, thanks! 😊</Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 3, alignSelf: "flex-end" }}>
            {theme.showReadReceipts ? "12:02 ✓✓" : "12:02"}
          </Text>
        </LinearGradient>
      </View>

      {/* Their bubble 2 */}
      <View style={[styles.previewRow, { justifyContent: "flex-start" }]}>
        <View style={{ width: 28 }} />
        <View
          style={[
            styles.previewBubble,
            radiusThem,
            {
              backgroundColor: theme.theirBubbleColor,
              borderColor: isMinimal ? C.border : "transparent",
            },
          ]}
        >
          <Text style={{ color: C.text, fontSize: fs, lineHeight: fs * 1.45 }}>Want to catch up later?</Text>
          <Text style={{ color: C.textDim, fontSize: 10, marginTop: 3, alignSelf: "flex-end" }}>12:03</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({
  icon, iconColor = C.textMuted, label, sub, right, onPress, last = false,
}: {
  icon: any; iconColor?: string; label: string; sub?: string;
  right?: React.ReactNode; onPress?: () => void; last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorder,
        pressed && onPress && { backgroundColor: C.surfaceHigh },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconColor + "22" }]}>
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ChatSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, setTheme, resetTheme } = useChatTheme();

  const BUBBLE_STYLES: { key: BubbleStyle; label: string; desc: string }[] = [
    { key: "rounded", label: "Rounded",  desc: "Classic rounded corners" },
    { key: "sharp",   label: "Sharp",    desc: "Clean square edges" },
    { key: "pill",    label: "Pill",     desc: "Fully rounded ends" },
    { key: "minimal", label: "Minimal",  desc: "Outlined, no fill" },
  ];

  const FONT_SIZES: { key: FontSize; label: string }[] = [
    { key: "sm", label: "Small" },
    { key: "md", label: "Medium" },
    { key: "lg", label: "Large" },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Chat Appearance</Text>
        <Pressable
          onPress={() =>
            Alert.alert("Reset to defaults?", "All chat appearance settings will be reset.", [
              { text: "Cancel", style: "cancel" },
              { text: "Reset", style: "destructive", onPress: resetTheme },
            ])
          }
          hitSlop={10}
        >
          <Text style={{ color: C.red, fontSize: 14, fontWeight: "600" }}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Live preview */}
        <View style={styles.previewSection}>
          <Text style={styles.sectionLabel}>Preview</Text>
          <LivePreview />
        </View>

        {/* Bubble style */}
        <Section title="Bubble Style">
          <View style={styles.bubbleGrid}>
            {BUBBLE_STYLES.map((s) => {
              const active = theme.bubbleStyle === s.key;
              const r = getBubbleRadius(s.key, true);
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setTheme({ bubbleStyle: s.key })}
                  style={[styles.bubbleOption, active && { borderColor: theme.accentColor, backgroundColor: theme.accentColor + "14" }]}
                >
                  <LinearGradient
                    colors={[theme.myBubbleColor, theme.accentColor + "CC"]}
                    style={[styles.bubbleSample, r]}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Aa</Text>
                  </LinearGradient>
                  <Text style={[styles.bubbleOptionLabel, active && { color: theme.accentColor }]}>{s.label}</Text>
                  <Text style={styles.bubbleOptionDesc}>{s.desc}</Text>
                  {active && (
                    <View style={[styles.bubbleCheck, { backgroundColor: theme.accentColor }]}>
                      <Feather name="check" size={10} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Accent colour */}
        <Section title="Accent Colour">
          <View style={styles.colorGrid}>
            {ACCENT_PRESETS.map((p) => {
              const active = theme.accentColor === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => setTheme({ accentColor: p.value, myBubbleColor: p.value })}
                  style={styles.colorSwatch}
                >
                  <View style={[styles.colorCircle, { backgroundColor: p.value }, active && styles.colorCircleActive]}>
                    {active && <Feather name="check" size={14} color={p.value === "#E2E8F0" ? "#000" : "#fff"} />}
                  </View>
                  <Text style={[styles.colorLabel, active && { color: p.value }]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Their bubble colour */}
        <Section title="Their Bubble Colour">
          <View style={styles.colorGrid}>
            {[
              { label: "Dark",    value: "#1E2232" },
              { label: "Darker",  value: "#161824" },
              { label: "Slate",   value: "#1E293B" },
              { label: "Zinc",    value: "#27272A" },
              { label: "Neutral", value: "#262626" },
              { label: "Stone",   value: "#292524" },
            ].map((p) => {
              const active = theme.theirBubbleColor === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => setTheme({ theirBubbleColor: p.value })}
                  style={styles.colorSwatch}
                >
                  <View style={[styles.colorCircle, { backgroundColor: p.value, borderWidth: 1.5, borderColor: active ? theme.accentColor : C.border }]}>
                    {active && <Feather name="check" size={14} color="#fff" />}
                  </View>
                  <Text style={[styles.colorLabel, active && { color: theme.accentColor }]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Wallpaper */}
        <Section title="Chat Wallpaper">
          <View style={styles.wallpaperRow}>
            {WALLPAPERS.map((w) => {
              const active = theme.wallpaper === w.key;
              return (
                <Pressable
                  key={w.key}
                  onPress={() => setTheme({ wallpaper: w.key as WallpaperKey })}
                  style={[styles.wallpaperOption, active && { borderColor: theme.accentColor, backgroundColor: theme.accentColor + "14" }]}
                >
                  <Text style={{ fontSize: 22 }}>{w.emoji}</Text>
                  <Text style={[styles.wallpaperLabel, active && { color: theme.accentColor }]}>{w.label}</Text>
                  {active && <View style={[styles.wallpaperDot, { backgroundColor: theme.accentColor }]} />}
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Font size */}
        <Section title="Message Font Size">
          <View style={styles.fontRow}>
            {FONT_SIZES.map((f) => {
              const active = theme.fontSize === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setTheme({ fontSize: f.key })}
                  style={[styles.fontOption, active && { borderColor: theme.accentColor, backgroundColor: theme.accentColor + "14" }]}
                >
                  <Text style={[
                    styles.fontSample,
                    { fontSize: getFontSize(f.key) },
                    active && { color: theme.accentColor },
                  ]}>
                    Aa
                  </Text>
                  <Text style={[styles.fontLabel, active && { color: theme.accentColor }]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Behaviour toggles */}
        <Section title="Behaviour">
          <Row
            icon="check-circle"
            iconColor="#10B981"
            label="Read Receipts"
            sub="Show when your messages are read"
            right={
              <Switch
                value={theme.showReadReceipts}
                onValueChange={(v) => setTheme({ showReadReceipts: v })}
                trackColor={{ true: theme.accentColor }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            icon="link"
            iconColor="#0EA5E9"
            label="Link Previews"
            sub="Show previews for URLs in messages"
            right={
              <Switch
                value={theme.showLinkPreviews}
                onValueChange={(v) => setTheme({ showLinkPreviews: v })}
                trackColor={{ true: theme.accentColor }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            icon="volume-2"
            iconColor="#F59E0B"
            label="Message Sounds"
            sub="Play sound when sending or receiving"
            right={
              <Switch
                value={theme.messageSounds}
                onValueChange={(v) => setTheme({ messageSounds: v })}
                trackColor={{ true: theme.accentColor }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            icon="corner-down-left"
            iconColor="#8B5CF6"
            label="Send on Enter"
            sub="Return key sends instead of new line"
            last
            right={
              <Switch
                value={theme.sendOnEnter}
                onValueChange={(v) => setTheme({ sendOnEnter: v })}
                trackColor={{ true: theme.accentColor }}
                thumbColor="#fff"
              />
            }
          />
        </Section>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: C.text, letterSpacing: -0.3 },

  previewSection: { paddingHorizontal: 16, paddingTop: 22 },
  previewWrap: {
    backgroundColor: C.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 10,
    overflow: "hidden",
    minHeight: 160,
  },
  previewRow: { flexDirection: "row", alignItems: "flex-end", gap: 7 },
  previewAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  previewBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "72%",
  },

  section: { paddingHorizontal: 16, paddingTop: 22 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.8, color: C.textMuted, marginBottom: 10, marginLeft: 2,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontWeight: "500", color: C.text },
  rowSub: { fontSize: 12, color: C.textDim, marginTop: 1 },

  // Bubble style grid
  bubbleGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  bubbleOption: {
    width: "47%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 12,
    gap: 6,
    position: "relative",
  },
  bubbleSample: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleOptionLabel: { fontSize: 14, fontWeight: "700", color: C.text },
  bubbleOptionDesc: { fontSize: 11, color: C.textDim },
  bubbleCheck: {
    position: "absolute", top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },

  // Colour grid
  colorGrid: { flexDirection: "row", flexWrap: "wrap", padding: 14, gap: 14 },
  colorSwatch: { alignItems: "center", gap: 5, width: 52 },
  colorCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  colorCircleActive: { borderWidth: 3, borderColor: "#fff" },
  colorLabel: { fontSize: 10, fontWeight: "600", color: C.textDim, textAlign: "center" },

  // Wallpaper
  wallpaperRow: { flexDirection: "row", padding: 12, gap: 8 },
  wallpaperOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    gap: 5,
    position: "relative",
  },
  wallpaperLabel: { fontSize: 11, fontWeight: "600", color: C.textDim },
  wallpaperDot: {
    position: "absolute", bottom: 6,
    width: 5, height: 5, borderRadius: 3,
  },

  // Font size
  fontRow: { flexDirection: "row", padding: 12, gap: 10 },
  fontOption: {
    flex: 1, alignItems: "center", paddingVertical: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border, gap: 4,
  },
  fontSample: { fontWeight: "700", color: C.text },
  fontLabel: { fontSize: 11, fontWeight: "600", color: C.textDim },
});
