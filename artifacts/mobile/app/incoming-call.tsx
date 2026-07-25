import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Image, Vibration } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveMediaUrl } from "@/lib/db";

export default function IncomingCallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    callerName?: string; callerAvatar?: string;
    callType?: string; chatId?: string;
  }>();

  const callerName = params.callerName ?? "Unknown";
  const callerAvatar = params.callerAvatar ?? null;
  const callType = params.callType ?? "audio";
  const chatId = params.chatId ?? "";

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulse2Anim = useRef(new Animated.Value(1)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Pulsing rings
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(pulse2Anim, { toValue: 1.5, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse2Anim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    loop2.start();

    // Vibrate pattern
    Vibration.vibrate([0, 400, 200, 400, 200, 400], true);

    // Auto-dismiss after 30 seconds
    dismissTimer.current = setTimeout(() => {
      Vibration.cancel();
      router.back();
    }, 30000);

    return () => {
      loop.stop();
      loop2.stop();
      Vibration.cancel();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const handleAccept = () => {
    Vibration.cancel();
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    router.replace({
      pathname: `/call/${chatId}`,
      params: { peerName: callerName, peerAvatar: callerAvatar ?? "", isVideo: callType === "video" ? "true" : "false" },
    } as any);
  };

  const handleDecline = () => {
    Vibration.cancel();
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    router.back();
  };

  const initials = callerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = callerName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0f0a1e", "#1a0533", "#0f0a1e"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        {/* Call type label */}
        <Text style={styles.callTypeLabel}>
          {callType === "video" ? "📹 Incoming Video Call" : "📞 Incoming Call"}
        </Text>

        {/* Pulsing avatar */}
        <View style={styles.avatarWrap}>
          <Animated.View style={[styles.pulseRing2, { transform: [{ scale: pulse2Anim }] }]} />
          <Animated.View style={[styles.pulseRing1, { transform: [{ scale: pulseAnim }] }]} />
          {callerAvatar ? (
            <Image source={{ uri: resolveMediaUrl(callerAvatar) }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={[`hsl(${hue},60%,52%)`, `hsl(${(hue + 40) % 360},70%,38%)`]} style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </LinearGradient>
          )}
        </View>

        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callerSub}>is calling you…</Text>

        {/* Action buttons */}
        <View style={styles.actions}>
          <View style={styles.actionItem}>
            <Pressable onPress={handleDecline} style={styles.declineBtn}>
              <Feather name="phone-off" size={28} color="#fff" />
            </Pressable>
            <Text style={styles.actionLabel}>Decline</Text>
          </View>

          <View style={styles.actionItem}>
            <Pressable onPress={handleAccept} style={styles.acceptBtn}>
              <Feather name={callType === "video" ? "video" : "phone"} size={28} color="#fff" />
            </Pressable>
            <Text style={styles.actionLabel}>Accept</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, alignItems: "center", justifyContent: "space-between" },
  callTypeLabel: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600", letterSpacing: 0.3 },
  avatarWrap: { alignItems: "center", justifyContent: "center", width: 180, height: 180 },
  pulseRing1: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
    backgroundColor: "rgba(124,58,237,0.2)", borderWidth: 1, borderColor: "rgba(124,58,237,0.3)",
  },
  pulseRing2: {
    position: "absolute", width: 170, height: 170, borderRadius: 85,
    backgroundColor: "rgba(124,58,237,0.1)", borderWidth: 1, borderColor: "rgba(124,58,237,0.15)",
  },
  avatar: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { color: "#fff", fontSize: 38, fontWeight: "800" },
  callerName: { color: "#fff", fontSize: 30, fontWeight: "800", letterSpacing: -0.5, textAlign: "center" },
  callerSub: { color: "rgba(255,255,255,0.5)", fontSize: 16, marginTop: -8 },
  actions: { flexDirection: "row", gap: 60, alignItems: "center" },
  actionItem: { alignItems: "center", gap: 10 },
  declineBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#ef4444", shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 8,
  },
  acceptBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#22c55e",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#22c55e", shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 8,
  },
  actionLabel: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },
});
