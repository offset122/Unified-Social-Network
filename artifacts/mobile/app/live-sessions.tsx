import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  TextInput, Alert, Image, Platform, ScrollView, KeyboardAvoidingView, Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  fetchLiveSessions, startLiveSession, endLiveSession,
  fetchLiveMessages, sendLiveMessage,
  resolveMediaUrl, formatCount, timeAgo,
  type LiveSession, type LiveMessage, type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) return <Image source={{ uri: resolveMediaUrl(avatarUrl) }} style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

function LiveStreamModal({ session, onClose, userId }: { session: LiveSession; onClose: () => void; userId: string }) {
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const qc = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["live-messages", session.id],
    queryFn: () => fetchLiveMessages(session.id),
    refetchInterval: 3000,
  });

  const { data: liveData } = useQuery({
    queryKey: ["live-session", session.id],
    queryFn: async () => {
      const { data } = await supabase.from("live_sessions").select("*, profiles(*)").eq("id", session.id).single();
      return data as LiveSession | null;
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`live-chat-${session.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_messages", filter: `session_id=eq.${session.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["live-messages", session.id] });
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session.id]);

  const handleSend = async () => {
    if (!chatText.trim() || !userId) return;
    setSending(true);
    const text = chatText.trim();
    setChatText("");
    try {
      await sendLiveMessage(session.id, userId, text);
      qc.invalidateQueries({ queryKey: ["live-messages", session.id] });
    } catch { setChatText(text); }
    finally { setSending(false); }
  };

  const host = liveData?.profiles as Profile | undefined ?? session.profiles as Profile | undefined;
  const viewerCount = liveData?.viewers_count ?? session.viewers_count;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Video placeholder */}
      <LinearGradient colors={["#1a0533", "#2d1b69", "#0f172a"]} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <Feather name="radio" size={64} color="rgba(255,255,255,0.15)" />
        <Text style={{ color: "rgba(255,255,255,0.3)", marginTop: 12, fontSize: 15 }}>Live Stream</Text>
      </View>

      {/* Header */}
      <View style={[styles.liveHeader]}>
        <Pressable onPress={onClose} style={styles.liveBackBtn} hitSlop={8}>
          <Feather name="chevron-down" size={26} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.liveTitle} numberOfLines={1}>{session.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            <Avatar name={host?.display_name ?? "Host"} avatarUrl={host?.avatar_url} size={20} />
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{host?.display_name ?? "Host"}</Text>
          </View>
        </View>
        <View style={styles.liveStatsRow}>
          <Animated.View style={[styles.liveDotBadge, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.liveLabel}>LIVE</Text>
          <View style={styles.viewerBadge}>
            <Feather name="eye" size={12} color="#fff" />
            <Text style={styles.viewerCount}>{formatCount(viewerCount)}</Text>
          </View>
        </View>
      </View>

      {/* Chat overlay */}
      <View style={styles.liveChatWrap} pointerEvents="box-none">
        {isLoading ? null : (
          <FlatList
            ref={flatRef}
            data={messages as LiveMessage[]}
            keyExtractor={m => m.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item: m }) => {
              const p = m.profiles as Profile | undefined;
              return (
                <View style={styles.liveChatMsg}>
                  <View style={styles.liveChatBubble}>
                    <Text style={styles.liveChatUser}>{p?.username ?? "user"} </Text>
                    <Text style={styles.liveChatText}>{m.content}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* Chat input */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.liveChatInput}>
          <TextInput
            style={styles.liveChatField}
            placeholder="Say something..." placeholderTextColor="rgba(255,255,255,0.4)"
            value={chatText} onChangeText={setChatText}
            returnKeyType="send" onSubmitEditing={handleSend}
          />
          <Pressable onPress={handleSend} disabled={sending || !chatText.trim()} style={[styles.liveSendBtn, { opacity: chatText.trim() ? 1 : 0.4 }]}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function LiveSessionsScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [liveTitle, setLiveTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  const [watchingSession, setWatchingSession] = useState<LiveSession | null>(null);

  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ["live-sessions"],
    queryFn: fetchLiveSessions,
    refetchInterval: 8000,
  });

  // Realtime updates
  useEffect(() => {
    const ch = supabase.channel("live-sessions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["live-sessions"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleStartLive = async () => {
    if (!user?.id) return;
    const title = liveTitle.trim() || "My Live Stream";
    setStarting(true);
    try {
      const session = await startLiveSession(user.id, title);
      setMySessionId(session.id);
      setLiveTitle("");
      qc.invalidateQueries({ queryKey: ["live-sessions"] });
      setWatchingSession(session);
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setStarting(false); }
  };

  const handleEndLive = async (sessionId: string) => {
    Alert.alert("End Stream", "Are you sure you want to end your live stream?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End", style: "destructive", onPress: async () => {
          await endLiveSession(sessionId);
          setMySessionId(null);
          setWatchingSession(null);
          qc.invalidateQueries({ queryKey: ["live-sessions"] });
        }
      },
    ]);
  };

  if (watchingSession) {
    return (
      <View style={{ flex: 1 }}>
        <LiveStreamModal session={watchingSession} onClose={() => {
          if (watchingSession.id === mySessionId) handleEndLive(watchingSession.id);
          else setWatchingSession(null);
        }} userId={user?.id ?? ""} />
        {watchingSession.id === mySessionId && (
          <Pressable
            onPress={() => handleEndLive(watchingSession.id)}
            style={[styles.endLiveFloatBtn, { bottom: insets.bottom + 16 }]}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>END STREAM</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Live</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Go Live card */}
      <View style={[styles.goLiveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <LinearGradient colors={["#ef4444", "#b91c1c"]} style={styles.liveIconCircle}>
          <Feather name="radio" size={20} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.goLiveTitle, { color: colors.foreground }]}>
            {mySessionId ? "You are live 🔴" : "Start a Live Stream"}
          </Text>
          {!mySessionId ? (
            <TextInput
              style={[styles.titleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Give your stream a title..." placeholderTextColor={colors.mutedForeground}
              value={liveTitle} onChangeText={setLiveTitle}
            />
          ) : (
            <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: "600" }}>● Your session is live</Text>
          )}
        </View>
        {mySessionId ? (
          <View style={{ gap: 8 }}>
            <Pressable onPress={() => { const s = sessions.find(x => x.id === mySessionId); if (s) setWatchingSession(s); }} style={[styles.liveBtn, { backgroundColor: "#7c3aed" }]}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>View</Text>
            </Pressable>
            <Pressable onPress={() => handleEndLive(mySessionId)} style={[styles.liveBtn, { backgroundColor: "#ef4444" }]}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>End</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={handleStartLive} disabled={starting} style={[styles.liveBtn, { backgroundColor: "#ef4444" }]}>
            {starting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Go Live</Text>}
          </Pressable>
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LIVE NOW</Text>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (sessions as LiveSession[]).length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <LinearGradient colors={[colors.primary + "22", colors.primary + "08"]} style={{ width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" }}>
            <Feather name="radio" size={40} color={colors.primary} />
          </LinearGradient>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>No active streams</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center", paddingHorizontal: 40 }}>Be the first to go live and connect with your followers!</Text>
        </View>
      ) : (
        <FlatList
          data={sessions as LiveSession[]}
          keyExtractor={s => s.id}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 20 }}
          renderItem={({ item: s }) => {
            const host = s.profiles as Profile | undefined;
            return (
              <Pressable onPress={() => setWatchingSession(s)} style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <LinearGradient colors={["#1a0533", "#2d1b69"]} style={styles.sessionThumb}>
                  <Feather name="radio" size={24} color="rgba(255,255,255,0.35)" />
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDotSmall} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                </LinearGradient>
                <View style={styles.sessionInfo}>
                  <Text style={[styles.sessionTitle, { color: colors.foreground }]} numberOfLines={1}>{s.title}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <Avatar name={host?.display_name ?? "U"} avatarUrl={host?.avatar_url} size={18} />
                    <Text style={[styles.hostName, { color: colors.mutedForeground }]}>{host?.display_name ?? "Unknown"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }}>
                    <Feather name="eye" size={12} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{formatCount(s.viewers_count)} watching</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginLeft: 8 }}>· {timeAgo(s.started_at)}</Text>
                  </View>
                </View>
                <Pressable onPress={() => setWatchingSession(s)} style={[styles.joinBtn, { backgroundColor: "#ef4444" }]}>
                  <Feather name="play" size={12} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Join</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  goLiveCard: { flexDirection: "row", alignItems: "center", gap: 12, margin: 16, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  liveIconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  goLiveTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  titleInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14 },
  liveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, alignItems: "center" },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 20, marginBottom: 4, marginTop: 4 },
  sessionCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", padding: 0 },
  sessionThumb: { width: 80, height: 80, alignItems: "center", justifyContent: "center", position: "relative" },
  liveBadge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#ef4444", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  sessionInfo: { flex: 1, paddingVertical: 10 },
  sessionTitle: { fontSize: 14, fontWeight: "700" },
  hostName: { fontSize: 12 },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 10, margin: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  // Live stream modal
  liveHeader: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", padding: 16, paddingTop: 52, zIndex: 20 },
  liveBackBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  liveTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  liveStatsRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  liveDotBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  liveLabel: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  viewerBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 4 },
  viewerCount: { color: "#fff", fontSize: 12, fontWeight: "600" },
  liveChatWrap: { position: "absolute", bottom: 80, left: 0, right: 0, maxHeight: 280, paddingHorizontal: 12 },
  liveChatMsg: { flexDirection: "row" },
  liveChatBubble: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, maxWidth: "85%" },
  liveChatUser: { color: "#a78bfa", fontSize: 12, fontWeight: "700" },
  liveChatText: { color: "#fff", fontSize: 13 },
  liveChatInput: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.6)" },
  liveChatField: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  liveSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
  endLiveFloatBtn: { position: "absolute", left: "50%", transform: [{ translateX: -60 }], backgroundColor: "#ef4444", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, elevation: 8, shadowColor: "#ef4444", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
});
