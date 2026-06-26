import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, Platform, Dimensions, Image, Alert,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { resolveMediaUrl } from "@/lib/db";

const { width: W, height: H } = Dimensions.get("window");

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <LinearGradient colors={["#7c3aed", "#4f46e5"]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.33, fontWeight: "800", letterSpacing: 1 }}>{initials}</Text>
    </LinearGradient>
  );
}

export default function CallScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const params = useLocalSearchParams<{ peerName?: string; peerAvatar?: string; isVideo?: string }>();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const isVideo = params.isVideo === "true";
  const peerName = params.peerName ?? "User";

  const [callStatus, setCallStatus] = useState<"calling" | "connected" | "ended">("calling");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    // Simulate call being answered after 3 seconds
    const timer = setTimeout(() => setCallStatus("connected"), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (callStatus !== "connected") return;
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const handleEnd = () => {
    setCallStatus("ended");
    setTimeout(() => router.back(), 800);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={isVideo ? ["#0f0a1e", "#1a0533", "#2d1b69"] : ["#1e1b4b", "#2d1b69", "#0f0a1e"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Back button */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { paddingTop: insets.top + 8 }]} hitSlop={8}>
        <Feather name="chevron-down" size={28} color="#fff" />
      </Pressable>

      {/* Call type badge */}
      <View style={[styles.callTypeBadge, { top: insets.top + 12 }]}>
        <Feather name={isVideo ? "video" : "phone"} size={13} color="#fff" />
        <Text style={styles.callTypeTxt}>{isVideo ? "Video Call" : "Voice Call"}</Text>
      </View>

      {/* Peer info */}
      <View style={styles.peerSection}>
        <View style={[styles.avatarGlow, { shadowColor: "#7c3aed" }]}>
          <Avatar name={peerName} size={120} />
        </View>
        <Text style={styles.peerName}>{peerName}</Text>
        <Text style={[styles.callStatus, { color: callStatus === "connected" ? "#22c55e" : "#a78bfa" }]}>
          {callStatus === "calling" ? "Calling..." : callStatus === "connected" ? formatDuration(duration) : "Call ended"}
        </Text>
      </View>

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.controlRow}>
          <Pressable onPress={() => setIsMuted(m => !m)} style={[styles.ctrlBtn, isMuted && styles.ctrlActive]}>
            <Feather name={isMuted ? "mic-off" : "mic"} size={24} color="#fff" />
            <Text style={styles.ctrlLabel}>{isMuted ? "Unmute" : "Mute"}</Text>
          </Pressable>

          {isVideo && (
            <Pressable onPress={() => setIsCameraOff(c => !c)} style={[styles.ctrlBtn, isCameraOff && styles.ctrlActive]}>
              <Feather name={isCameraOff ? "video-off" : "video"} size={24} color="#fff" />
              <Text style={styles.ctrlLabel}>{isCameraOff ? "Cam On" : "Cam Off"}</Text>
            </Pressable>
          )}

          <Pressable onPress={() => setIsSpeaker(s => !s)} style={[styles.ctrlBtn, isSpeaker && styles.ctrlActive]}>
            <Feather name={isSpeaker ? "volume-2" : "volume-1"} size={24} color="#fff" />
            <Text style={styles.ctrlLabel}>{isSpeaker ? "Speaker" : "Earpiece"}</Text>
          </Pressable>

          <Pressable style={styles.ctrlBtn}>
            <Feather name="more-horizontal" size={24} color="#fff" />
            <Text style={styles.ctrlLabel}>More</Text>
          </Pressable>
        </View>

        <Pressable onPress={handleEnd} style={styles.endBtn}>
          <Feather name="phone-off" size={28} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  backBtn: { position: "absolute", left: 16, zIndex: 10 },
  callTypeBadge: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, zIndex: 10 },
  callTypeTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  peerSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  avatarGlow: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 30, elevation: 20 },
  peerName: { color: "#fff", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  callStatus: { fontSize: 16, fontWeight: "500" },
  controls: { width: "100%", paddingHorizontal: 24 },
  controlRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 32 },
  ctrlBtn: { alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, padding: 14, minWidth: 70 },
  ctrlActive: { backgroundColor: "rgba(124,58,237,0.5)" },
  ctrlLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  endBtn: { backgroundColor: "#ef4444", width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", alignSelf: "center", shadowColor: "#ef4444", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
});
