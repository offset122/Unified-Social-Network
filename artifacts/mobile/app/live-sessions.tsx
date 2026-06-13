import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  useGetLiveSessions,
  useStartLiveSession,
  useEndLiveSession,
  useJoinLiveSession,
  useLeaveLiveSession,
  getGetLiveSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { io as ioClient, Socket } from "socket.io-client";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const apiPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
  return `${BASE_URL}${apiPath}`;
}

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return (
      <Image
        source={{ uri: resolveMediaUrl(avatarUrl) }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,58%)`,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

// ─── Chat Message Type ────────────────────────────────────────────────────────

type ChatMsg = { message: string; userName: string; timestamp: number };

// ─── Live Watch Screen ────────────────────────────────────────────────────────

function LiveWatchScreen({
  session,
  myName,
  onClose,
}: {
  session: any;
  myName: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [viewerCount, setViewerCount] = useState<number>(session.viewersCount ?? 0);
  const socketRef = useRef<Socket | null>(null);
  const chatListRef = useRef<ScrollView>(null);
  const joinLive = useJoinLiveSession();
  const leaveLive = useLeaveLiveSession();

  useEffect(() => {
    const socket = ioClient(BASE_URL || window?.location?.origin || "", {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("live:join", session.id);
    });

    socket.on("live:viewer-count", ({ count }: { count: number }) => {
      setViewerCount(count);
    });

    socket.on("live:chat", (msg: ChatMsg) => {
      setChatMsgs((prev) => [...prev, msg]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    socket.on("live:ended", () => {
      Alert.alert("Stream Ended", "The host has ended this live session.", [
        { text: "OK", onPress: onClose },
      ]);
    });

    joinLive.mutate({ sessionId: session.id });

    return () => {
      leaveLive.mutate({ sessionId: session.id });
      socket.emit("live:leave", session.id);
      socket.disconnect();
    };
  }, [session.id]);

  const sendChat = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg || !socketRef.current) return;
    socketRef.current.emit("live:chat", {
      sessionId: session.id,
      message: msg,
      userName: myName,
    });
    setChatInput("");
  }, [chatInput, session.id, myName]);

  return (
    <View style={[styles.watchContainer, { backgroundColor: "#000", paddingTop: insets.top }]}>
      {/* Video area placeholder */}
      <View style={styles.videoArea}>
        <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.videoCenter}>
          <Avatar name={session.host.displayName} avatarUrl={session.host.avatarUrl} size={80} />
          <Text style={styles.hostName}>{session.host.displayName}</Text>
          <Text style={styles.hostLiveLabel}>🔴 LIVE</Text>
          <Text style={styles.hostTitle}>{session.title}</Text>
        </View>

        {/* Header overlay */}
        <View style={styles.videoHeader}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
          <View style={styles.liveTagRow}>
            <View style={styles.liveTag}>
              <View style={styles.liveDotSmall} />
              <Text style={styles.liveTagText}>LIVE</Text>
            </View>
            <View style={styles.viewerPill}>
              <Feather name="eye" size={12} color="#fff" />
              <Text style={styles.viewerPillText}>{viewerCount}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Chat section */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.chatSection}
        keyboardVerticalOffset={insets.bottom + 10}
      >
        <ScrollView
          ref={chatListRef}
          style={styles.chatList}
          contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1, justifyContent: "flex-end" }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
        >
          {chatMsgs.length === 0 && (
            <Text style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", fontSize: 13 }}>
              Be the first to say something!
            </Text>
          )}
          {chatMsgs.map((msg, i) => (
            <View key={i} style={styles.chatBubble}>
              <Text style={styles.chatUser}>{msg.userName}</Text>
              <Text style={styles.chatText}>{msg.message}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.chatInputRow, { paddingBottom: insets.bottom || 12 }]}>
          <TextInput
            style={styles.chatInput}
            placeholder="Say something..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={chatInput}
            onChangeText={setChatInput}
            returnKeyType="send"
            onSubmitEditing={sendChat}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={sendChat}
            disabled={!chatInput.trim()}
            style={[styles.chatSendBtn, { opacity: chatInput.trim() ? 1 : 0.4 }]}
          >
            <Feather name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Go Live / Broadcast Screen ───────────────────────────────────────────────

function BroadcastScreen({
  session,
  myName,
  onEnd,
}: {
  session: any;
  myName: string;
  onEnd: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [viewerCount, setViewerCount] = useState<number>(session.viewersCount ?? 0);
  const socketRef = useRef<Socket | null>(null);
  const chatListRef = useRef<ScrollView>(null);

  useEffect(() => {
    const socket = ioClient(BASE_URL || (typeof window !== "undefined" ? window.location.origin : ""), {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("live:join", session.id);
    });

    socket.on("live:viewer-count", ({ count }: { count: number }) => {
      setViewerCount(count);
    });

    socket.on("live:chat", (msg: ChatMsg) => {
      setChatMsgs((prev) => [...prev.slice(-49), msg]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    return () => {
      socket.emit("live:leave", session.id);
      socket.disconnect();
    };
  }, [session.id]);

  return (
    <View style={[styles.watchContainer, { backgroundColor: "#000", paddingTop: insets.top }]}>
      {/* Camera preview placeholder */}
      <View style={styles.videoArea}>
        <LinearGradient colors={["#0f0f0f", "#1a1a1a", "#111"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.videoCenter}>
          <Avatar name={myName} size={80} />
          <Text style={styles.hostName}>{myName}</Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 4 }}>
            Camera preview on device
          </Text>
        </View>

        {/* Broadcast header */}
        <View style={styles.videoHeader}>
          <View style={styles.liveTagRow}>
            <View style={styles.liveTag}>
              <View style={styles.liveDotSmall} />
              <Text style={styles.liveTagText}>LIVE</Text>
            </View>
            <View style={styles.viewerPill}>
              <Feather name="eye" size={12} color="#fff" />
              <Text style={styles.viewerPillText}>{viewerCount} watching</Text>
            </View>
          </View>
          <Pressable
            onPress={onEnd}
            style={styles.endBroadcastBtn}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>END</Text>
          </Pressable>
        </View>
      </View>

      {/* Incoming chat */}
      <View style={styles.chatSection}>
        <ScrollView
          ref={chatListRef}
          style={styles.chatList}
          contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1, justifyContent: "flex-end" }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
        >
          {chatMsgs.length === 0 && (
            <Text style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", fontSize: 13 }}>
              Viewer messages will appear here
            </Text>
          )}
          {chatMsgs.map((msg, i) => (
            <View key={i} style={styles.chatBubble}>
              <Text style={styles.chatUser}>{msg.userName}</Text>
              <Text style={styles.chatText}>{msg.message}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LiveSessionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [showStartModal, setShowStartModal] = useState(false);
  const [liveTitle, setLiveTitle] = useState("");
  const [watchingSession, setWatchingSession] = useState<any | null>(null);
  const [broadcastSession, setBroadcastSession] = useState<any | null>(null);

  const { data: sessions, isLoading, refetch } = useGetLiveSessions();
  const startLive = useStartLiveSession();
  const endLive = useEndLiveSession();

  const handleStartLive = () => {
    startLive.mutate(
      { data: { title: liveTitle.trim() || "Live" } },
      {
        onSuccess: (session) => {
          setShowStartModal(false);
          setLiveTitle("");
          qc.invalidateQueries({ queryKey: getGetLiveSessionsQueryKey() });
          setBroadcastSession(session);
        },
        onError: () => Alert.alert("Error", "Failed to start live session."),
      },
    );
  };

  const handleEndLive = () => {
    Alert.alert("End Live", "Are you sure you want to end your live session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Live",
        style: "destructive",
        onPress: () => {
          endLive.mutate(undefined, {
            onSuccess: () => {
              setBroadcastSession(null);
              qc.invalidateQueries({ queryKey: getGetLiveSessionsQueryKey() });
            },
          });
        },
      },
    ]);
  };

  const liveSessions = Array.isArray(sessions) ? sessions : [];
  const mySession = liveSessions.find((s) => s.host.id === user?.id);
  const myName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You";

  // ── Full-screen watch view ──
  if (watchingSession) {
    return (
      <LiveWatchScreen
        session={watchingSession}
        myName={myName}
        onClose={() => setWatchingSession(null)}
      />
    );
  }

  // ── Full-screen broadcast view ──
  if (broadcastSession) {
    return (
      <BroadcastScreen
        session={broadcastSession}
        myName={myName}
        onEnd={handleEndLive}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Live", headerShown: true }} />

      {/* Go Live / End Live banner */}
      <View style={[styles.goLiveSection, { borderBottomColor: colors.border }]}>
        {mySession ? (
          <View style={{ gap: 10 }}>
            <View style={[styles.myLiveBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
              <View style={styles.liveDot} />
              <Text style={[styles.myLiveText, { color: colors.primary }]} numberOfLines={1}>
                You're live — "{mySession.title}"
              </Text>
              <Text style={[styles.myLiveViewers, { color: colors.mutedForeground }]}>
                {mySession.viewersCount} watching
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setBroadcastSession(mySession)}
                style={[styles.goBackBtn, { backgroundColor: colors.secondary, flex: 1 }]}
              >
                <Feather name="monitor" size={15} color={colors.foreground} />
                <Text style={[{ color: colors.foreground, fontWeight: "600" }]}>Go to Stream</Text>
              </Pressable>
              <Pressable
                onPress={handleEndLive}
                style={[styles.endBtn, { flex: 1 }]}
              >
                <Feather name="video-off" size={15} color="#fff" />
                <Text style={styles.endBtnText}>End Live</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowStartModal(true)}
            style={({ pressed }) => [styles.goLiveBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <LinearGradient colors={["#ef4444", "#dc2626"]} style={styles.goLiveGradient}>
              <Feather name="video" size={18} color="#fff" />
              <Text style={styles.goLiveBtnText}>Go Live</Text>
            </LinearGradient>
          </Pressable>
        )}
      </View>

      {/* Active sessions list */}
      <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Live Now</Text>
        <Pressable onPress={() => refetch()} hitSlop={10}>
          <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : liveSessions.filter((s) => s.host.id !== user?.id).length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="video" size={30} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No live sessions</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Be the first to go live!
          </Text>
        </View>
      ) : (
        <FlatList
          data={liveSessions.filter((s) => s.host.id !== user?.id)}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setWatchingSession(item)}
              style={({ pressed }) => [
                styles.sessionCard,
                { borderBottomColor: colors.border, backgroundColor: pressed ? colors.secondary : colors.background },
              ]}
            >
              <View style={{ position: "relative" }}>
                <Avatar name={item.host.displayName} avatarUrl={item.host.avatarUrl} size={52} />
                <View style={styles.liveIndicator}>
                  <Text style={styles.liveIndicatorText}>LIVE</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sessionHost, { color: colors.foreground }]}>{item.host.displayName}</Text>
                <Text style={[styles.sessionTitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.viewersRow}>
                  <Feather name="eye" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.viewersText, { color: colors.mutedForeground }]}>
                    {item.viewersCount} watching
                  </Text>
                </View>
              </View>
              <View style={[styles.watchBtn, { backgroundColor: colors.primary }]}>
                <Feather name="play" size={14} color="#fff" />
                <Text style={styles.watchBtnText}>Watch</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Start Live Modal */}
      {showStartModal && (
        <View style={StyleSheet.absoluteFillObject}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.5)" }]}
            onPress={() => setShowStartModal(false)}
          />
          <View style={[styles.modalCard, { backgroundColor: colors.background, bottom: insets.bottom || 20 }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Start Live Session</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Give your live a title so viewers know what to expect
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
              placeholder="Live title (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={liveTitle}
              onChangeText={setLiveTitle}
              maxLength={60}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowStartModal(false)}
                style={[styles.modalBtn, { backgroundColor: colors.secondary }]}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleStartLive}
                disabled={startLive.isPending}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
              >
                {startLive.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Go Live 🔴</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  goLiveSection: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  goLiveBtn: { borderRadius: 14, overflow: "hidden" },
  goLiveGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  goLiveBtnText: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  myLiveBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  myLiveText: { flex: 1, fontSize: 14, fontWeight: "600" },
  myLiveViewers: { fontSize: 13 },
  goBackBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10 },
  endBtn: { backgroundColor: "#ef4444", borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11 },
  endBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 16, fontWeight: "700" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptyDesc: { fontSize: 14, textAlign: "center" },

  sessionCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  liveIndicator: { position: "absolute", bottom: -2, alignSelf: "center", backgroundColor: "#ef4444", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  liveIndicatorText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  sessionHost: { fontSize: 15, fontWeight: "700" },
  sessionTitle: { fontSize: 13, marginTop: 2 },
  viewersRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  viewersText: { fontSize: 12 },
  watchBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  watchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  modalCard: { position: "absolute", left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.2)", alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalDesc: { fontSize: 14, lineHeight: 20 },
  modalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginTop: 4 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  modalBtnPrimary: { backgroundColor: "#ef4444" },

  // Watch / Broadcast styles
  watchContainer: { flex: 1 },
  videoArea: { flex: 1, position: "relative", minHeight: 260 },
  videoCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  hostName: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 12 },
  hostLiveLabel: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
  hostTitle: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  videoHeader: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  liveTagRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveTag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ef4444", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveTagText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  viewerPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  viewerPillText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  endBroadcastBtn: { backgroundColor: "#ef4444", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },

  chatSection: { height: 220, backgroundColor: "rgba(0,0,0,0.85)" },
  chatList: { flex: 1 },
  chatBubble: { flexDirection: "row", gap: 6, alignItems: "baseline" },
  chatUser: { color: "#a78bfa", fontWeight: "700", fontSize: 13 },
  chatText: { color: "#fff", fontSize: 13, flex: 1 },
  chatInputRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 8 },
  chatInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: "#fff", fontSize: 15 },
  chatSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
});
