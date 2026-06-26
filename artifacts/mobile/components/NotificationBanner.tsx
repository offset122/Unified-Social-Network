import React, { useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions, Platform, Image,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppNotification } from "@/lib/notifications";
import { NOTIFICATION_META } from "@/lib/notifications";
import { resolveMediaUrl } from "@/lib/db";

interface Props {
  notification: AppNotification | null;
  onDismiss: () => void;
  onPress?: (n: AppNotification) => void;
}

const TYPE_COLORS: Record<string, [string, string]> = {
  message:         ["#6d28d9", "#4f46e5"],
  message_request: ["#ea580c", "#dc2626"],
  audio_call:      ["#059669", "#0d9488"],
  video_call:      ["#0891b2", "#0284c7"],
  new_post:        ["#7c3aed", "#6d28d9"],
  new_reel:        ["#9333ea", "#7c3aed"],
  security_alert:  ["#dc2626", "#b91c1c"],
  like:            ["#e11d48", "#be185d"],
  comment:         ["#2563eb", "#1d4ed8"],
  follow:          ["#0284c7", "#0369a1"],
  live:            ["#dc2626", "#b91c1c"],
};

export default function NotificationBanner({ notification, onDismiss, onPress }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width: W } = Dimensions.get("window");

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -160, duration: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, [onDismiss]);

  useEffect(() => {
    if (!notification) return;

    translateY.setValue(-160);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    dismissTimer.current = setTimeout(dismiss, 5000);
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [notification]);

  if (!notification) return null;

  const meta = NOTIFICATION_META[notification.type] ?? NOTIFICATION_META.message;
  const colors = TYPE_COLORS[notification.type] ?? ["#7c3aed", "#4f46e5"];
  const top = insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.container,
        { top, width: W - 24, transform: [{ translateY }], opacity },
      ]}
    >
      <Pressable onPress={() => { dismiss(); onPress?.(notification); }} style={styles.pressable}>
        {Platform.OS !== "web" ? (
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(9,9,11,0.95)" }]} />
        )}

        <View style={styles.content}>
          {/* Left: Avatar or icon */}
          <View style={styles.avatarWrap}>
            {notification.avatarUrl ? (
              <>
                <Image
                  source={{ uri: resolveMediaUrl(notification.avatarUrl) }}
                  style={styles.avatar}
                />
                <LinearGradient colors={colors as [string, string]} style={styles.typeBadge}>
                  <Text style={{ fontSize: 10 }}>{meta.emoji}</Text>
                </LinearGradient>
              </>
            ) : (
              <LinearGradient colors={colors as [string, string]} style={styles.iconCircle}>
                <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
              </LinearGradient>
            )}
          </View>

          {/* Middle: Text */}
          <View style={styles.textWrap}>
            <View style={styles.titleRow}>
              <LinearGradient colors={colors as [string, string]} style={styles.typePill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.typeLabel}>{notification.type.replace("_", " ")}</Text>
              </LinearGradient>
              <Text style={styles.time}>now</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{notification.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{notification.body}</Text>
          </View>

          {/* Right: Dismiss */}
          <Pressable onPress={dismiss} hitSlop={12} style={styles.closeBtn}>
            <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        {/* Bottom accent bar */}
        <LinearGradient
          colors={colors as [string, string]}
          style={styles.accentBar}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    zIndex: 9999,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pressable: { overflow: "hidden", borderRadius: 20 },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    paddingBottom: 16,
  },
  avatarWrap: { position: "relative" },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  typeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(9,9,11,0.9)",
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  typePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeLabel: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  time: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
  title: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  body: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17 },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  accentBar: {
    height: 3,
    width: "100%",
  },
});
