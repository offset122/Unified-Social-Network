import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Platform,
  ActivityIndicator, Alert,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth";

type CallState = "calling" | "ringing" | "connected" | "ended" | "rejected" | "error";

export default function CallScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const params = useLocalSearchParams<{
    toId?: string; toName?: string; toAvatar?: string;
    callType?: string; isIncoming?: string; fromId?: string;
    offer?: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const isIncoming = params.isIncoming === "true";
  const callType = (params.callType ?? "audio") as "audio" | "video";
  const peerId = isIncoming ? (params.fromId ?? "") : (params.toId ?? "");
  const peerName = params.toName ?? "Unknown";
  const peerAvatar = params.toAvatar ?? null;

  const [callState, setCallState] = useState<CallState>(isIncoming ? "ringing" : "calling");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [duration, setDuration] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const endCall = useCallback(async (reason?: CallState) => {
    if (timerRef.current) clearInterval(timerRef.current);
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    const socket = await getSocket();
    if (socket && peerId) {
      socket.emit("call:end", { to: peerId });
    }
    setCallState(reason ?? "ended");
    setTimeout(() => router.back(), 1200);
  }, [peerId, router]);

  const rejectCall = useCallback(async () => {
    const socket = await getSocket();
    if (socket && peerId) {
      socket.emit("call:reject", { to: peerId });
    }
    setCallState("rejected");
    setTimeout(() => router.back(), 800);
  }, [peerId, router]);

  // WebRTC setup (web only — Expo Go native doesn't support RTCPeerConnection)
  const setupWebRTC = useCallback(async (isInitiator: boolean, incomingOffer?: string) => {
    if (Platform.OS !== "web") return null;
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      const constraints = callType === "video"
        ? { audio: true, video: true }
        : { audio: true, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => null);
      if (stream) {
        localStreamRef.current = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        if (localVideoRef.current && callType === "video") {
          localVideoRef.current.srcObject = stream;
        }
      }

      pc.ontrack = (evt) => {
        if (remoteVideoRef.current && evt.streams[0]) {
          remoteVideoRef.current.srcObject = evt.streams[0];
        }
      };

      const socket = await getSocket();
      if (!socket || !user?.id) return pc;

      pc.onicecandidate = (evt) => {
        if (evt.candidate && socket) {
          socket.emit("call:ice-candidate", { to: peerId, candidate: evt.candidate });
        }
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:offer", {
          to: peerId, from: user.id,
          fromName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "User",
          chatId, offer, callType,
        });
      } else if (incomingOffer) {
        await pc.setRemoteDescription(JSON.parse(incomingOffer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("call:answer", { to: peerId, answer });
      }

      return pc;
    } catch {
      return null;
    }
  }, [callType, chatId, peerId, user]);

  useEffect(() => {
    let active = true;

    const setup = async () => {
      const socket = await getSocket();
      if (!socket || !active) return;

      if (user?.id) socket.emit("join", user.id);

      if (!isIncoming) {
        // Outgoing call
        if (Platform.OS === "web") {
          await setupWebRTC(true);
        } else {
          // On native Expo Go: just signal via socket
          socket.emit("call:offer", {
            to: peerId, from: user?.id ?? "",
            fromName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User",
            chatId, offer: null, callType,
          });
        }
      } else {
        // Incoming: auto-accept was triggered by user tapping Accept
        if (Platform.OS === "web") {
          await setupWebRTC(false, params.offer);
        }
      }

      socket.on("call:answer", async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
        if (!active) return;
        if (pcRef.current && answer) {
          await pcRef.current.setRemoteDescription(answer).catch(() => {});
        }
        setCallState("connected");
        startTimer();
      });

      socket.on("call:ice-candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        if (pcRef.current && candidate) {
          await pcRef.current.addIceCandidate(candidate).catch(() => {});
        }
      });

      socket.on("call:end", () => {
        if (!active) return;
        setCallState("ended");
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeout(() => { if (active) router.back(); }, 1000);
      });

      socket.on("call:reject", () => {
        if (!active) return;
        setCallState("rejected");
        setTimeout(() => { if (active) router.back(); }, 1000);
      });

      // For native outgoing: simulate connected after 1s if peer accepted
      if (Platform.OS !== "web" && !isIncoming) {
        // Will be updated when call:answer comes in from socket
      }

      // For incoming on native: mark as connected immediately (user already accepted)
      if (Platform.OS !== "web" && isIncoming) {
        setCallState("connected");
        startTimer();
      }
    };

    setup();

    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      getSocket().then((s) => {
        s?.off("call:answer");
        s?.off("call:ice-candidate");
        s?.off("call:end");
        s?.off("call:reject");
      });
    };
  }, []);

  const stateLabel: Record<CallState, string> = {
    calling: `${callType === "video" ? "Video" : "Voice"} calling…`,
    ringing: "Incoming call",
    connected: formatDuration(duration),
    ended: "Call ended",
    rejected: "Call declined",
    error: "Call failed",
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 32 }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.peerSection}>
        <Avatar name={peerName} avatarUrl={peerAvatar} size={96} />
        <Text style={styles.peerName}>{peerName}</Text>
        <Text style={styles.stateLabel}>{stateLabel[callState]}</Text>
        {callType === "video" && callState === "connected" && Platform.OS !== "web" && (
          <View style={styles.nativeBanner}>
            <Feather name="info" size={13} color="rgba(255,255,255,0.6)" />
            <Text style={styles.nativeBannerText}>Video requires a native build</Text>
          </View>
        )}
        {(callState === "calling" || callState === "ringing") && (
          <View style={styles.pulseRing} />
        )}
      </View>

      {/* Ringing — accept / decline */}
      {callState === "ringing" && (
        <View style={styles.controlRow}>
          <Pressable onPress={rejectCall} style={[styles.ctrlBtn, styles.ctrlEnd]}>
            <Feather name="phone-off" size={28} color="#fff" />
          </Pressable>
          <Pressable
            onPress={async () => {
              setCallState("connected");
              startTimer();
              if (Platform.OS === "web") await setupWebRTC(false, params.offer);
            }}
            style={[styles.ctrlBtn, styles.ctrlAccept]}
          >
            <Feather name="phone" size={28} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Active call controls */}
      {(callState === "calling" || callState === "connected") && (
        <View style={styles.controlRow}>
          <Pressable onPress={() => setIsMuted(!isMuted)} style={[styles.ctrlBtn, styles.ctrlSm, { backgroundColor: isMuted ? "#fff" : "rgba(255,255,255,0.15)" }]}>
            <Feather name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? "#000" : "#fff"} />
          </Pressable>
          <Pressable onPress={() => endCall("ended")} style={[styles.ctrlBtn, styles.ctrlEnd]}>
            <Feather name="phone-off" size={28} color="#fff" />
          </Pressable>
          <Pressable onPress={() => setIsSpeaker(!isSpeaker)} style={[styles.ctrlBtn, styles.ctrlSm, { backgroundColor: isSpeaker ? "#fff" : "rgba(255,255,255,0.15)" }]}>
            <Feather name="volume-2" size={22} color={isSpeaker ? "#000" : "#fff"} />
          </Pressable>
        </View>
      )}

      {(callState === "ended" || callState === "rejected" || callState === "error") && (
        <View style={styles.endedRow}>
          <Text style={styles.endedText}>{stateLabel[callState]}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a0533",
    alignItems: "center",
    justifyContent: "space-between",
  },
  peerSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, position: "relative" },
  peerName: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: 8 },
  stateLabel: { color: "rgba(255,255,255,0.7)", fontSize: 16 },
  pulseRing: {
    position: "absolute",
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.2)",
    top: "50%", left: "50%",
    marginTop: -60, marginLeft: -60,
  },
  nativeBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  nativeBannerText: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingBottom: 16,
  },
  ctrlBtn: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
  ctrlEnd: { backgroundColor: "#ef4444", width: 72, height: 72, borderRadius: 36 },
  ctrlAccept: { backgroundColor: "#22c55e", width: 72, height: 72, borderRadius: 36 },
  ctrlSm: { backgroundColor: "rgba(255,255,255,0.15)" },
  endedRow: { paddingBottom: 32, alignItems: "center" },
  endedText: { color: "rgba(255,255,255,0.6)", fontSize: 16 },
});
