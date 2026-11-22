import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { RADIUS, TYPE } from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/Avatar";
import { ActionSheet, type ActionSheetItem } from "@/components/ActionSheet";
import { useToast } from "@/components/Toast";

export default function CallScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const params = useLocalSearchParams<{
    peerName?: string;
    peerAvatar?: string;
    isVideo?: string;
    peerId?: string;
    role?: string;
  }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useToast();

  const isVideo = params.isVideo === "true";
  const role = params.role === "callee" ? "callee" : "caller";
  const peerId = params.peerId ?? "";
  const peerName =
    String(params.peerName ?? "User")
      .replace(/[<>"'`]/g, "")
      .slice(0, 60) || "User";

  const [callStatus, setCallStatus] = useState<
    "calling" | "connected" | "ended"
  >("calling");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(isVideo);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const signalChannel = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
  const ringChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user?.id || !chatId) return;

    const ch = supabase.channel(`call-signal-${chatId}`);
    signalChannel.current = ch;

    ch.on("broadcast", { event: "call-answer" }, () => {
      setCallStatus("connected");
    })
      .on("broadcast", { event: "call-decline" }, () => {
        setCallStatus("ended");
        setTimeout(() => router.back(), 800);
      })
      .on("broadcast", { event: "call-end" }, () => {
        setCallStatus("ended");
        setTimeout(() => router.back(), 800);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        if (role === "callee") {
          await ch.send({ type: "broadcast", event: "call-answer", payload: {} });
          return;
        }
        if (!peerId) return;
        const rc = supabase.channel(`call-ring:${peerId}`);
        ringChannel.current = rc;
        await new Promise<void>((resolve) => {
          rc.subscribe((s: string) => {
            if (s === "SUBSCRIBED") resolve();
          });
        });
        await rc.send({
          type: "broadcast",
          event: "call-ring",
          payload: {
            callerId: user.id,
            callerName:
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              "Someone",
            callerAvatar: user.profileImageUrl ?? "",
            callType: isVideo ? "video" : "audio",
            chatId,
          },
        });
      });

    return () => {
      supabase.removeChannel(ch);
      if (ringChannel.current) supabase.removeChannel(ringChannel.current);
    };
  }, [chatId, isVideo, peerId, role, router, user?.firstName, user?.id, user?.lastName, user?.profileImageUrl]);

  useEffect(() => {
    if (callStatus !== "connected") return;
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const handleEnd = async () => {
    setCallStatus("ended");
    await signalChannel.current?.send({
      type: "broadcast",
      event: "call-end",
      payload: {},
    });
    setTimeout(() => router.back(), 700);
  };

  const moreItems: ActionSheetItem[] = [
    {
      id: "toggle-video",
      label: isVideoCall ? "Switch to voice call" : "Switch to video call",
      icon: isVideoCall ? "phone" : "video",
      onPress: () => setIsVideoCall((v) => !v),
    },
    ...(isVideoCall
      ? [
          {
            id: "flip",
            label: "Flip camera",
            icon: "refresh-cw" as const,
            onPress: () => showToast("Camera switched", "info"),
          },
        ]
      : []),
    {
      id: "add-person",
      label: "Add person to call",
      icon: "user-plus",
      onPress: () => router.push("/new-message" as any),
    },
  ];

  const topPad = Platform.OS === "web" ? 16 : insets.top + 8;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={
          isVideoCall
            ? ["#0B0718", "#1A0D36", "#121216"]
            : ["#151132", "#221548", "#0B0B10"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.innerCol}>
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Minimize call"
          >
            <Feather name="chevron-down" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={styles.callTypeBadge}>
            <Feather
              name={isVideoCall ? "video" : "phone"}
              size={13}
              color="#FFFFFF"
            />
            <Text style={styles.callTypeTxt}>
              {isVideoCall ? "Video Call" : "Voice Call"}
            </Text>
          </View>

          <View style={{ width: 44 }} />
        </View>

        <View style={styles.peerSection}>
          <View style={styles.avatarRing}>
            <Avatar
              name={peerName}
              avatarUrl={params.peerAvatar}
              size={120}
              canvasColor="#1A0D36"
            />
          </View>

          <Text style={styles.peerName}>{peerName}</Text>
          <Text
            style={[
              styles.callStatus,
              TYPE.tabular,
              {
                color:
                  callStatus === "connected"
                    ? "#34D399"
                    : callStatus === "ended"
                    ? "#FB7185"
                    : "#C4B5FD",
              },
            ]}
          >
            {callStatus === "calling"
              ? "Calling..."
              : callStatus === "connected"
              ? formatDuration(duration)
              : "Call ended"}
          </Text>
          {isVideoCall && isCameraOff && (
            <Text style={styles.camOffHint}>Camera is off</Text>
          )}
        </View>

        <View
          style={[
            styles.controls,
            { paddingBottom: Platform.OS === "web" ? 28 : insets.bottom + 24 },
          ]}
        >
          <View style={styles.controlRow}>
            <Pressable
              onPress={() => setIsMuted((m) => !m)}
              style={[styles.ctrlBtn, isMuted && styles.ctrlActive]}
              accessibilityRole="button"
              accessibilityLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              <Feather
                name={isMuted ? "mic-off" : "mic"}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.ctrlLabel}>
                {isMuted ? "Unmute" : "Mute"}
              </Text>
            </Pressable>

            {isVideoCall && (
              <Pressable
                onPress={() => setIsCameraOff((c) => !c)}
                style={[styles.ctrlBtn, isCameraOff && styles.ctrlActive]}
                accessibilityRole="button"
                accessibilityLabel={
                  isCameraOff ? "Turn camera on" : "Turn camera off"
                }
              >
                <Feather
                  name={isCameraOff ? "video-off" : "video"}
                  size={22}
                  color="#FFFFFF"
                />
                <Text style={styles.ctrlLabel}>
                  {isCameraOff ? "Cam On" : "Cam Off"}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setIsSpeaker((s) => !s)}
              style={[styles.ctrlBtn, isSpeaker && styles.ctrlActive]}
              accessibilityRole="button"
              accessibilityLabel={
                isSpeaker ? "Switch to earpiece" : "Turn speaker on"
              }
            >
              <Feather
                name={isSpeaker ? "volume-2" : "volume-1"}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.ctrlLabel}>
                {isSpeaker ? "Speaker" : "Earpiece"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setMoreSheetOpen(true)}
              style={styles.ctrlBtn}
              accessibilityRole="button"
              accessibilityLabel="More call options"
            >
              <Feather name="more-horizontal" size={22} color="#FFFFFF" />
              <Text style={styles.ctrlLabel}>More</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleEnd}
            style={({ pressed }) => [
              styles.endBtn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="End call"
          >
            <Feather name="phone-off" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <ActionSheet
        visible={moreSheetOpen}
        title="Call Options"
        items={moreItems}
        onClose={() => setMoreSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#0B0B10",
  },
  innerCol: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
  },
  topBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  callTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    minHeight: 34,
    borderRadius: RADIUS.pill,
  },
  callTypeTxt: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "600" },
  peerSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  avatarRing: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(139,92,246,0.16)",
  },
  peerName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  callStatus: { fontSize: 16, fontWeight: "600" },
  camOffHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "500",
  },
  controls: { width: "100%", paddingHorizontal: 20 },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 8,
    marginBottom: 28,
  },
  ctrlBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 72,
    minHeight: 68,
  },
  ctrlActive: { backgroundColor: "rgba(139,92,246,0.45)" },
  ctrlLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11.5,
    fontWeight: "600",
  },
  endBtn: {
    backgroundColor: "#E11D48",
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
});
