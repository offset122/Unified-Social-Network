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
  ActionSheetIOS,
  Modal,
  ScrollView,
  Animated,
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
import { Audio, Video, ResizeMode } from "expo-av"; // ✅ single import, no duplicate
import {
  fetchMessages,
  sendMessage,
  deleteMessage,
  markConversationRead,
  uploadMedia,
  resolveMediaUrl,
  generateAIReplySuggestion,
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
}: {
  msg: Message;
  isMine: boolean;
  showAvatar: boolean;
  isGrouped: boolean; // consecutive from same sender
  onLongPress: (msg: Message) => void;
  router: any;
}) {
  const profile = msg.profiles as Profile | undefined;
  const scaleAnim = useRef(new Animated.Value(1)).current;

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
    <View
      style={[
        styles.msgRow,
        isMine ? styles.msgRowMine : styles.msgRowOther,
        isGrouped && styles.msgGrouped,
      ]}
    >
      {/* Sender avatar — only shown on first of a run */}
      {!isMine ? (
        showAvatar ? (
          <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={28} />
        ) : (
          <View style={{ width: 28 }} />
        )
      ) : null}

      <Animated.View style={{ transform: [{ scale: scaleAnim }], maxWidth: "75%" }}>
        <Pressable
          onLongPress={() => onLongPress(msg)}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          delayLongPress={300}
        >
          {/* My bubble: gradient. Their bubble: flat dark card. */}
          {isMine ? (
            <LinearGradient
              colors={[C.myBubble1, C.myBubble2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.bubbleMine]}
            >
              <BubbleContents msg={msg} isMine={isMine} router={router} />
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, styles.bubbleOther]}>
              <BubbleContents msg={msg} isMine={isMine} router={router} />
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
}: {
  msg: Message;
  isMine: boolean;
  router: any;
}) {
  const replyPreviewText = msg.reply_to?.media_type
    ? `📎 ${msg.reply_to.media_type}`
    : (msg.reply_to?.content ?? "");
  const bubbleText = msg.content?.trim() ?? "";
  const timestampText = `${timeAgo(msg.created_at)}${isMine ? " ✓✓" : ""}`;

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
        <Text style={[styles.bubbleText, { color: isMine ? "#fff" : C.text }]}>
          {bubbleText}
        </Text>
      )}

      <Text
        style={[
          styles.bubbleTime,
          { color: isMine ? "rgba(255,255,255,0.45)" : C.textDim },
        ]}
      >
        {timestampText}
      </Text>
    </>
  );
}

// ─── ChatScreen ──────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const params = useLocalSearchParams<{ peerName?: string; peerAvatar?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);

  // Audio recording — store loop ref to stop it properly
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordAnim = useRef(new Animated.Value(1)).current;
  const recordLoop = useRef<Animated.CompositeAnimation | null>(null); // ✅ store loop ref

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: () => fetchMessages(chatId as string),
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
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission needed", "Microphone access is required to send voice messages.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      setRecordDuration(0);
      recordTimer.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
      // ✅ store loop so we can stop it cleanly
      recordLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recordAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(recordAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      recordLoop.current.start();
    } catch {
      Alert.alert("Error", "Could not start recording");
    }
  };

  const stopRecording = async (send = true) => {
    if (!recording) return;
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordLoop.current?.stop(); // ✅ stop the loop reference
    recordAnim.setValue(1);
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      // Reset audio mode
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (send && uri && user?.id) {
        setSending(true);
        try {
          const url = await uploadMedia(uri, `voice_${Date.now()}.m4a`, "audio/m4a", "chat-media");
          await sendMessage(chatId as string, user.id, "", { mediaUrl: url, mediaType: "audio" });
          qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
          qc.invalidateQueries({ queryKey: ["conversations", user.id] });
        } catch {
          Alert.alert("Error", "Failed to send voice message");
        } finally {
          setSending(false);
        }
      }
    } catch {}
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

  // ── Long press actions ─────────────────────────────────────────────────────────

  const handleLongPress = (msg: Message) => {
    const isMine = msg.sender_id === user?.id;
    const options = isMine ? ["Reply", "Delete", "Cancel"] : ["Reply", "Cancel"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: isMine ? 1 : -1,
        },
        (i) => {
          if (options[i] === "Reply") setReplyTo(msg);
          if (options[i] === "Delete") handleDelete(msg);
        }
      );
    } else {
      Alert.alert("Message", undefined, [
        { text: "Reply", onPress: () => setReplyTo(msg) },
        ...(isMine
          ? [{ text: "Delete", style: "destructive" as const, onPress: () => handleDelete(msg) }]
          : []),
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const handleDelete = async (msg: Message) => {
    if (!user?.id) return;
    try {
      await deleteMessage(msg.id, user.id);
      qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
    } catch {
      Alert.alert("Error", "Could not delete message");
    }
  };

  // ── Media picker ───────────────────────────────────────────────────────────────

  const pickImage = async () => {
    setShowMediaMenu(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"] as any, // ✅ updated API
      quality: 0.8,
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

  // ── Helpers ────────────────────────────────────────────────────────────────────

  const peerName = params.peerName ?? "Chat";
  const fmtDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={C.text} />
        </Pressable>

        <View style={styles.headerPeerInfo}>
          <View style={styles.headerAvatarWrap}>
            <Avatar name={peerName} avatarUrl={params.peerAvatar} size={38} />
            {/* Online dot */}
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.headerName}>{peerName}</Text>
            <View style={styles.headerStatusRow}>
              <View style={styles.headerStatusDot} />
              <Text style={styles.headerStatus}>Active now</Text>
            </View>
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
          data={messages as Message[]}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: msg, index }) => {
            const isMine = msg.sender_id === user?.id;
            const prevMsg = index > 0 ? (messages as Message[])[index - 1] : null;
            const nextMsg = index < (messages as Message[]).length - 1 ? (messages as Message[])[index + 1] : null;
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
          <Animated.View
            style={[styles.recordDot, { transform: [{ scale: recordAnim }] }]}
          />
          <Text style={styles.recordingText}>
            {fmtDuration(recordDuration)}
          </Text>
          <Text style={styles.recordingHint}>Release to send · Swipe up to cancel</Text>
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
          <Pressable onPress={() => setAiSuggestions([])} style={[styles.aiChip, { paddingHorizontal: 10 }]}>
            <Feather name="x" size={13} color={C.textMuted} />
          </Pressable>
        </ScrollView>
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
            <Pressable onPress={getAISuggestions} disabled={loadingAI} style={styles.inputIconBtn}>
              {loadingAI ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Feather name="zap" size={21} color={C.primary} />
              )}
            </Pressable>
            <Pressable
              onLongPress={startRecording}
              onPressOut={() => isRecording && stopRecording(true)}
              delayLongPress={200}
              style={[
                styles.inputIconBtn,
                isRecording && { backgroundColor: C.red + "22", borderRadius: 20 },
              ]}
            >
              <Animated.View style={{ transform: [{ scale: isRecording ? recordAnim : 1 }] }}>
                <Feather name="mic" size={21} color={isRecording ? C.red : C.primary} />
              </Animated.View>
            </Pressable>
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

      {/* ── Media menu ── */}
      <Modal
        visible={showMediaMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMediaMenu(false)}
      >
        <Pressable style={styles.mediaOverlay} onPress={() => setShowMediaMenu(false)}>
          <View style={styles.mediaSheet}>
            <View style={styles.mediaSheetHandle} />
            <Text style={styles.mediaSheetTitle}>Add to message</Text>

            {[
              {
                icon: "image" as const,
                label: "Photo or Video",
                sub: "From your library",
                colors: [C.primary, C.primaryLight] as [string, string],
                onPress: pickImage,
              },
              {
                icon: "mic" as const,
                label: "Voice Message",
                sub: "Record audio",
                colors: ["#EF4444", "#F87171"] as [string, string],
                onPress: async () => {
                  setShowMediaMenu(false);
                  await startRecording();
                },
              },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                style={({ pressed }) => [styles.mediaItem, pressed && { opacity: 0.75 }]}
              >
                <LinearGradient colors={item.colors} style={styles.mediaItemIcon}>
                  <Feather name={item.icon} size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mediaItemLabel}>{item.label}</Text>
                  <Text style={styles.mediaItemSub}>{item.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textDim} />
              </Pressable>
            ))}
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
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
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
  recordingHint: {
    color: C.textDim,
    fontSize: 12,
    marginLeft: "auto" as any,
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

  // Media sheet
  mediaOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  mediaSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: C.border,
    gap: 4,
  },
  mediaSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  mediaSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.text,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  mediaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  mediaItemIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaItemLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: C.text,
  },
  mediaItemSub: {
    fontSize: 12,
    color: C.textDim,
    marginTop: 1,
  },
});