import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  TextInput, Alert, Image, Platform, ScrollView, KeyboardAvoidingView,
  Animated, Dimensions, Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  fetchLiveSessions, startLiveSession, endLiveSession,
  fetchLiveMessages, sendLiveMessage,
  resolveMediaUrl, formatCount, timeAgo,
  type LiveSession, type LiveMessage, type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";

const { width: W, height: H } = Dimensions.get("window");

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "👏", "😍", "🎉", "💯", "🤩"];

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
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
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

// ─── Floating Reaction ────────────────────────────────────────────────────────

type FloatingItem = { id: number; emoji: string; x: number };

function FloatingReaction({ item, onDone }: { item: FloatingItem; onDone: (id: number) => void }) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.timing(y, { toValue: -220, duration: 2200, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    ]).start(() => onDone(item.id));
  }, []);

  return (
    <Animated.Text
      style={{
        position: "absolute",
        bottom: 0,
        left: item.x,
        fontSize: 36,
        opacity,
        transform: [{ translateY: y }, { scale }],
        pointerEvents: "none" as any,
      }}
    >
      {item.emoji}
    </Animated.Text>
  );
}

// ─── Floating Heart (like button) ─────────────────────────────────────────────

function FloatingHeart({ onDone }: { onDone: () => void }) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const x = (Math.random() - 0.5) * 50;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60 }),
      Animated.timing(y, { toValue: -160, duration: 1800, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 80,
        right: 24,
        transform: [{ translateY: y }, { translateX: x }, { scale }],
        opacity,
        pointerEvents: "none" as any,
      }}
    >
      <AntDesign name="heart" size={28} color="#ff3b5c" />
    </Animated.View>
  );
}

// ─── Host Camera View ─────────────────────────────────────────────────────────

function HostCameraPreview({ isActive }: { isActive: boolean }) {
  const [hasPerm, setHasPerm] = useState<boolean | null>(null);
  const [CameraView, setCameraView] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      try {
        const mod = await import("expo-camera");
        const result = await mod.Camera.requestCameraPermissionsAsync();
        if (result.granted) {
          setCameraView(() => mod.CameraView);
          setHasPerm(true);
        } else {
          setHasPerm(false);
        }
      } catch {
        setHasPerm(false);
      }
    })();
  }, []);

  if (Platform.OS === "web" || hasPerm === false || !CameraView) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={["#1a0533", "#2d1b69", "#0f172a"]} style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Feather name="video-off" size={52} color="rgba(255,255,255,0.25)" />
          <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 14 }}>
            {Platform.OS === "web" ? "Camera preview on mobile" : "Camera unavailable"}
          </Text>
        </View>
      </View>
    );
  }

  if (hasPerm === null) {
    return (
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "#000" }]}>
        <ActivityIndicator color="#7c3aed" />
      </View>
    );
  }

  return <CameraView style={StyleSheet.absoluteFill} facing="front" />;
}

// ─── Live Stream Viewer/Host Modal ────────────────────────────────────────────

function LiveStreamModal({
  session, onClose, userId, isHost,
}: {
  session: LiveSession; onClose: () => void; userId: string; isHost: boolean;
}) {
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const [reactions, setReactions] = useState<FloatingItem[]>([]);
  const [hearts, setHearts] = useState<number[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [showEmojiBar, setShowEmojiBar] = useState(true);
  const flatRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const nextId = useRef(0);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["live-messages", session.id],
    queryFn: () => fetchLiveMessages(session.id),
    refetchInterval: 2500,
  });

  const { data: liveData } = useQuery({
    queryKey: ["live-session", session.id],
    queryFn: async () => {
      const { data } = await supabase.from("live_sessions").select("*, profiles(*)").eq("id", session.id).single();
      return data as LiveSession | null;
    },
    refetchInterval: 4000,
  });

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
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

  const sendEmoji = async (emoji: string) => {
    const id = nextId.current++;
    const x = 40 + Math.random() * (W - 120);
    setReactions(prev => [...prev, { id, emoji, x }]);
    if (userId) {
      try {
        await sendLiveMessage(session.id, userId, emoji);
        qc.invalidateQueries({ queryKey: ["live-messages", session.id] });
      } catch {}
    }
  };

  const handleLike = () => {
    setIsLiked(true);
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.5, useNativeDriver: true, speed: 80 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 80 }),
    ]).start();
    const id = Date.now();
    setHearts(prev => [...prev, id]);
    setTimeout(() => setHearts(prev => prev.filter(h => h !== id)), 2500);
  };

  const removeReaction = useCallback((id: number) => {
    setReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  const host = (liveData?.profiles ?? session.profiles) as Profile | undefined;
  const viewerCount = liveData?.viewers_count ?? session.viewers_count;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {isHost ? (
        <HostCameraPreview isActive />
      ) : (
        <>
          <LinearGradient colors={["#1a0533", "#2d1b69", "#0f172a"]} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="radio" size={72} color="rgba(255,255,255,0.1)" />
          </View>
        </>
      )}

      {/* Bottom gradient for chat readability */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.95)"]}
        style={[StyleSheet.absoluteFill, { top: "40%", pointerEvents: "none" } as any]}
      />

      {/* Top gradient */}
      <LinearGradient
        colors={["rgba(0,0,0,0.7)", "transparent"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, pointerEvents: "none" } as any}
      />

      {/* Header */}
      <View style={[LS.liveHeader, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onClose} style={LS.liveBackBtn} hitSlop={10}>
          <Feather name="chevron-down" size={28} color="#fff" />
        </Pressable>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={LS.liveTitle} numberOfLines={1}>{session.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <Avatar name={host?.display_name ?? "Host"} avatarUrl={host?.avatar_url} size={18} />
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{host?.display_name ?? "Host"}</Text>
          </View>
        </View>

        <View style={LS.liveStatsRow}>
          <Animated.View style={[LS.liveDotBadge, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={LS.liveLabel}>LIVE</Text>
          <View style={LS.viewerBadge}>
            <Feather name="eye" size={11} color="#fff" />
            <Text style={LS.viewerCount}>{formatCount(viewerCount)}</Text>
          </View>
        </View>
      </View>

      {/* Floating reactions */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}>
        {reactions.map(r => (
          <FloatingReaction key={r.id} item={r} onDone={removeReaction} />
        ))}
        {hearts.map(id => (
          <FloatingHeart key={id} onDone={() => setHearts(prev => prev.filter(h => h !== id))} />
        ))}
      </View>

      {/* Chat list */}
      <KeyboardAvoidingView
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[LS.liveChatWrap, { pointerEvents: "box-none" } as any]}>
          {!isLoading && (
            <FlatList
              ref={flatRef}
              data={messages as LiveMessage[]}
              keyExtractor={m => m.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 5, paddingBottom: 6 }}
              onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item: m }) => {
                const p = m.profiles as Profile | undefined;
                const isEmoji = /^\p{Emoji}+$/u.test(m.content?.trim() ?? "");
                if (isEmoji) {
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 4 }}>
                      <Avatar name={p?.username ?? "U"} avatarUrl={p?.avatar_url} size={16} />
                      <Text style={{ fontSize: 20 }}>{m.content}</Text>
                    </View>
                  );
                }
                return (
                  <View style={LS.liveChatMsg}>
                    <View style={LS.liveChatBubble}>
                      <Text style={LS.liveChatUser}>{p?.username ?? "user"} </Text>
                      <Text style={LS.liveChatText}>{m.content}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* Emoji quick bar */}
        {showEmojiBar && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={LS.emojiBar}
            style={LS.emojiBarWrap}
          >
            {QUICK_EMOJIS.map(e => (
              <Pressable key={e} onPress={() => sendEmoji(e)} style={LS.emojiBtn}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Bottom row: chat input + like */}
        <View style={[LS.liveChatInput, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable onPress={() => setShowEmojiBar(e => !e)} style={LS.emojiToggle}>
            <Text style={{ fontSize: 22 }}>😊</Text>
          </Pressable>

          <TextInput
            style={LS.liveChatField}
            placeholder="Say something…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={chatText}
            onChangeText={setChatText}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          {chatText.trim() ? (
            <Pressable
              onPress={handleSend}
              disabled={sending}
              style={[LS.liveSendBtn, { opacity: chatText.trim() ? 1 : 0.4 }]}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Feather name="send" size={16} color="#fff" />
              }
            </Pressable>
          ) : (
            <Pressable onPress={handleLike} style={LS.liveLikeBtn}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <AntDesign name={isLiked ? "heart" : "hearto"} size={22} color={isLiked ? "#ff3b5c" : "#fff"} />
              </Animated.View>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

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

  const handleEndLive = (sessionId: string) => {
    Alert.alert("End Stream", "End your live stream?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Stream", style: "destructive", onPress: async () => {
          await endLiveSession(sessionId);
          setMySessionId(null);
          setWatchingSession(null);
          qc.invalidateQueries({ queryKey: ["live-sessions"] });
        },
      },
    ]);
  };

  if (watchingSession) {
    const isHost = watchingSession.id === mySessionId;
    return (
      <View style={{ flex: 1 }}>
        <LiveStreamModal
          session={watchingSession}
          onClose={() => {
            if (isHost) handleEndLive(watchingSession.id);
            else {
              // Decrement viewer count on leave
              supabase.rpc("decrement_live_viewers" as any, { session_id: watchingSession.id }).then(() =>
                qc.invalidateQueries({ queryKey: ["live-sessions"] })
              );
              setWatchingSession(null);
            }
          }}
          userId={user?.id ?? ""}
          isHost={isHost}
        />
        {isHost && (
          <Pressable
            onPress={() => handleEndLive(watchingSession.id)}
            style={[LS.endLiveBtn, { bottom: 80 }]}
          >
            <View style={LS.endLiveDot} />
            <Text style={LS.endLiveText}>END STREAM</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={[LS.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[LS.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[LS.headerTitle, { color: colors.foreground }]}>Live</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Go Live card */}
      <LinearGradient
        colors={["#7c3aed22", "#ef444411"]}
        style={[LS.goLiveCard, { borderColor: colors.border }]}
      >
        <LinearGradient colors={["#ef4444", "#b91c1c"]} style={LS.liveIconCircle}>
          <Feather name="radio" size={22} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[LS.goLiveTitle, { color: colors.foreground }]}>
            {mySessionId ? "🔴 You're Live!" : "Start a Live Stream"}
          </Text>
          {!mySessionId ? (
            <TextInput
              style={[LS.titleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background + "cc" }]}
              placeholder="Stream title…"
              placeholderTextColor={colors.mutedForeground}
              value={liveTitle}
              onChangeText={setLiveTitle}
            />
          ) : (
            <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: "600" }}>Tap View to return to your stream</Text>
          )}
        </View>
        {mySessionId ? (
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => { const s = (sessions as LiveSession[]).find(x => x.id === mySessionId); if (s) setWatchingSession(s); }}
              style={[LS.liveBtn, { backgroundColor: "#7c3aed" }]}
            >
              <Feather name="eye" size={13} color="#fff" />
              <Text style={LS.liveBtnText}>View</Text>
            </Pressable>
            <Pressable onPress={() => handleEndLive(mySessionId)} style={[LS.liveBtn, { backgroundColor: "#ef4444" }]}>
              <Text style={LS.liveBtnText}>End</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={handleStartLive} disabled={starting} style={[LS.liveBtn, { backgroundColor: "#ef4444" }]}>
            {starting
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Feather name="video" size={13} color="#fff" /><Text style={LS.liveBtnText}>Go Live</Text></>
            }
          </Pressable>
        )}
      </LinearGradient>

      <Text style={[LS.sectionLabel, { color: colors.mutedForeground }]}>LIVE NOW</Text>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (sessions as LiveSession[]).length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <LinearGradient
            colors={[colors.primary + "30", colors.primary + "08"]}
            style={{ width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="radio" size={44} color={colors.primary} />
          </LinearGradient>
          <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800" }}>No live streams</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center", paddingHorizontal: 40, lineHeight: 21 }}>
            Be the first to go live and connect with your community!
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions as LiveSession[]}
          keyExtractor={s => s.id}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item: s }) => {
            const host = s.profiles as Profile | undefined;
            return (
              <Pressable
                onPress={() => {
                  // Increment viewer count on join
                  supabase.rpc("increment_live_viewers" as any, { session_id: s.id }).then(() =>
                    qc.invalidateQueries({ queryKey: ["live-sessions"] })
                  );
                  setWatchingSession(s);
                }}
                style={({ pressed }) => [LS.sessionCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.92 : 1 }]}
              >
                <LinearGradient colors={["#1a0533", "#2d1b69"]} style={LS.sessionThumb}>
                  <Feather name="radio" size={26} color="rgba(255,255,255,0.3)" />
                  <View style={LS.liveBadge}>
                    <View style={LS.liveDotSmall} />
                    <Text style={LS.liveBadgeText}>LIVE</Text>
                  </View>
                </LinearGradient>
                <View style={LS.sessionInfo}>
                  <Text style={[LS.sessionTitle, { color: colors.foreground }]} numberOfLines={1}>{s.title}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <Avatar name={host?.display_name ?? "U"} avatarUrl={host?.avatar_url} size={18} />
                    <Text style={[LS.hostName, { color: colors.mutedForeground }]}>{host?.display_name ?? "Unknown"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                    <Feather name="eye" size={12} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{formatCount(s.viewers_count)} watching</Text>
                    <Text style={{ color: colors.border, fontSize: 12 }}>·</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{timeAgo(s.started_at)}</Text>
                  </View>
                </View>
                <Pressable onPress={() => {
                    supabase.rpc("increment_live_viewers" as any, { session_id: s.id }).then(() =>
                      qc.invalidateQueries({ queryKey: ["live-sessions"] })
                    );
                    setWatchingSession(s);
                  }} style={LS.joinBtn}>
                  <Feather name="play" size={12} color="#fff" />
                  <Text style={LS.joinBtnText}>Join</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const LS = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },

  goLiveCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    margin: 16, padding: 16, borderRadius: 20, borderWidth: 1,
  },
  liveIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  goLiveTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  titleInput: {
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 8, fontSize: 14,
  },
  liveBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
  },
  liveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.9,
    textTransform: "uppercase", paddingHorizontal: 20, marginBottom: 4, marginTop: 2,
  },

  sessionCard: {
    flexDirection: "row", alignItems: "center", gap: 0,
    borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  sessionThumb: {
    width: 86, height: 86, alignItems: "center", justifyContent: "center",
  },
  liveBadge: {
    position: "absolute", top: 7, left: 7, flexDirection: "row",
    alignItems: "center", gap: 3, backgroundColor: "#ef4444",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  sessionInfo: { flex: 1, paddingVertical: 10, paddingLeft: 12 },
  sessionTitle: { fontSize: 14, fontWeight: "700" },
  hostName: { fontSize: 12 },
  joinBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#ef4444", paddingHorizontal: 14,
    paddingVertical: 10, margin: 12, borderRadius: 12,
  },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  // Live modal
  liveHeader: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12, zIndex: 20,
  },
  liveBackBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  liveTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  liveStatsRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  liveDotBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  liveLabel: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  viewerBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 4 },
  viewerCount: { color: "#fff", fontSize: 12, fontWeight: "600" },

  liveChatWrap: { maxHeight: 260, paddingHorizontal: 14, paddingBottom: 8 },
  liveChatMsg: { flexDirection: "row" },
  liveChatBubble: {
    flexDirection: "row", flexWrap: "wrap", backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, maxWidth: "88%",
  },
  liveChatUser: { color: "#a78bfa", fontSize: 12, fontWeight: "700" },
  liveChatText: { color: "#fff", fontSize: 13 },

  emojiBarWrap: { backgroundColor: "rgba(0,0,0,0.5)" },
  emojiBar: {
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  emojiBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },

  liveChatInput: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  emojiToggle: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
  },
  liveChatField: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  liveSendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#7c3aed",
    alignItems: "center", justifyContent: "center",
  },
  liveLikeBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  endLiveBtn: {
    position: "absolute", alignSelf: "center", left: "50%",
    transform: [{ translateX: -72 }],
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#ef4444",
    paddingHorizontal: 24, paddingVertical: 13, borderRadius: 28,
    elevation: 10, shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10,
  },
  endLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  endLiveText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
});
