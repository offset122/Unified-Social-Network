import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
  Image,
  Modal,
  ScrollView,
  Animated,
  Clipboard,
  PanResponder,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import { Audio, Video, ResizeMode } from "expo-av";
import {
  useChatTheme,
  getBubbleRadius,
  getFontSize,
  type WallpaperKey,
} from "@/lib/chatTheme";
import {
  fetchMessages,
  sendMessage,
  deleteMessage,
  markConversationRead,
  uploadMedia,
  resolveMediaUrl,
  generateAIReplySuggestion,
  generateAICaption,
  toggleReaction,
  fetchReactionsForConversation,
  adjustAITone,
  summarizeAIChat,
  translateAIText,
  timeAgo,
  type Message,
  type Profile,
} from "@/lib/db";

// ─── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: "#0F1117",
  surface: "#1A1D27",
  surfaceHigh: "#1E2232",
  border: "#252836",
  primary: "#6366F1",
  primaryLight: "#818CF8",
  text: "#E2E8F0",
  textMuted: "#6B7280",
  textDim: "#4B5168",
  myBubble1: "#6366F1",
  myBubble2: "#818CF8",
  theirBubble: "#1E2232",
  theirBubbleBorder: "#2D3150",
  red: "#EF4444",
  green: "#22C55E",
};

// ─── ChatWallpaper ──────────────────────────────────────────────────────────────

function ChatWallpaper({ wallpaper, accent }: { wallpaper: WallpaperKey; accent: string }) {
  if (wallpaper === "none") return null;
  if (wallpaper === "gradient") {
    return (
      <LinearGradient
        colors={[accent + "14", C.bg, accent + "0A"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
      />
    );
  }
  const size = wallpaper === "dots" ? 24 : wallpaper === "grid" ? 32 : 40;
  if (wallpaper === "waves") {
    return (
      <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.04 }]} pointerEvents="none">
        {Array.from({ length: 20 }).map((_, i) => (
          <View key={i} style={{ position: "absolute", left: -20, right: -20, top: i * 28 - 10, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: accent }} />
        ))}
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.05 }]} pointerEvents="none">
      {Array.from({ length: 30 }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {Array.from({ length: 20 }).map((_, col) => (
            <View key={col} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
              {wallpaper === "dots"
                ? <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: accent }} />
                : <View style={{ width: size - 3, height: size - 3, borderWidth: 0.5, borderColor: accent }} />}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
}) {
  const [err, setErr] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
    <LinearGradient
      colors={[`hsl(${hue},60%,52%)`, `hsl(${(hue + 40) % 360},70%,38%)`]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}>{initials}</Text>
    </LinearGradient>
  );
}

// ─── AudioPlayer ────────────────────────────────────────────────────────────────

function AudioPlayer({ uri, isMine }: { uri: string; isMine: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  const toggle = async () => {
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync(
        { uri: resolveMediaUrl(uri) },
        { shouldPlay: true }
      );
      setSound(s);
      setPlaying(true);
      s.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) return;
        setPosition(st.positionMillis ?? 0);
        setDuration(st.durationMillis ?? 0);
        if (st.didJustFinish) {
          setPlaying(false);
          setPosition(0);
        }
      });
    } else if (playing) {
      await sound.pauseAsync();
      setPlaying(false);
    } else {
      await sound.playAsync();
      setPlaying(true);
    }
  };

  useEffect(() => () => { sound?.unloadAsync(); }, [sound]);

  const pct = duration > 0 ? position / duration : 0;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // Fake waveform bars (visual only)
  const bars = [0.4, 0.7, 0.55, 0.9, 0.65, 0.45, 0.8, 0.6, 0.75, 0.5, 0.85, 0.4, 0.7, 0.6, 0.5];
  const filledBars = Math.floor(pct * bars.length);

  return (
    <Pressable
      onPress={toggle}
      style={[
        styles.audioBubble,
        { backgroundColor: isMine ? "rgba(255,255,255,0.12)" : C.surface },
      ]}
    >
      <Pressable
        onPress={toggle}
        style={[
          styles.audioPlayBtn,
          { backgroundColor: isMine ? "rgba(255,255,255,0.25)" : C.primary + "33" },
        ]}
      >
        <Feather name={playing ? "pause" : "play"} size={13} color={isMine ? "#fff" : C.primary} />
      </Pressable>

      <View style={{ flex: 1, gap: 5 }}>
        {/* Waveform bars */}
        <View style={styles.waveformRow}>
          {bars.map((h, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                {
                  height: h * 22,
                  backgroundColor:
                    i < filledBars
                      ? isMine ? "rgba(255,255,255,0.9)" : C.primary
                      : isMine ? "rgba(255,255,255,0.25)" : C.border,
                },
              ]}
            />
          ))}
        </View>
        <Text style={{ color: isMine ? "rgba(255,255,255,0.55)" : C.textDim, fontSize: 10, fontWeight: "500" }}>
          {duration > 0 ? `${fmt(position)} / ${fmt(duration)}` : "Voice message"}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── SharedPostBubble ────────────────────────────────────────────────────────────

function SharedPostBubble({
  post,
  isMine,
  onPress,
}: {
  post: any;
  isMine: boolean;
  onPress: () => void;
}) {
  const media = post.media_urls?.[0] ? resolveMediaUrl(post.media_urls[0]) : null;
  const profile = post.profiles as Profile | undefined;
  const postContent = post.content?.trim() ?? "";
  const profileHandle = profile?.username ? `@${profile.username}` : "";
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.sharedPost,
        {
          backgroundColor: isMine ? "rgba(255,255,255,0.1)" : C.surface,
          borderColor: isMine ? "rgba(255,255,255,0.18)" : C.border,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <Feather name="share-2" size={10} color={isMine ? "rgba(255,255,255,0.5)" : C.textDim} />
        <Text style={{ color: isMine ? "rgba(255,255,255,0.5)" : C.textDim, fontSize: 11, fontWeight: "600", letterSpacing: 0.3 }}>
          SHARED POST
        </Text>
      </View>
      {media && (
        <Image source={{ uri: media }} style={styles.sharedPostImg} resizeMode="cover" />
      )}
      {!!postContent && (
        <Text
          style={{ color: isMine ? "#fff" : C.text, fontSize: 13, lineHeight: 18, marginTop: media ? 6 : 0 }}
          numberOfLines={2}
        >
          {postContent}
        </Text>
      )}
      {!!profileHandle && (
        <Text style={{ color: isMine ? "rgba(255,255,255,0.4)" : C.textDim, fontSize: 11, marginTop: 5 }}>
          {profileHandle}
        </Text>
      )}
    </Pressable>
  );
}

// ─── MediaBubble ────────────────────────────────────────────────────────────────

function MediaBubble({
  msg,
  isMine,
  router,
}: {
  msg: Message;
  isMine: boolean;
  router: any;
}) {
  if (msg.shared_post) {
    return (
      <SharedPostBubble
        post={msg.shared_post}
        isMine={isMine}
        onPress={() => router.push(`/post/${msg.shared_post!.id}` as any)}
      />
    );
  }
  if (!msg.media_url) return null;
  const uri = resolveMediaUrl(msg.media_url);
  const fileName = msg.media_url.split("/").pop() ?? "file";

  if (msg.media_type === "audio") return <AudioPlayer uri={uri} isMine={isMine} />;
  if (msg.media_type === "image")
    return <Image source={{ uri }} style={styles.msgImage} resizeMode="cover" />;
  if (msg.media_type === "video")
    return (
      <View style={styles.msgVideo}>
        <Video
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={false}
          useNativeControls
        />
      </View>
    );
  return (
    <View
      style={[
        styles.fileBubble,
        { backgroundColor: isMine ? "rgba(255,255,255,0.15)" : C.surface },
      ]}
    >
      <Feather name="file" size={16} color={isMine ? "#fff" : C.primary} />
      <Text
        style={{ color: isMine ? "#fff" : C.text, fontSize: 13, marginLeft: 8, flex: 1 }}
        numberOfLines={1}
      >
        {fileName}
      </Text>
    </View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isMine,
  showAvatar,
  isGrouped,
  onLongPress,
  router,
  translatingMsgId,
  translatedText,
}: {
  msg: Message;
  isMine: boolean;
  showAvatar: boolean;
  isGrouped: boolean;
  onLongPress: (msg: Message) => void;
  router: any;
  translatingMsgId?: string | null;
  translatedText?: string;
}) {
  const profile = msg.profiles as Profile | undefined;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { theme: ct } = useChatTheme();
  const bubbleRadius = getBubbleRadius(ct.bubbleStyle, isMine);
  const isMinimal = ct.bubbleStyle === "minimal";

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  if (msg.is_deleted) {
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther, isGrouped && styles.msgGrouped]}>
        {!isMine && <View style={{ width: 30 }} />}
        <View style={styles.deletedBubble}>
          <Feather name="slash" size={11} color={C.textDim} />
          <Text style={styles.deletedText}>Message removed</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther, isGrouped && styles.msgGrouped]}>
      {!isMine ? (
        showAvatar ? (
          <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={28} />
        ) : (
          <View style={{ width: 28 }} />
        )
      ) : null}

      <Animated.View style={{ transform: [{ scale: scaleAnim }], maxWidth: "75%" }}>
        <Pressable onLongPress={() => onLongPress(msg)} onPressIn={onPressIn} onPressOut={onPressOut} delayLongPress={300}>
          {isMine ? (
            isMinimal ? (
              <View style={[styles.bubble, bubbleRadius, { backgroundColor: "transparent", borderWidth: 1.5, borderColor: ct.accentColor }]}>
                <BubbleContents msg={msg} isMine={isMine} router={router} translatingMsgId={translatingMsgId} translatedText={translatedText} />
              </View>
            ) : (
              <LinearGradient
                colors={[ct.myBubbleColor, ct.accentColor + "CC"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, bubbleRadius]}
              >
                <BubbleContents msg={msg} isMine={isMine} router={router} translatingMsgId={translatingMsgId} translatedText={translatedText} />
              </LinearGradient>
            )
          ) : (
            <View style={[styles.bubble, bubbleRadius, { backgroundColor: ct.theirBubbleColor, borderWidth: isMinimal ? 1 : 1, borderColor: isMinimal ? C.border : C.theirBubbleBorder }]}>
              <BubbleContents msg={msg} isMine={isMine} router={router} translatingMsgId={translatingMsgId} translatedText={translatedText} />
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function BubbleContents({
  msg,
  isMine,
  router,
  translatingMsgId,
  translatedText,
}: {
  msg: Message;
  isMine: boolean;
  router: any;
  translatingMsgId?: string | null;
  translatedText?: string;
}) {
  const { theme: ct } = useChatTheme();
  const fs = getFontSize(ct.fontSize);
  const replyPreviewText = msg.reply_to?.media_type
    ? `📎 ${msg.reply_to.media_type}`
    : (msg.reply_to?.content ?? "");
  const bubbleText = msg.content?.trim() ?? "";
  const timestampText = `${timeAgo(msg.created_at)}${isMine && ct.showReadReceipts ? " ✓✓" : ""}`;

  return (
    <>
      {/* Reply preview */}
      {msg.reply_to && (
        <View
          style={[
            styles.replyPreview,
            {
              borderLeftColor: isMine ? "rgba(255,255,255,0.5)" : C.primary,
              backgroundColor: isMine ? "rgba(0,0,0,0.15)" : C.bg + "cc",
            },
          ]}
        >
          <Text
            style={{
              color: isMine ? "rgba(255,255,255,0.8)" : C.primaryLight,
              fontSize: 11,
              fontWeight: "700",
            }}
          >
            {(msg.reply_to as any).profiles?.display_name ?? "Message"}
          </Text>
          <Text
            style={{ color: isMine ? "rgba(255,255,255,0.55)" : C.textMuted, fontSize: 12 }}
            numberOfLines={1}
          >
            {replyPreviewText}
          </Text>
        </View>
      )}

      <MediaBubble msg={msg} isMine={isMine} router={router} />

      {!!bubbleText && !msg.shared_post && (
        <Text style={[styles.bubbleText, { color: isMine ? "#fff" : C.text, fontSize: fs }]}>
          {bubbleText}
        </Text>
      )}

      {translatingMsgId === msg.id && !!translatedText && (
        <View style={{ marginTop: 6, padding: 8, borderRadius: 10, backgroundColor: "rgba(99,102,241,0.12)" }}>
          <Text style={{ fontSize: 12, color: C.primaryLight, fontStyle: "italic" }}>{translatedText}</Text>
        </View>
      )}

      <Text
        style={[
          styles.bubbleTime,
          { color: isMine ? "rgba(255,255,255,0.45)" : C.textDim },
        ]}
      >
        {timestampText}
      </Text>

      {/* Reaction pills */}
      {msg.reactions && msg.reactions.length > 0 && (
        <View style={styles.reactionPills}>
          {msg.reactions.map(r => (
            <View
              key={r.emoji}
              style={[
                styles.reactionPill,
                r.selfReacted && styles.reactionPillSelf,
              ]}
            >
              <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
              {r.count > 1 && (
                <Text style={styles.reactionPillCount}>{r.count}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── MicButton ──────────────────────────────────────────────────────────────────

function MicButton({
  isRecording,
  recordAnim,
  onStart,
  onStop,
}: {
  isRecording: boolean;
  recordAnim: Animated.Value;
  onStart: () => void;
  onStop: (send: boolean) => void;
}) {
  // Tap to start, tap again to send
  const handlePress = () => {
    if (isRecording) {
      onStop(true);
    } else {
      onStart();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.inputIconBtn,
        isRecording && { backgroundColor: C.red + "22", borderRadius: 20 },
      ]}
    >
      <Animated.View style={{ transform: [{ scale: isRecording ? recordAnim : 1 }] }}>
        <Feather
          name={isRecording ? "send" : "mic"}
          size={21}
          color={isRecording ? C.red : C.primary}
        />
      </Animated.View>
    </Pressable>
  );
}

// ─── ChatScreen ──────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const params = useLocalSearchParams<{ chatId: string; peerName?: string; peerAvatar?: string; peerId?: string }>();
  const { chatId } = params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme: chatTheme } = useChatTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiTone, setAiTone] = useState<"formal" | "casual" | "funny" | "flirty" | null>(null);
  const [aiToneVariants, setAiToneVariants] = useState<string[]>([]);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [muted, setMuted] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [chatSummary, setChatSummary] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  // Real presence tracking via Supabase Realtime
  useEffect(() => {
    if (!user?.id || !chatId) return;
    const presenceChannel = supabase.channel(`presence-${chatId}`, { config: { presence: { key: user.id } } });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const others = Object.keys(state).filter(k => k !== user.id);
        setPeerOnline(others.length > 0);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(presenceChannel); };
  }, [chatId, user?.id]);

  // Audio recording
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const preparingRef = useRef(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordAnim = useRef(new Animated.Value(1)).current;
  const recordLoop = useRef<Animated.CompositeAnimation | null>(null);
  const slideX = useRef(new Animated.Value(0)).current;
  const [discardVisible, setDiscardVisible] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) slideX.setValue(g.dx); // only allow left swipe
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          // Swiped far enough — discard
          Animated.timing(slideX, { toValue: -300, duration: 180, useNativeDriver: true }).start();
          setDiscardVisible(true);
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: async () => {
      const msgs = await fetchMessages(chatId as string);
      if (!msgs.length || !user?.id) return msgs;
      const reactMap = await fetchReactionsForConversation(msgs.map(m => m.id), user.id);
      return msgs.map(m => ({ ...m, reactions: reactMap.get(m.id) ?? [] }));
    },
    enabled: !!chatId,
  });

  useEffect(() => {
    if (chatId && user?.id) markConversationRead(chatId as string, user.id);
  }, [chatId, user?.id]);

  // Realtime — invalidate with full key ✅
  useEffect(() => {
    if (!chatId) return;
    const ch = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${chatId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
          qc.invalidateQueries({ queryKey: ["conversations", user?.id] }); // ✅ aligned key
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => { qc.invalidateQueries({ queryKey: ["chat-messages", chatId] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, user?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Audio recording ────────────────────────────────────────────────────────────

  const startRecording = async () => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    try {
      // Unload any stale instance — ref is always current unlike state
      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
        recordingRef.current = null;
      }

      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission needed", "Microphone access is required to send voice messages.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = rec;
      setIsRecording(true);
      setRecordDuration(0);
      slideX.setValue(0);
      setDiscardVisible(false);
      recordTimer.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
      recordLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recordAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(recordAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      recordLoop.current.start();
    } catch (e: any) {
      Alert.alert("Recording error", e?.message ?? "Could not start recording");
    } finally {
      preparingRef.current = false;
    }
  };

  const stopRecording = async (send = true) => {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordLoop.current?.stop();
    recordAnim.setValue(1);
    slideX.setValue(0);
    setDiscardVisible(false);
    setIsRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1,
      });
      const uri = rec.getURI();
      if (send && uri && user?.id) {
        setSending(true);
        try {
          const url = await uploadMedia(uri, `voice_${Date.now()}.m4a`, "audio/x-m4a", "chat-media");
          await sendMessage(chatId as string, user.id, "", { mediaUrl: url, mediaType: "audio" });
          qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
          qc.invalidateQueries({ queryKey: ["conversations", user.id] });
        } catch (e: any) {
          Alert.alert("Error", e?.message ?? "Failed to send voice message");
        } finally {
          setSending(false);
        }
      }
    } catch (e: any) {
      Alert.alert("Recording error", e?.message ?? "Failed to stop recording");
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (
      msgText?: string,
      opts?: { mediaUrl?: string; mediaType?: string; postId?: string }
    ) => {
      const content = msgText ?? text.trim();
      if (!content && !opts?.mediaUrl && !opts?.postId) return;
      if (!user?.id) return;
      setSending(true);
      const prev = text;
      const prevReply = replyTo; // capture before clearing
      setText("");
      setReplyTo(null);
      setAiSuggestions([]);
      try {
        await sendMessage(chatId as string, user.id, content, {
          ...opts,
          replyToId: prevReply?.id, // ✅ use captured value
        });
        qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
        qc.invalidateQueries({ queryKey: ["conversations", user.id] });
      } catch {
        setText(prev);
        Alert.alert("Error", "Failed to send message");
      } finally {
        setSending(false);
      }
    },
    [text, chatId, user?.id, replyTo] // ✅ replyTo in deps
  );

  // ── Long press / message action sheet ─────────────────────────────────────────

  const [msgSheet, setMsgSheet] = useState<{ msg: Message; isMine: boolean } | null>(null);
  const msgSheetAnim = useRef(new Animated.Value(0)).current;

  const openMsgSheet = (msg: Message) => {
    setMsgSheet({ msg, isMine: msg.sender_id === user?.id });
    Animated.spring(msgSheetAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
  };

  const closeMsgSheet = () => {
    Animated.timing(msgSheetAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
      setMsgSheet(null)
    );
  };

  const handleLongPress = (msg: Message) => openMsgSheet(msg);

  const handleDelete = async (msg: Message) => {
    if (!user?.id) return;
    try {
      await deleteMessage(msg.id, user.id);
      qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
    } catch {
      Alert.alert("Error", "Could not delete message");
    }
  };

  // ── Block reason picker ────────────────────────────────────────────────────────

  const [blockSheet, setBlockSheet] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const BLOCK_REASONS = ["Spam", "Harassment", "Hate speech", "Impersonation", "Other"];

  // ── Media picker ───────────────────────────────────────────────────────────────

  const pickMedia = async (type: "images" | "videos" | "all") => {
    setShowMediaMenu(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow media library access in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === "all" ? (["images", "videos"] as any) : ([type] as any),
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]) {
      setSending(true);
      try {
        const a = result.assets[0];
        const ext = a.uri.split(".").pop() ?? "jpg";
        const mime = a.type === "video" ? `video/${ext}` : `image/${ext}`;
        const url = await uploadMedia(a.uri, `${Date.now()}.${ext}`, mime, "chat-media");
        await handleSend("", { mediaUrl: url, mediaType: a.type === "video" ? "video" : "image" });
      } catch {
        Alert.alert("Error", "Failed to send media");
      } finally {
        setSending(false);
      }
    }
  };

  const openCamera = async () => {
    setShowMediaMenu(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      setSending(true);
      try {
        const a = result.assets[0];
        const ext = a.uri.split(".").pop() ?? "jpg";
        const mime = a.type === "video" ? `video/${ext}` : `image/${ext}`;
        const url = await uploadMedia(a.uri, `${Date.now()}.${ext}`, mime, "chat-media");
        await handleSend("", { mediaUrl: url, mediaType: a.type === "video" ? "video" : "image" });
      } catch {
        Alert.alert("Error", "Failed to send media");
      } finally {
        setSending(false);
      }
    }
  };

  // ── AI suggestions ─────────────────────────────────────────────────────────────

  const getAISuggestions = async () => {
    const lastMsg = (messages as Message[]).filter((m) => m.sender_id !== user?.id).pop();
    if (!lastMsg?.content) return;
    setLoadingAI(true);
    try {
      setAiSuggestions(await generateAIReplySuggestion(lastMsg.content));
    } finally {
      setLoadingAI(false);
    }
  };

  const getAIToneVariants = async (text: string, tone: "formal" | "casual" | "funny" | "flirty") => {
    setAiTone(tone);
    setLoadingAI(true);
    try {
      setAiToneVariants([await adjustAITone(text, tone)]);
    } finally {
      setLoadingAI(false);
    }
  };

  const translateMessage = async (msg: Message) => {
    if (!msg.content) return;
    setTranslatingMsgId(msg.id);
    setTranslatedText("");
    try {
      const result = await translateAIText(msg.content, "English");
      setTranslatedText(result);
    } finally {
      setTranslatingMsgId(null);
    }
  };

  const summarizeConversation = async () => {
    setSummarizing(true);
    setChatSummary("");
    try {
      const history = (messages as Message[]).slice(-30).map(m => ({ role: m.sender_id === user?.id ? "user" : "assistant", content: m.content || "" }));
      const result = await summarizeAIChat(history);
      setChatSummary(result);
    } finally {
      setSummarizing(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────────

  const peerName = (params.peerName && params.peerName !== "User") ? params.peerName : "Chat";
  const fmtDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const displayMessages = searchQuery.trim()
    ? (messages as Message[]).filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : (messages as Message[]);
  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ChatWallpaper wallpaper={chatTheme.wallpaper} accent={chatTheme.accentColor} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={C.text} />
        </Pressable>

        <View style={styles.headerPeerInfo}>
          <View style={styles.headerAvatarWrap}>
            <Avatar name={peerName} avatarUrl={params.peerAvatar} size={38} />
            {peerOnline && <View style={styles.onlineDot} />}
          </View>
          <View>
            <Text style={styles.headerName}>{peerName}</Text>
            {peerOnline && (
              <View style={styles.headerStatusRow}>
                <View style={styles.headerStatusDot} />
                <Text style={styles.headerStatus}>Active now</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push({ pathname: `/call/${chatId}`, params: { peerName } } as any)}
            style={styles.headerIconBtn}
          >
            <Feather name="phone" size={19} color={C.text} />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: `/call/${chatId}`, params: { peerName, isVideo: "true" } } as any)
            }
            style={[styles.headerIconBtn, styles.headerIconBtnPrimary]}
          >
            <Feather name="video" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={summarizeConversation} style={styles.headerIconBtn}>
            <Feather name="file-text" size={18} color={C.text} />
          </Pressable>
          <Pressable
            onPress={() => setShowChatMenu(true)}
            style={styles.headerIconBtn}
          >
            <Feather name="more-vertical" size={19} color={C.text} />
          </Pressable>
        </View>
      </View>

      {/* ── Messages list ── */}
      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={displayMessages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: msg, index }) => {
            const isMine = msg.sender_id === user?.id;
            const prevMsg = index > 0 ? displayMessages[index - 1] : null;
            const showAvatar = !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
            const isGrouped = !!prevMsg && prevMsg.sender_id === msg.sender_id;
            return (
              <MessageBubble
                msg={msg}
                isMine={isMine}
                showAvatar={showAvatar}
                isGrouped={isGrouped}
                onLongPress={handleLongPress}
                router={router}
                translatingMsgId={translatingMsgId}
                translatedText={translatedText}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <LinearGradient
                colors={["rgba(99,102,241,0.2)", "rgba(99,102,241,0.04)"]}
                style={styles.emptyChatIcon}
              >
                <Feather name="message-circle" size={34} color={C.primary} />
              </LinearGradient>
              <Text style={styles.emptyChatTitle}>Start the conversation</Text>
              <Text style={styles.emptyChatSub}>Say hello to {peerName} 👋</Text>
            </View>
          }
        />
      )}

      {/* ── Recording bar ── */}
      {isRecording && (
        <View style={styles.recordingBar}>
          {/* Discard trash icon — revealed as user swipes left */}
          <View style={styles.recordTrashZone}>
            <Feather name="trash-2" size={20} color={C.red} />
            <Text style={styles.recordTrashLabel}>Release to discard</Text>
          </View>

          {/* Slideable content */}
          <Animated.View
            style={[styles.recordSlide, { transform: [{ translateX: slideX }] }]}
            {...panResponder.panHandlers}
          >
            {/* Pulse dot */}
            <Animated.View style={[styles.recordDot, { transform: [{ scale: recordAnim }] }]} />

            {/* Timer */}
            <Text style={styles.recordingText}>{fmtDuration(recordDuration)}</Text>

            {/* Swipe hint — fades out as user slides */}
            <Animated.View
              style={[
                styles.recordHintRow,
                {
                  opacity: slideX.interpolate({
                    inputRange: [-80, 0],
                    outputRange: [0, 1],
                    extrapolate: "clamp",
                  }),
                },
              ]}
            >
              <Feather name="chevron-left" size={14} color={C.textDim} />
              <Text style={styles.recordingHint}>Swipe to discard</Text>
            </Animated.View>
          </Animated.View>

          {/* Discard confirmation overlay */}
          {discardVisible && (
            <View style={styles.discardOverlay}>
              <Feather name="trash-2" size={16} color={C.red} />
              <Text style={styles.discardText}>Discarded</Text>
              <Pressable
                onPress={() => stopRecording(false)}
                style={styles.discardConfirmBtn}
              >
                <Text style={styles.discardConfirmText}>OK</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* ── Search bar ── */}
      {searchMode && (
        <View style={styles.searchBar}>
          <Feather name="search" size={15} color={C.primary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search messages…"
            placeholderTextColor={C.textDim}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          <Pressable onPress={() => { setSearchMode(false); setSearchQuery(""); }} hitSlop={10}>
            <Feather name="x" size={16} color={C.textMuted} />
          </Pressable>
        </View>
      )}

      {/* ── Reply preview ── */}
      {replyTo && !isRecording && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarAccent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBarLabel}>
              Replying to {(replyTo.profiles as Profile | undefined)?.display_name ?? "message"}
            </Text>
            <Text style={styles.replyBarContent} numberOfLines={1}>
              {replyTo.media_type ? `📎 ${replyTo.media_type}` : (replyTo.content ?? "")}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={10}>
            <Feather name="x" size={16} color={C.textMuted} />
          </Pressable>
        </View>
      )}

      {/* ── AI Chat Summary ── */}
      {(summarizing || chatSummary) && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "rgba(99,102,241,0.08)", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="file-text" size={14} color={C.primary} />
            <Text style={{ color: C.primaryLight, fontSize: 12, fontWeight: "700" }}>AI Summary</Text>
            {summarizing && <ActivityIndicator size="small" color={C.primary} />}
          </View>
          {!!chatSummary && (
            <Text style={{ color: C.text, fontSize: 13, marginTop: 4 }}>{chatSummary}</Text>
          )}
        </View>
      )}

      {/* ── AI suggestions ── */}
      {aiSuggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.aiRow}
        >
          <View style={styles.aiLabel}>
            <Feather name="zap" size={10} color={C.primary} />
            <Text style={styles.aiLabelText}>AI</Text>
          </View>
          {aiSuggestions.map((s, i) => (
            <Pressable
              key={i}
              onPress={() => { handleSend(s); setAiSuggestions([]); }}
              style={styles.aiChip}
            >
              <Text style={styles.aiChipText}>{s}</Text>
            </Pressable>
          ))}
          {aiTone && aiToneVariants.map((v, i) => (
            <Pressable
              key={`${aiTone}-${i}`}
              onPress={() => { handleSend(v); setAiSuggestions([]); setAiTone(null); setAiToneVariants([]); }}
              style={[styles.aiChip, { backgroundColor: C.primary + "22" }]}
            >
              <Text style={styles.aiChipText}>{v}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => { setAiSuggestions([]); setAiTone(null); setAiToneVariants([]); }} style={[styles.aiChip, { paddingHorizontal: 10 }]}>
            <Feather name="x" size={13} color={C.textMuted} />
          </Pressable>
        </ScrollView>
      )}

      {/* ── AI Tone Buttons ── */}
      {aiSuggestions.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          {(["formal", "casual", "funny", "flirty"] as const).map((tone) => (
            <Pressable
              key={tone}
              onPress={() => {
                const base = aiToneVariants.length > 0 ? aiToneVariants[0] : aiSuggestions[0];
                if (base) getAIToneVariants(base, tone);
              }}
              style={[styles.aiChip, { paddingHorizontal: 10, backgroundColor: aiTone === tone ? C.primary + "33" : C.surface }]}
            >
              <Text style={[styles.aiChipText, { fontSize: 11, textTransform: "capitalize" }]}>{tone}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Input bar ── */}
      <View
        style={[
          styles.inputBar,
          { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
        ]}
      >
        <Pressable onPress={() => setShowMediaMenu(true)} style={styles.inputIconBtn}>
          <Feather name="plus" size={22} color={C.primary} />
        </Pressable>

        <TextInput
          style={styles.inputField}
          placeholder="Message…"
          placeholderTextColor={C.textDim}
          value={text}
          onChangeText={(t) => { setText(t); if (!t) setAiSuggestions([]); }}
          multiline
        />

        {text.length === 0 ? (
          <>
            <Pressable
              onPress={() => {
                const lastMsg = (messages as Message[]).filter((m) => m.sender_id !== user?.id).pop();
                if (!lastMsg?.content) {
                  Alert.alert("AI Suggestions", "Send a message first so AI can suggest replies.");
                  return;
                }
                getAISuggestions();
              }}
              disabled={loadingAI}
              style={styles.inputIconBtn}
            >
              {loadingAI ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Feather name="zap" size={21} color={C.primary} />
              )}
            </Pressable>
            <MicButton
              isRecording={isRecording}
              recordAnim={recordAnim}
              onStart={startRecording}
              onStop={stopRecording}
            />
          </>
        ) : (
          <Pressable
            onPress={() => handleSend()}
            disabled={sending || !text.trim()}
            style={styles.sendBtn}
          >
            <LinearGradient
              colors={[C.myBubble1, C.myBubble2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtnGrad}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Feather name="send" size={15} color="#fff" />
              )}
            </LinearGradient>
          </Pressable>
        )}
      </View>

      {/* ── Chat menu modal ── */}
      <Modal
        visible={showChatMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChatMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowChatMenu(false)}>
          <View style={styles.menuSheet}>
            {/* Header */}
            <View style={styles.menuHeader}>
              <Avatar name={peerName} avatarUrl={params.peerAvatar} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuPeerName}>{peerName}</Text>
                <Text style={styles.menuPeerStatus}>{peerOnline ? "Active now" : "Offline"}</Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {([
              {
                icon: "user" as const,
                label: "View Profile",
                onPress: () => {
                  setShowChatMenu(false);
                  const pid = params.peerId;
                  if (pid) {
                    setTimeout(() => router.push(`/user/${pid}` as any), 300);
                  } else {
                    Alert.alert("Error", "Could not determine user profile.");
                  }
                },
              },
              {
                icon: "search" as const,
                label: "Search in Conversation",
                onPress: () => {
                  setShowChatMenu(false);
                  setSearchMode(true);
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                },
              },
              {
                icon: muted ? ("bell" as const) : ("bell-off" as const),
                label: muted ? "Unmute Notifications" : "Mute Notifications",
                onPress: () => {
                  setMuted(m => !m);
                  setShowChatMenu(false);
                },
              },
              {
                icon: "image" as const,
                label: "Shared Media",
                onPress: () => {
                  setShowChatMenu(false);
                  router.push({ pathname: `/chat-media/${chatId}`, params: { peerName } } as any);
                },
              },
              {
                icon: "sliders" as const,
                label: "Chat Appearance",
                onPress: () => {
                  setShowChatMenu(false);
                  setTimeout(() => router.push("/chat-settings" as any), 300);
                },
              },
              {
                icon: "phone" as const,
                label: "Voice Call",
                onPress: () => {
                  setShowChatMenu(false);
                  router.push({ pathname: `/call/${chatId}`, params: { peerName } } as any);
                },
              },
              {
                icon: "video" as const,
                label: "Video Call",
                onPress: () => {
                  setShowChatMenu(false);
                  router.push({ pathname: `/call/${chatId}`, params: { peerName, isVideo: "true" } } as any);
                },
              },
            ] as const).map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: C.surfaceHigh }]}
              >
                <View style={styles.menuItemIcon}>
                  <Feather name={item.icon} size={18} color={C.primary} />
                </View>
                <Text style={styles.menuItemLabel}>{item.label}</Text>
                <Feather name="chevron-right" size={15} color={C.textDim} />
              </Pressable>
            ))}

            <View style={styles.menuDivider} />

            {/* Danger zone */}
            <Pressable
              onPress={() => { setShowChatMenu(false); setTimeout(() => setBlockSheet(true), 300); }}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: C.surfaceHigh }]}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                <Feather name="slash" size={18} color={C.red} />
              </View>
              <Text style={[styles.menuItemLabel, { color: C.red }]}>Block User</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowChatMenu(false);
                Alert.alert(
                  "Delete Conversation",
                  "This will delete all messages for you. This cannot be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => router.back() },
                  ]
                );
              }}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: C.surfaceHigh }]}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                <Feather name="trash-2" size={18} color={C.red} />
              </View>
              <Text style={[styles.menuItemLabel, { color: C.red }]}>Delete Conversation</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Enhanced media picker sheet ── */}
      <Modal visible={showMediaMenu} transparent animationType="slide" onRequestClose={() => setShowMediaMenu(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setShowMediaMenu(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to message</Text>
            {([
              { icon: "camera" as const, label: "Camera", sub: "Take a photo or video", colors: ["#8B5CF6", "#A78BFA"] as [string,string], onPress: openCamera },
              { icon: "image" as const, label: "Photo", sub: "From your library", colors: [C.primary, C.primaryLight] as [string,string], onPress: () => pickMedia("images") },
              { icon: "film" as const, label: "Video", sub: "From your library", colors: ["#0EA5E9", "#38BDF8"] as [string,string], onPress: () => pickMedia("videos") },
              { icon: "mic" as const, label: "Voice Message", sub: "Hold mic button to record", colors: ["#EF4444", "#F87171"] as [string,string], onPress: async () => { setShowMediaMenu(false); await startRecording(); } },
            ]).map((item) => (
              <Pressable key={item.label} onPress={item.onPress} style={({ pressed }) => [styles.sheetItem, pressed && { opacity: 0.72 }]}>
                <LinearGradient colors={item.colors} style={styles.sheetItemIcon}>
                  <Feather name={item.icon} size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetItemLabel}>{item.label}</Text>
                  <Text style={styles.sheetItemSub}>{item.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textDim} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Message long-press bottom sheet ── */}
      <Modal visible={!!msgSheet} transparent animationType="none" onRequestClose={closeMsgSheet}>
        <Pressable style={styles.sheetOverlay} onPress={closeMsgSheet}>
          <Animated.View
            style={[
              styles.sheet,
              {
                transform: [{ translateY: msgSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }) }],
                opacity: msgSheetAnim,
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            {/* Emoji reactions row */}
            <View style={styles.reactionsRow}>
              {["❤️", "😂", "😮", "😢", "👍", "🔥"].map((emoji) => {
              const existing = msgSheet?.msg.reactions?.find(r => r.emoji === emoji);
              return (
              <Pressable
                key={emoji}
                onPress={async () => {
                  if (!user?.id || !msgSheet) return;
                  closeMsgSheet();
                  await toggleReaction(msgSheet.msg.id, user.id, emoji);
                  qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
                }}
                style={({ pressed }) => [
                  styles.reactionBtn,
                  existing?.selfReacted && styles.reactionBtnActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {existing && existing.count > 0 && (
                  <Text style={styles.reactionCount}>{existing.count}</Text>
                )}
              </Pressable>
            )})}
            </View>

            <View style={styles.sheetDivider} />

            {/* Actions */}
            {([
              { icon: "corner-up-left" as const, label: "Reply", onPress: () => { setReplyTo(msgSheet!.msg); closeMsgSheet(); } },
              { icon: "copy" as const, label: "Copy", onPress: () => { Clipboard.setString(msgSheet!.msg.content ?? ""); closeMsgSheet(); } },
              { icon: "globe" as const, label: "Translate", onPress: () => { translateMessage(msgSheet!.msg); closeMsgSheet(); } },
              ...(!msgSheet?.isMine ? [{ icon: "flag" as const, label: "Report", danger: false, onPress: () => { closeMsgSheet(); Alert.alert("Report message", "This message has been reported."); } }] : []),
              ...(msgSheet?.isMine ? [{ icon: "trash-2" as const, label: "Delete", danger: true, onPress: () => { closeMsgSheet(); handleDelete(msgSheet!.msg); } }] : []),
            ] as { icon: any; label: string; danger?: boolean; onPress: () => void }[]).map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={({ pressed }) => [styles.sheetItem, pressed && { backgroundColor: C.surfaceHigh }]}
              >
                <View style={[styles.sheetItemIcon, { backgroundColor: action.danger ? "rgba(239,68,68,0.12)" : C.primary + "18" }]}>
                  <Feather name={action.icon} size={18} color={action.danger ? C.red : C.primary} />
                </View>
                <Text style={[styles.sheetItemLabel, action.danger && { color: C.red }]}>{action.label}</Text>
              </Pressable>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ── Block reason picker ── */}
      <Modal visible={blockSheet} transparent animationType="slide" onRequestClose={() => setBlockSheet(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setBlockSheet(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Block {peerName}</Text>
            <Text style={styles.sheetSubtitle}>Select a reason (optional)</Text>
            {BLOCK_REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setBlockReason(r === blockReason ? null : r)}
                style={({ pressed }) => [styles.sheetItem, pressed && { backgroundColor: C.surfaceHigh }]}
              >
                <View style={[styles.reasonCheck, blockReason === r && styles.reasonCheckActive]}>
                  {blockReason === r && <Feather name="check" size={12} color="#fff" />}
                </View>
                <Text style={styles.sheetItemLabel}>{r}</Text>
              </Pressable>
            ))}
            <View style={styles.sheetDivider} />
            <Pressable
              onPress={() => {
                setBlockSheet(false);
                setBlockReason(null);
                Alert.alert("Blocked", `${peerName} has been blocked.`);
              }}
              style={styles.blockConfirmBtn}
            >
              <Text style={styles.blockConfirmText}>Block User</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPeerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatarWrap: {
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: C.surface,
  },
  headerName: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  headerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  headerStatus: {
    color: C.green,
    fontSize: 11,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    gap: 6,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnPrimary: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },

  // Messages
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesList: {
    padding: 14,
    paddingBottom: 10,
    gap: 2,
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
    marginBottom: 4,
  },
  msgRowMine: {
    justifyContent: "flex-end",
  },
  msgRowOther: {
    justifyContent: "flex-start",
  },
  msgGrouped: {
    marginBottom: 1,
  },

  // Bubbles
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 4,
  },
  bubbleMine: {
    borderBottomRightRadius: 5,
  },
  bubbleOther: {
    backgroundColor: C.theirBubble,
    borderWidth: 1,
    borderColor: C.theirBubbleBorder,
    borderBottomLeftRadius: 5,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTime: {
    fontSize: 10,
    alignSelf: "flex-end",
    marginTop: 1,
  },
  replyPreview: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 5,
    marginBottom: 5,
    borderRadius: 6,
    gap: 2,
  },
  deletedBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
  },
  deletedText: {
    fontSize: 13,
    color: C.textDim,
    fontStyle: "italic",
  },
  msgImage: {
    width: 216,
    height: 216,
    borderRadius: 12,
  },
  msgVideo: {
    width: 216,
    height: 162,
    borderRadius: 12,
    overflow: "hidden",
  },
  fileBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 150,
  },

  // Audio
  audioBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 190,
  },
  audioPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    height: 24,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },

  // Shared post
  sharedPost: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    maxWidth: 220,
  },
  sharedPostImg: {
    width: "100%",
    height: 120,
    borderRadius: 8,
  },

  // Empty state
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 8,
  },
  emptyChatIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.3,
  },
  emptyChatSub: {
    fontSize: 14,
    color: C.textDim,
  },

  // Recording bar
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    overflow: "hidden",
    position: "relative",
  },
  recordTrashZone: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
  },
  recordTrashLabel: {
    color: C.red,
    fontSize: 13,
    fontWeight: "600",
  },
  recordSlide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    backgroundColor: C.surface,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.red,
  },
  recordingText: {
    color: C.red,
    fontWeight: "700",
    fontSize: 14,
    minWidth: 44,
  },
  recordHintRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  recordingHint: {
    color: C.textDim,
    fontSize: 12,
  },
  discardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  discardText: {
    flex: 1,
    color: C.red,
    fontSize: 14,
    fontWeight: "600",
  },
  discardConfirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.red + "22",
    borderWidth: 1,
    borderColor: C.red + "44",
  },
  discardConfirmText: {
    color: C.red,
    fontWeight: "700",
    fontSize: 13,
  },

  // Reply bar — ✅ fixed height:100% issue, use alignSelf instead
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,
  },
  replyBarAccent: {
    width: 3,
    alignSelf: "stretch", // ✅ fills height of parent without percentage
    borderRadius: 2,
    backgroundColor: C.primary,
  },
  replyBarLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: C.primaryLight,
    marginBottom: 2,
  },
  replyBarContent: {
    fontSize: 13,
    color: C.textMuted,
  },

  // AI suggestions
  aiRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  aiLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: C.primary + "22",
  },
  aiLabelText: {
    color: C.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  aiChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
  },
  aiChipText: {
    color: C.text,
    fontSize: 13,
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 4,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  inputIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  inputField: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    backgroundColor: C.surfaceHigh,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  sendBtnGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    paddingVertical: 0,
  },

  // Chat menu
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 20,
    paddingBottom: 16,
  },
  menuPeerName: {
    fontSize: 17,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.2,
  },
  menuPeerStatus: {
    fontSize: 12,
    color: C.textDim,
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 0,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    fontWeight: "500",
  },

  // Unified bottom sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: C.border,
    gap: 2,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.text,
    marginBottom: 4,
    letterSpacing: -0.2,
    paddingHorizontal: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: C.textDim,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 11,
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  sheetItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetItemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: C.text,
  },
  sheetItemSub: {
    fontSize: 12,
    color: C.textDim,
    marginTop: 1,
  },
  // Reactions
  reactionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  reactionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceHigh,
    gap: 2,
  },
  reactionBtnActive: {
    backgroundColor: C.primary + "33",
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  reactionEmoji: {
    fontSize: 24,
  },
  reactionCount: {
    fontSize: 10,
    fontWeight: "700",
    color: C.primary,
  },
  // Reaction pills on bubble
  reactionPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
  },
  reactionPillSelf: {
    backgroundColor: C.primary + "22",
    borderColor: C.primary,
  },
  reactionPillCount: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
  },
  // Block reason
  reasonCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonCheckActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  blockConfirmBtn: {
    backgroundColor: C.red,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  blockConfirmText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});