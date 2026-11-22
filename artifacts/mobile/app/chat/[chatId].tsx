import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Clipboard,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Audio, ResizeMode, Video } from "expo-av";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  getBubbleRadius,
  getFontSize,
  useChatTheme,
  type WallpaperKey,
} from "@/lib/chatTheme";
import {
  adjustAITone,
  blockUser,
  deleteMessage,
  fetchMessages,
  fetchReactionsForConversation,
  generateAIReplySuggestion,
  markConversationRead,
  resolveMediaUrl,
  sendMessage,
  summarizeAIChat,
  timeAgo,
  toggleReaction,
  translateAIText,
  uploadMedia,
  type Message,
  type Profile,
} from "@/lib/db";
import { inferExtension, normalizeMimeType } from "@/lib/mediaUtils";
import { Avatar } from "@/components/Avatar";
import { ActionSheet } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";

function ChatWallpaper({
  wallpaper,
  accent,
  bgCanvas,
}: {
  wallpaper: WallpaperKey;
  accent: string;
  bgCanvas: string;
}) {
  if (wallpaper === "none") return null;
  if (wallpaper === "gradient") {
    return (
      <LinearGradient
        colors={[accent + "14", bgCanvas, accent + "0A"]}
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
      <View
        style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.05 }]}
        pointerEvents="none"
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: -20,
              right: -20,
              top: i * 28 - 10,
              height: 16,
              borderRadius: 8,
              borderWidth: 1.5,
              borderColor: accent,
            }}
          />
        ))}
      </View>
    );
  }
  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.05 }]}
      pointerEvents="none"
    >
      {Array.from({ length: 30 }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {Array.from({ length: 20 }).map((_, col) => (
            <View
              key={col}
              style={{
                width: size,
                height: size,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {wallpaper === "dots" ? (
                <View
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: accent,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: size - 3,
                    height: size - 3,
                    borderWidth: 0.5,
                    borderColor: accent,
                  }}
                />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function AudioPlayer({ uri, isMine }: { uri: string; isMine: boolean }) {
  const colors = useColors();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  const toggle = async () => {
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync(
        { uri: resolveMediaUrl(uri) },
        { shouldPlay: true },
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

  const bars = [
    0.4, 0.7, 0.55, 0.9, 0.65, 0.45, 0.8, 0.6, 0.75, 0.5, 0.85, 0.4, 0.7, 0.6,
    0.5,
  ];
  const filledBars = Math.floor(pct * bars.length);

  return (
    <Pressable
      onPress={toggle}
      style={[
        styles.audioBubble,
        {
          backgroundColor: isMine ? "rgba(255,255,255,0.14)" : colors.bgCanvas,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={playing ? "Pause voice message" : "Play voice message"}
    >
      <View
        style={[
          styles.audioPlayBtn,
          {
            backgroundColor: isMine
              ? "rgba(255,255,255,0.24)"
              : colors.accentTint,
          },
        ]}
      >
        <Feather
          name={playing ? "pause" : "play"}
          size={14}
          color={isMine ? "#FFFFFF" : colors.accentPrimary}
        />
      </View>

      <View style={{ flex: 1, gap: 5 }}>
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
                      ? isMine
                        ? "rgba(255,255,255,0.92)"
                        : colors.accentPrimary
                      : isMine
                      ? "rgba(255,255,255,0.28)"
                      : colors.separator,
                },
              ]}
            />
          ))}
        </View>
        <Text
          style={{
            color: isMine ? "rgba(255,255,255,0.72)" : colors.textSecondary,
            fontSize: 10.5,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          {duration > 0 ? `${fmt(position)} / ${fmt(duration)}` : "Voice message"}
        </Text>
      </View>
    </Pressable>
  );
}

function SharedPostBubble({
  post,
  isMine,
  onPress,
}: {
  post: any;
  isMine: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
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
          backgroundColor: isMine ? "rgba(255,255,255,0.12)" : colors.bgCanvas,
          borderColor: isMine ? "rgba(255,255,255,0.22)" : colors.separator,
        },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          marginBottom: 6,
        }}
      >
        <Feather
          name="share-2"
          size={10}
          color={isMine ? "rgba(255,255,255,0.68)" : colors.textSecondary}
        />
        <Text
          style={{
            color: isMine ? "rgba(255,255,255,0.68)" : colors.textSecondary,
            fontSize: 10.5,
            fontWeight: "700",
            letterSpacing: 0.4,
          }}
        >
          SHARED POST
        </Text>
      </View>
      {media && (
        <Image
          source={{ uri: media }}
          style={styles.sharedPostImg}
          resizeMode="cover"
        />
      )}
      {!!postContent && (
        <Text
          style={{
            color: isMine ? "#FFFFFF" : colors.textPrimary,
            fontSize: 13,
            lineHeight: 18,
            marginTop: media ? 6 : 0,
          }}
          numberOfLines={2}
        >
          {postContent}
        </Text>
      )}
      {!!profileHandle && (
        <Text
          style={{
            color: isMine ? "rgba(255,255,255,0.65)" : colors.textSecondary,
            fontSize: 11,
            marginTop: 5,
          }}
        >
          {profileHandle}
        </Text>
      )}
    </Pressable>
  );
}

function MediaBubble({
  msg,
  isMine,
  router,
}: {
  msg: Message;
  isMine: boolean;
  router: any;
}) {
  const colors = useColors();
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

  if (msg.media_type === "audio") {
    return <AudioPlayer uri={uri} isMine={isMine} />;
  }
  if (msg.media_type === "image") {
    return (
      <Image source={{ uri }} style={styles.msgImage} resizeMode="cover" />
    );
  }
  if (msg.media_type === "video") {
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
  }
  return (
    <View
      style={[
        styles.fileBubble,
        {
          backgroundColor: isMine
            ? "rgba(255,255,255,0.16)"
            : colors.bgCanvas,
        },
      ]}
    >
      <Feather
        name="file"
        size={16}
        color={isMine ? "#FFFFFF" : colors.accentPrimary}
      />
      <Text
        style={{
          color: isMine ? "#FFFFFF" : colors.textPrimary,
          fontSize: 13,
          marginLeft: 8,
          flex: 1,
        }}
        numberOfLines={1}
      >
        {fileName}
      </Text>
    </View>
  );
}

function BubbleContents({
  msg,
  isMine,
  router,
  isTranslating,
  translatedText,
  onHideTranslation,
}: {
  msg: Message;
  isMine: boolean;
  router: any;
  isTranslating: boolean;
  translatedText?: string;
  onHideTranslation: (msgId: string) => void;
}) {
  const colors = useColors();
  const { theme: ct } = useChatTheme();
  const fs = getFontSize(ct.fontSize);
  const replyPreviewText = msg.reply_to?.media_type
    ? `Attachment: ${msg.reply_to.media_type}`
    : (msg.reply_to?.content ?? "");
  const bubbleText = msg.content?.trim() ?? "";
  const timestampText = `${timeAgo(msg.created_at)}${isMine && ct.showReadReceipts ? " ✓✓" : ""}`;

  return (
    <>
      {msg.reply_to && (
        <View
          style={[
            styles.replyPreview,
            {
              borderLeftColor: isMine
                ? "rgba(255,255,255,0.65)"
                : colors.accentPrimary,
              backgroundColor: isMine
                ? "rgba(0,0,0,0.16)"
                : colors.bgCanvas,
            },
          ]}
        >
          <Text
            style={{
              color: isMine ? "#FFFFFF" : colors.accentPrimary,
              fontSize: 11,
              fontWeight: "700",
            }}
          >
            {(msg.reply_to as any).profiles?.display_name ?? "Message"}
          </Text>
          <Text
            style={{
              color: isMine ? "rgba(255,255,255,0.72)" : colors.textSecondary,
              fontSize: 12,
            }}
            numberOfLines={1}
          >
            {replyPreviewText}
          </Text>
        </View>
      )}

      <MediaBubble msg={msg} isMine={isMine} router={router} />

      {!!bubbleText && !msg.shared_post && (
        <Text
          style={[
            styles.bubbleText,
            { color: isMine ? "#FFFFFF" : colors.textPrimary, fontSize: fs },
          ]}
        >
          {bubbleText}
        </Text>
      )}

      {isTranslating && (
        <View
          style={[
            styles.translationBox,
            {
              backgroundColor: isMine
                ? "rgba(255,255,255,0.15)"
                : colors.accentTint,
            },
          ]}
        >
          <ActivityIndicator
            size="small"
            color={isMine ? "#FFFFFF" : colors.accentPrimary}
          />
          <Text
            style={{
              fontSize: 12,
              color: isMine ? "#FFFFFF" : colors.textSecondary,
            }}
          >
            Translating…
          </Text>
        </View>
      )}

      {!!translatedText && !isTranslating && (
        <View
          style={[
            styles.translationBox,
            {
              backgroundColor: isMine
                ? "rgba(255,255,255,0.15)"
                : colors.accentTint,
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
            },
          ]}
        >
          <Text
            style={{
              fontSize: 13,
              color: isMine ? "#FFFFFF" : colors.textPrimary,
              lineHeight: 18,
            }}
          >
            {translatedText}
          </Text>
          <Pressable
            onPress={() => onHideTranslation(msg.id)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Hide translation"
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: isMine ? "rgba(255,255,255,0.75)" : colors.accentPrimary,
              }}
            >
              Translated · Hide
            </Text>
          </Pressable>
        </View>
      )}

      <Text
        style={[
          styles.bubbleTime,
          { color: isMine ? "rgba(255,255,255,0.72)" : colors.textTertiary },
        ]}
      >
        {timestampText}
      </Text>

      {msg.reactions && msg.reactions.length > 0 && (
        <View style={styles.reactionPills}>
          {msg.reactions.map((r) => (
            <View
              key={r.emoji}
              style={[
                styles.reactionPill,
                {
                  backgroundColor: r.selfReacted
                    ? colors.accentTint
                    : colors.bgCanvas,
                  borderColor: r.selfReacted
                    ? colors.accentPrimary
                    : colors.separator,
                },
              ]}
            >
              <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
              {r.count > 1 && (
                <Text
                  style={[
                    styles.reactionPillCount,
                    { color: colors.textSecondary },
                  ]}
                >
                  {r.count}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

function MessageBubble({
  msg,
  isMine,
  showAvatar,
  isGrouped,
  onLongPress,
  router,
  isTranslating,
  translatedText,
  onHideTranslation,
}: {
  msg: Message;
  isMine: boolean;
  showAvatar: boolean;
  isGrouped: boolean;
  onLongPress: (msg: Message) => void;
  router: any;
  isTranslating: boolean;
  translatedText?: string;
  onHideTranslation: (msgId: string) => void;
}) {
  const colors = useColors();
  const profile = msg.profiles as Profile | undefined;
  const { theme: ct } = useChatTheme();
  const bubbleRadius = getBubbleRadius(ct.bubbleStyle, isMine);
  const isMinimal = ct.bubbleStyle === "minimal";

  const theirBubbleBg = colors.isDark
    ? ct.theirBubbleColor
    : colors.bgElevated;

  if (msg.is_deleted) {
    return (
      <View
        style={[
          styles.msgRow,
          isMine ? styles.msgRowMine : styles.msgRowOther,
          isGrouped && styles.msgGrouped,
        ]}
      >
        {!isMine && <View style={{ width: 28 }} />}
        <View
          style={[
            styles.deletedBubble,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
            },
          ]}
        >
          <Feather name="slash" size={11} color={colors.textTertiary} />
          <Text style={[styles.deletedText, { color: colors.textTertiary }]}>
            Message removed
          </Text>
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
      {!isMine ? (
        showAvatar ? (
          <Avatar
            name={profile?.display_name ?? "U"}
            avatarUrl={profile?.avatar_url}
            size={28}
            canvasColor={colors.bgCanvas}
          />
        ) : (
          <View style={{ width: 28 }} />
        )
      ) : null}

      <View style={{ maxWidth: "78%" }}>
        <Pressable onLongPress={() => onLongPress(msg)} delayLongPress={280}>
          {isMine ? (
            isMinimal ? (
              <View
                style={[
                  styles.bubble,
                  bubbleRadius,
                  {
                    backgroundColor: colors.accentPrimary,
                  },
                ]}
              >
                <BubbleContents
                  msg={msg}
                  isMine={isMine}
                  router={router}
                  isTranslating={isTranslating}
                  translatedText={translatedText}
                  onHideTranslation={onHideTranslation}
                />
              </View>
            ) : (
              <LinearGradient
                colors={[ct.myBubbleColor, ct.accentColor]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, bubbleRadius]}
              >
                <BubbleContents
                  msg={msg}
                  isMine={isMine}
                  router={router}
                  isTranslating={isTranslating}
                  translatedText={translatedText}
                  onHideTranslation={onHideTranslation}
                />
              </LinearGradient>
            )
          ) : (
            <View
              style={[
                styles.bubble,
                bubbleRadius,
                {
                  backgroundColor: theirBubbleBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.separator,
                },
              ]}
            >
              <BubbleContents
                msg={msg}
                isMine={isMine}
                router={router}
                isTranslating={isTranslating}
                translatedText={translatedText}
                onHideTranslation={onHideTranslation}
              />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

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
  const colors = useColors();
  const handlePress = () => {
    if (isRecording) onStop(true);
    else onStart();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.inputIconBtn,
        isRecording && {
          backgroundColor: "rgba(225,29,72,0.16)",
          borderRadius: 22,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Send voice message" : "Record voice message"}
    >
      <Animated.View style={{ transform: [{ scale: isRecording ? recordAnim : 1 }] }}>
        <Feather
          name={isRecording ? "send" : "mic"}
          size={20}
          color={isRecording ? colors.semanticDanger : colors.accentPrimary}
        />
      </Animated.View>
    </Pressable>
  );
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    chatId: string;
    peerName?: string;
    peerAvatar?: string;
    peerId?: string;
  }>();
  const { chatId } = params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const colors = useColors();
  const { showToast } = useToast();
  const { theme: chatTheme } = useChatTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const flatRef = useRef<FlatList>(null);
  const isDesktopWeb = Platform.OS === "web" && width >= 768;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiTone, setAiTone] = useState<
    "formal" | "casual" | "funny" | "flirty" | null
  >(null);
  const [aiToneVariants, setAiToneVariants] = useState<string[]>([]);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [deleteConvoConfirm, setDeleteConvoConfirm] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState(false);
  const [chatSummary, setChatSummary] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!user?.id || !chatId) return;
    const presenceChannel = supabase.channel(`presence-${chatId}`, {
      config: { presence: { key: user.id } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const others = Object.keys(state).filter((k) => k !== user.id);
        setPeerOnline(others.length > 0);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(presenceChannel);
    };
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
        if (g.dx < 0) slideX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          Animated.timing(slideX, {
            toValue: -300,
            duration: 180,
            useNativeDriver: true,
          }).start();
          setDiscardVisible(true);
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: async () => {
      const msgs = await fetchMessages(chatId as string);
      if (!msgs.length || !user?.id) return msgs;
      const reactMap = await fetchReactionsForConversation(
        msgs.map((m) => m.id),
        user.id,
      );
      return msgs.map((m) => ({
        ...m,
        reactions: reactMap.get(m.id) ?? [],
      }));
    },
    enabled: !!chatId,
  });

  useEffect(() => {
    if (chatId && user?.id) markConversationRead(chatId as string, user.id);
  }, [chatId, user?.id]);

  useEffect(() => {
    if (!chatId) return;
    const ch = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${chatId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
          qc.invalidateQueries({ queryKey: ["conversations", user?.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }: any) => {
        if (payload?.userId && payload.userId !== user?.id) {
          setPeerTyping(true);
          if (typingClearRef.current) clearTimeout(typingClearRef.current);
          typingClearRef.current = setTimeout(() => setPeerTyping(false), 3000);
        }
      })
      .on("broadcast", { event: "stop-typing" }, ({ payload }: any) => {
        if (payload?.userId && payload.userId !== user?.id) setPeerTyping(false);
      })
      .subscribe();
    typingChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
    };
  }, [chatId, user?.id, qc]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const startRecording = async () => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    try {
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {}
        recordingRef.current = null;
      }

      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        showToast("Microphone access is required for voice messages", "error");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      recordingRef.current = rec;
      setIsRecording(true);
      setRecordDuration(0);
      slideX.setValue(0);
      setDiscardVisible(false);
      recordTimer.current = setInterval(
        () => setRecordDuration((d) => d + 1),
        1000,
      );
      recordLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recordAnim, {
            toValue: 1.35,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(recordAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      recordLoop.current.start();
    } catch (e: any) {
      showToast(e?.message ?? "Could not start recording", "error");
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
          const url = await uploadMedia(
            uri,
            `voice_${Date.now()}.m4a`,
            "audio/x-m4a",
            "chat-media",
          );
          await sendMessage(chatId as string, user.id, "", {
            mediaUrl: url,
            mediaType: "audio",
          });
          qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
          qc.invalidateQueries({ queryKey: ["conversations", user.id] });
        } catch (e: any) {
          showToast(e?.message ?? "Failed to send voice message", "error");
        } finally {
          setSending(false);
        }
      }
    } catch (e: any) {
      showToast(e?.message ?? "Failed to stop recording", "error");
    }
  };

  const handleSend = useCallback(
    async (
      msgText?: string,
      opts?: { mediaUrl?: string; mediaType?: string; postId?: string },
    ) => {
      const content = msgText ?? text.trim();
      if (!content && !opts?.mediaUrl && !opts?.postId) return;
      if (!user?.id) return;
      setSending(true);
      const prev = text;
      const prevReply = replyTo;
      setText("");
      setReplyTo(null);
      setAiSuggestions([]);
      try {
        await sendMessage(chatId as string, user.id, content, {
          ...opts,
          replyToId: prevReply?.id,
        });
        qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
        qc.invalidateQueries({ queryKey: ["conversations", user.id] });
      } catch {
        setText(prev);
        showToast("Failed to send message", "error");
      } finally {
        setSending(false);
      }
    },
    [text, chatId, user?.id, replyTo, qc, showToast],
  );

  const [msgSheet, setMsgSheet] = useState<{
    msg: Message;
    isMine: boolean;
  } | null>(null);
  const msgSheetAnim = useRef(new Animated.Value(0)).current;

  const openMsgSheet = (msg: Message) => {
    haptics.medium();
    setMsgSheet({ msg, isMine: msg.sender_id === user?.id });
    Animated.spring(msgSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  const closeMsgSheet = () => {
    Animated.timing(msgSheetAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => setMsgSheet(null));
  };

  const handleDelete = async (msg: Message) => {
    if (!user?.id) return;
    try {
      await deleteMessage(msg.id, user.id);
      qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
      showToast("Message deleted", "success");
    } catch {
      showToast("Could not delete message", "error");
    }
  };

  const [blockSheet, setBlockSheet] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const BLOCK_REASONS = [
    "Spam",
    "Harassment",
    "Hate speech",
    "Impersonation",
    "Other",
  ];

  const pickMedia = async (type: "images" | "videos" | "all") => {
    setShowMediaMenu(false);
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast("Allow media library access in Settings", "error");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        type === "all" ? (["images", "videos"] as any) : ([type] as any),
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]) {
      setSending(true);
      try {
        const a = result.assets[0];
        const fallbackMime = a.type === "video" ? "video/mp4" : "image/jpeg";
        const ext = inferExtension(a.uri, a.mimeType ?? fallbackMime);
        const mime = normalizeMimeType(a.mimeType ?? fallbackMime, a.type === "video" ? "video" : "image");
        const url = await uploadMedia(
          a.uri,
          `${Date.now()}.${ext}`,
          mime,
          "chat-media",
        );
        await handleSend("", {
          mediaUrl: url,
          mediaType: a.type === "video" ? "video" : "image",
        });
      } catch (e: any) {
        showToast(e?.message ?? "Failed to send media", "error");
      } finally {
        setSending(false);
      }
    }
  };

  const openCamera = async () => {
    setShowMediaMenu(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast("Allow camera access in Settings", "error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      setSending(true);
      try {
        const a = result.assets[0];
        const fallbackMime = a.type === "video" ? "video/mp4" : "image/jpeg";
        const ext = inferExtension(a.uri, a.mimeType ?? fallbackMime);
        const mime = normalizeMimeType(a.mimeType ?? fallbackMime, a.type === "video" ? "video" : "image");
        const url = await uploadMedia(
          a.uri,
          `${Date.now()}.${ext}`,
          mime,
          "chat-media",
        );
        await handleSend("", {
          mediaUrl: url,
          mediaType: a.type === "video" ? "video" : "image",
        });
      } catch (e: any) {
        showToast(e?.message ?? "Failed to send media", "error");
      } finally {
        setSending(false);
      }
    }
  };

  const getAISuggestions = async () => {
    const lastMsg = (messages as Message[])
      .filter((m) => m.sender_id !== user?.id)
      .pop();
    if (!lastMsg?.content) return;
    setLoadingAI(true);
    try {
      const suggestions = await generateAIReplySuggestion(lastMsg.content);
      if (!suggestions.length) {
        showToast("No reply suggestions right now", "info");
      }
      setAiSuggestions(suggestions);
    } finally {
      setLoadingAI(false);
    }
  };

  const getAIToneVariants = async (
    baseText: string,
    tone: "formal" | "casual" | "funny" | "flirty",
  ) => {
    setAiTone(tone);
    setLoadingAI(true);
    try {
      const variant = await adjustAITone(baseText, tone);
      if (variant) setAiToneVariants([variant]);
    } finally {
      setLoadingAI(false);
    }
  };

  const translateMessage = async (msg: Message) => {
    if (!msg.content) return;
    setTranslatingMsgId(msg.id);
    try {
      const result = await translateAIText(msg.content, "English");
      if (result) {
        setTranslations((prev) => ({ ...prev, [msg.id]: result }));
      } else {
        showToast("Translation unavailable right now", "info");
      }
    } finally {
      setTranslatingMsgId(null);
    }
  };

  const hideTranslation = useCallback((msgId: string) => {
    setTranslations((prev) => {
      const copy = { ...prev };
      delete copy[msgId];
      return copy;
    });
  }, []);

  const summarizeConversation = async () => {
    if (chatSummary) {
      setChatSummary("");
      return;
    }
    setSummarizing(true);
    try {
      const history = (messages as Message[]).slice(-30).map((m) => ({
        role: m.sender_id === user?.id ? "user" : "assistant",
        content: m.content || "",
      }));
      const result = await summarizeAIChat(history);
      if (!result) {
        showToast("Summary unavailable right now", "info");
      } else {
        setChatSummary(result);
      }
    } finally {
      setSummarizing(false);
    }
  };

  const copyMessageText = async (content: string) => {
    if (!content) return;
    try {
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(content);
      } else {
        Clipboard.setString(content);
      }
      showToast("Copied to clipboard", "success");
    } catch {
      Clipboard.setString(content);
      showToast("Copied to clipboard", "success");
    }
  };

  const peerName =
    params.peerName && params.peerName !== "User" ? params.peerName : "Chat";
  const fmtDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const displayMessages = searchQuery.trim()
    ? (messages as Message[]).filter((m) =>
        m.content?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : (messages as Message[]);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bgCanvas }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ChatWallpaper
        wallpaper={chatTheme.wallpaper}
        accent={chatTheme.accentColor}
        bgCanvas={colors.bgCanvas}
      />

      {/* Header */}
      <GlassSurface
        style={[
          styles.headerWrap,
          {
            paddingTop: Platform.OS === "web" ? 10 : insets.top + 6,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View
          style={[
            styles.headerInner,
            { maxWidth: isDesktopWeb ? 720 : undefined },
          ]}
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={24} color={colors.textPrimary} />
          </Pressable>

          <Pressable
            onPress={() => {
              if (params.peerId) router.push(`/user/${params.peerId}` as any);
            }}
            style={styles.headerPeerInfo}
          >
            <Avatar
              name={peerName}
              avatarUrl={params.peerAvatar}
              size={38}
              showOnline={peerOnline}
              canvasColor={colors.bgCanvas}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.headerName, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {peerName}
              </Text>
              {peerOnline && (
                <Text style={[styles.headerStatus, { color: colors.semanticSuccess }]}>
                  Active now
                </Text>
              )}
            </View>
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: `/call/${chatId}`,
                  params: {
                    peerName,
                    peerId: params.peerId ?? "",
                    role: "caller",
                  },
                } as any)
              }
              style={[
                styles.headerIconBtn,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Voice call"
            >
              <Feather name="phone" size={18} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: `/call/${chatId}`,
                  params: {
                    peerName,
                    peerId: params.peerId ?? "",
                    isVideo: "true",
                    role: "caller",
                  },
                } as any)
              }
              style={[
                styles.headerIconBtn,
                {
                  backgroundColor: colors.accentPrimary,
                  borderColor: colors.accentPrimary,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Video call"
            >
              <Feather name="video" size={18} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={summarizeConversation}
              style={[
                styles.headerIconBtn,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Summarize conversation"
            >
              <Feather name="file-text" size={18} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => setShowChatMenu(true)}
              style={[
                styles.headerIconBtn,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Conversation options"
            >
              <Feather
                name="more-vertical"
                size={18}
                color={colors.textPrimary}
              />
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      {/* Main chat column */}
      <View
        style={[
          styles.columnWrap,
          { maxWidth: isDesktopWeb ? 720 : undefined },
        ]}
      >
        {(summarizing || !!chatSummary) && (
          <View
            style={[
              styles.summaryBanner,
              {
                backgroundColor: colors.accentTint,
                borderBottomColor: colors.separator,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather
                name="file-text"
                size={14}
                color={colors.accentPrimary}
              />
              <Text
                style={{
                  color: colors.accentPrimary,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                Conversation Summary
              </Text>
              {summarizing && (
                <ActivityIndicator size="small" color={colors.accentPrimary} />
              )}
              <View style={{ flex: 1 }} />
              {!!chatSummary && (
                <Pressable onPress={() => setChatSummary("")} hitSlop={8}>
                  <Feather name="x" size={14} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            {!!chatSummary && (
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: 13,
                  marginTop: 4,
                  lineHeight: 19,
                }}
              >
                {chatSummary}
              </Text>
            )}
          </View>
        )}

        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.accentPrimary} size="large" />
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
              const showAvatar =
                !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
              const isGrouped =
                !!prevMsg && prevMsg.sender_id === msg.sender_id;
              return (
                <MessageBubble
                  msg={msg}
                  isMine={isMine}
                  showAvatar={showAvatar}
                  isGrouped={isGrouped}
                  onLongPress={openMsgSheet}
                  router={router}
                  isTranslating={translatingMsgId === msg.id}
                  translatedText={translations[msg.id]}
                  onHideTranslation={hideTranslation}
                />
              );
            }}
            ListFooterComponent={
              peerTyping && !searchQuery.trim() ? (
                <View style={styles.typingRow}>
                  <View
                    style={[
                      styles.typingBubble,
                      {
                        backgroundColor: colors.bgElevated,
                        borderColor: colors.separator,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.typingDot,
                        { backgroundColor: colors.textTertiary, opacity: 0.45 },
                      ]}
                    />
                    <View
                      style={[
                        styles.typingDot,
                        { backgroundColor: colors.textTertiary, opacity: 0.7 },
                      ]}
                    />
                    <View
                      style={[
                        styles.typingDot,
                        { backgroundColor: colors.textTertiary, opacity: 0.95 },
                      ]}
                    />
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <View
                  style={[
                    styles.emptyChatIcon,
                    { backgroundColor: colors.accentTint },
                  ]}
                >
                  <Feather
                    name="message-circle"
                    size={32}
                    color={colors.accentPrimary}
                  />
                </View>
                <Text
                  style={[styles.emptyChatTitle, { color: colors.textPrimary }]}
                >
                  Start the conversation
                </Text>
                <Text
                  style={[styles.emptyChatSub, { color: colors.textSecondary }]}
                >
                  Say hello to {peerName}
                </Text>
              </View>
            }
          />
        )}

        {isRecording && (
          <View
            style={[
              styles.recordingBar,
              {
                backgroundColor: colors.bgElevated,
                borderTopColor: colors.separator,
              },
            ]}
          >
            <View style={styles.recordTrashZone}>
              <Feather name="trash-2" size={18} color={colors.semanticDanger} />
              <Text
                style={[styles.recordTrashLabel, { color: colors.semanticDanger }]}
              >
                Release to discard
              </Text>
            </View>

            <Animated.View
              style={[
                styles.recordSlide,
                {
                  backgroundColor: colors.bgElevated,
                  transform: [{ translateX: slideX }],
                },
              ]}
              {...panResponder.panHandlers}
            >
              <Animated.View
                style={[
                  styles.recordDot,
                  {
                    backgroundColor: colors.semanticDanger,
                    transform: [{ scale: recordAnim }],
                  },
                ]}
              />
              <Text style={[styles.recordingText, { color: colors.semanticDanger }]}>
                {fmtDuration(recordDuration)}
              </Text>
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
                <Feather
                  name="chevron-left"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={[styles.recordingHint, { color: colors.textSecondary }]}>
                  Swipe to discard
                </Text>
              </Animated.View>
            </Animated.View>

            {discardVisible && (
              <View
                style={[
                  styles.discardOverlay,
                  { backgroundColor: colors.bgElevated },
                ]}
              >
                <Feather name="trash-2" size={16} color={colors.semanticDanger} />
                <Text style={[styles.discardText, { color: colors.semanticDanger }]}>
                  Discarded
                </Text>
                <Pressable
                  onPress={() => stopRecording(false)}
                  style={[
                    styles.discardConfirmBtn,
                    { borderColor: colors.semanticDanger },
                  ]}
                >
                  <Text
                    style={[
                      styles.discardConfirmText,
                      { color: colors.semanticDanger },
                    ]}
                  >
                    OK
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {searchMode && (
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: colors.bgElevated,
                borderTopColor: colors.separator,
              },
            ]}
          >
            <Feather name="search" size={15} color={colors.accentPrimary} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search messages…"
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            <Pressable
              onPress={() => {
                setSearchMode(false);
                setSearchQuery("");
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close search"
            >
              <Feather name="x" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {replyTo && !isRecording && (
          <View
            style={[
              styles.replyBar,
              {
                backgroundColor: colors.bgElevated,
                borderTopColor: colors.separator,
              },
            ]}
          >
            <View
              style={[
                styles.replyBarAccent,
                { backgroundColor: colors.accentPrimary },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.replyBarLabel, { color: colors.accentPrimary }]}
              >
                Replying to{" "}
                {(replyTo.profiles as Profile | undefined)?.display_name ??
                  "message"}
              </Text>
              <Text
                style={[styles.replyBarContent, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {replyTo.media_type
                  ? `Attachment: ${replyTo.media_type}`
                  : (replyTo.content ?? "")}
              </Text>
            </View>
            <Pressable
              onPress={() => setReplyTo(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
            >
              <Feather name="x" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {aiSuggestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.aiRow,
              {
                backgroundColor: colors.bgElevated,
                borderTopColor: colors.separator,
              },
            ]}
          >
            <View
              style={[styles.aiLabel, { backgroundColor: colors.accentTint }]}
            >
              <Feather name="zap" size={11} color={colors.accentPrimary} />
              <Text
                style={[styles.aiLabelText, { color: colors.accentPrimary }]}
              >
                AI
              </Text>
            </View>
            {aiSuggestions.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  handleSend(s);
                  setAiSuggestions([]);
                }}
                style={[
                  styles.aiChip,
                  {
                    backgroundColor: colors.bgCanvas,
                    borderColor: colors.separator,
                  },
                ]}
              >
                <Text style={[styles.aiChipText, { color: colors.textPrimary }]}>
                  {s}
                </Text>
              </Pressable>
            ))}
            {aiTone &&
              aiToneVariants.map((v, i) => (
                <Pressable
                  key={`${aiTone}-${i}`}
                  onPress={() => {
                    handleSend(v);
                    setAiSuggestions([]);
                    setAiTone(null);
                    setAiToneVariants([]);
                  }}
                  style={[
                    styles.aiChip,
                    {
                      backgroundColor: colors.accentTint,
                      borderColor: colors.accentPrimary,
                    },
                  ]}
                >
                  <Text
                    style={[styles.aiChipText, { color: colors.textPrimary }]}
                  >
                    {v}
                  </Text>
                </Pressable>
              ))}
            <Pressable
              onPress={() => {
                setAiSuggestions([]);
                setAiTone(null);
                setAiToneVariants([]);
              }}
              style={[
                styles.aiChip,
                {
                  paddingHorizontal: 10,
                  backgroundColor: colors.bgCanvas,
                  borderColor: colors.separator,
                },
              ]}
            >
              <Feather name="x" size={13} color={colors.textSecondary} />
            </Pressable>
          </ScrollView>
        )}

        {aiSuggestions.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 16,
              paddingBottom: 8,
              backgroundColor: colors.bgElevated,
            }}
          >
            {(["formal", "casual", "funny", "flirty"] as const).map((tone) => (
              <Pressable
                key={tone}
                onPress={() => {
                  const base =
                    aiToneVariants.length > 0
                      ? aiToneVariants[0]
                      : aiSuggestions[0];
                  if (base) getAIToneVariants(base, tone);
                }}
                style={[
                  styles.aiChip,
                  {
                    paddingHorizontal: 10,
                    backgroundColor:
                      aiTone === tone ? colors.accentTint : colors.bgCanvas,
                    borderColor:
                      aiTone === tone
                        ? colors.accentPrimary
                        : colors.separator,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.aiChipText,
                    {
                      fontSize: 11.5,
                      textTransform: "capitalize",
                      color: colors.textPrimary,
                    },
                  ]}
                >
                  {tone}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Input bar */}
        <GlassSurface
          style={[
            styles.inputBar,
            {
              borderTopColor: colors.separator,
              paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
            },
          ]}
        >
          <Pressable
            onPress={() => setShowMediaMenu(true)}
            style={styles.inputIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Add attachment"
          >
            <Feather name="plus" size={22} color={colors.accentPrimary} />
          </Pressable>

          <TextInput
            style={[
              styles.inputField,
              {
                color: colors.textPrimary,
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
            placeholder="Message…"
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (!t) setAiSuggestions([]);
              const ch = typingChannelRef.current;
              if (ch) {
                if (t && !typingSentRef.current) {
                  typingSentRef.current = true;
                  ch.send({
                    type: "broadcast",
                    event: "typing",
                    payload: { userId: user?.id },
                  });
                } else if (!t && typingSentRef.current) {
                  typingSentRef.current = false;
                  ch.send({
                    type: "broadcast",
                    event: "stop-typing",
                    payload: { userId: user?.id },
                  });
                }
                if (typingClearRef.current) clearTimeout(typingClearRef.current);
                typingClearRef.current = setTimeout(() => {
                  if (typingSentRef.current) {
                    typingSentRef.current = false;
                    ch.send({
                      type: "broadcast",
                      event: "stop-typing",
                      payload: { userId: user?.id },
                    });
                  }
                }, 2500);
              }
            }}
            multiline
            accessibilityLabel="Message input"
          />

          {text.length === 0 ? (
            <>
              <Pressable
                onPress={() => {
                  const lastMsg = (messages as Message[])
                    .filter((m) => m.sender_id !== user?.id)
                    .pop();
                  if (!lastMsg?.content) {
                    showToast(
                      "Wait for an incoming message to generate reply suggestions",
                      "info",
                    );
                    return;
                  }
                  getAISuggestions();
                }}
                disabled={loadingAI}
                style={styles.inputIconBtn}
                accessibilityRole="button"
                accessibilityLabel="AI reply suggestions"
              >
                {loadingAI ? (
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                ) : (
                  <Feather name="zap" size={20} color={colors.accentPrimary} />
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
              style={[
                styles.sendBtn,
                { backgroundColor: colors.accentPrimary },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Feather name="send" size={16} color="#FFFFFF" />
              )}
            </Pressable>
          )}
        </GlassSurface>
      </View>

      {/* Conversation options ActionSheet */}
      <ActionSheet
        visible={showChatMenu}
        title={peerName}
        message={peerOnline ? "Active now" : "Conversation options"}
        onClose={() => setShowChatMenu(false)}
        items={[
          {
            id: "profile",
            label: "View Profile",
            icon: "user",
            onPress: () => {
              if (params.peerId) router.push(`/user/${params.peerId}` as any);
              else showToast("Profile unavailable", "error");
            },
          },
          {
            id: "search",
            label: "Search in Conversation",
            icon: "search",
            onPress: () => {
              setSearchMode(true);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            },
          },
          {
            id: "mute",
            label: muted ? "Unmute Notifications" : "Mute Notifications",
            icon: muted ? "bell" : "bell-off",
            onPress: () => {
              setMuted((m) => !m);
              showToast(muted ? "Notifications enabled" : "Muted", "info");
            },
          },
          {
            id: "media",
            label: "Shared Media & Links",
            icon: "image",
            onPress: () =>
              router.push({
                pathname: `/chat-media/${chatId}`,
                params: { peerName },
              } as any),
          },
          {
            id: "appearance",
            label: "Chat Appearance",
            icon: "sliders",
            onPress: () => router.push("/chat-settings" as any),
          },
          {
            id: "block",
            label: `Block ${peerName}`,
            icon: "slash",
            destructive: true,
            onPress: () => setBlockSheet(true),
          },
          {
            id: "delete-convo",
            label: "Delete Conversation",
            icon: "trash-2",
            destructive: true,
            onPress: () => setDeleteConvoConfirm(true),
          },
        ]}
      />

      <ActionSheet
        visible={deleteConvoConfirm}
        title="Delete Conversation"
        message="This will remove the conversation from your view."
        onClose={() => setDeleteConvoConfirm(false)}
        items={[
          {
            id: "confirm-delete",
            label: "Delete Conversation",
            icon: "trash-2",
            destructive: true,
            onPress: () => router.back(),
          },
        ]}
      />

      {/* Media picker ActionSheet */}
      <ActionSheet
        visible={showMediaMenu}
        title="Add to message"
        onClose={() => setShowMediaMenu(false)}
        items={[
          ...(Platform.OS !== "web"
            ? [
                {
                  id: "camera",
                  label: "Camera",
                  subtitle: "Take a photo or video",
                  icon: "camera" as const,
                  onPress: openCamera,
                },
              ]
            : []),
          {
            id: "photo",
            label: "Photo",
            subtitle: "Choose from your library",
            icon: "image",
            onPress: () => pickMedia("images"),
          },
          {
            id: "video",
            label: "Video",
            subtitle: "Choose from your library",
            icon: "film",
            onPress: () => pickMedia("videos"),
          },
          {
            id: "voice",
            label: "Voice Message",
            subtitle: "Record an audio note",
            icon: "mic",
            onPress: () => {
              startRecording();
            },
          },
        ]}
      />

      {/* Message long-press bottom sheet */}
      <Modal
        visible={!!msgSheet}
        transparent
        animationType="none"
        onRequestClose={closeMsgSheet}
      >
        <Pressable
          style={[styles.sheetOverlay, { backgroundColor: colors.bgOverlay }]}
          onPress={closeMsgSheet}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
                paddingBottom: Math.max(insets.bottom, 24),
                transform: [
                  {
                    translateY: msgSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
                opacity: msgSheetAnim,
              },
            ]}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: colors.muted }]}
            />

            <View style={styles.reactionsRow}>
              {["❤️", "😂", "😮", "😢", "👍", "🔥"].map((emoji) => {
                const existing = msgSheet?.msg.reactions?.find(
                  (r) => r.emoji === emoji,
                );
                return (
                  <Pressable
                    key={emoji}
                    onPress={async () => {
                      if (!user?.id || !msgSheet) return;
                      closeMsgSheet();
                      await toggleReaction(msgSheet.msg.id, user.id, emoji);
                      qc.invalidateQueries({
                        queryKey: ["chat-messages", chatId],
                      });
                    }}
                    style={({ pressed }) => [
                      styles.reactionBtn,
                      { backgroundColor: colors.bgCanvas },
                      existing?.selfReacted && {
                        backgroundColor: colors.accentTint,
                        borderWidth: 1.5,
                        borderColor: colors.accentPrimary,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${emoji}`}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    {existing && existing.count > 0 && (
                      <Text
                        style={[
                          styles.reactionCount,
                          { color: colors.accentPrimary },
                        ]}
                      >
                        {existing.count}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View
              style={[
                styles.sheetDivider,
                { backgroundColor: colors.separator },
              ]}
            />

            {(
              [
                {
                  icon: "corner-up-left" as const,
                  label: "Reply",
                  onPress: () => {
                    setReplyTo(msgSheet!.msg);
                    closeMsgSheet();
                  },
                },
                {
                  icon: "copy" as const,
                  label: "Copy",
                  onPress: () => {
                    const msgText = msgSheet?.msg.content ?? "";
                    closeMsgSheet();
                    copyMessageText(msgText);
                  },
                },
                {
                  icon: "globe" as const,
                  label: "Translate",
                  onPress: () => {
                    const target = msgSheet!.msg;
                    closeMsgSheet();
                    translateMessage(target);
                  },
                },
                ...(!msgSheet?.isMine
                  ? [
                      {
                        icon: "flag" as const,
                        label: "Report",
                        danger: false,
                        onPress: () => {
                          closeMsgSheet();
                          showToast("Message reported", "info");
                        },
                      },
                    ]
                  : []),
                ...(msgSheet?.isMine
                  ? [
                      {
                        icon: "trash-2" as const,
                        label: "Delete",
                        danger: true,
                        onPress: () => {
                          const target = msgSheet!.msg;
                          closeMsgSheet();
                          handleDelete(target);
                        },
                      },
                    ]
                  : []),
              ] as {
                icon: keyof typeof Feather.glyphMap;
                label: string;
                danger?: boolean;
                onPress: () => void;
              }[]
            ).map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.sheetItem,
                  pressed && { backgroundColor: colors.accentTint },
                ]}
              >
                <View
                  style={[
                    styles.sheetItemIcon,
                    {
                      backgroundColor: action.danger
                        ? "rgba(225,29,72,0.12)"
                        : colors.accentTint,
                    },
                  ]}
                >
                  <Feather
                    name={action.icon}
                    size={18}
                    color={
                      action.danger
                        ? colors.semanticDanger
                        : colors.accentPrimary
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.sheetItemLabel,
                    {
                      color: action.danger
                        ? colors.semanticDanger
                        : colors.textPrimary,
                    },
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Block reason picker */}
      <Modal
        visible={blockSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setBlockSheet(false)}
      >
        <Pressable
          style={[styles.sheetOverlay, { backgroundColor: colors.bgOverlay }]}
          onPress={() => setBlockSheet(false)}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: colors.muted }]}
            />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              Block {peerName}
            </Text>
            <Text
              style={[styles.sheetSubtitle, { color: colors.textSecondary }]}
            >
              Select a reason (optional)
            </Text>
            {BLOCK_REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setBlockReason(r === blockReason ? null : r)}
                style={({ pressed }) => [
                  styles.sheetItem,
                  pressed && { backgroundColor: colors.accentTint },
                ]}
              >
                <View
                  style={[
                    styles.reasonCheck,
                    { borderColor: colors.separator },
                    blockReason === r && {
                      backgroundColor: colors.accentPrimary,
                      borderColor: colors.accentPrimary,
                    },
                  ]}
                >
                  {blockReason === r && (
                    <Feather name="check" size={12} color="#FFFFFF" />
                  )}
                </View>
                <Text
                  style={[styles.sheetItemLabel, { color: colors.textPrimary }]}
                >
                  {r}
                </Text>
              </Pressable>
            ))}
            <View
              style={[
                styles.sheetDivider,
                { backgroundColor: colors.separator },
              ]}
            />
            <Pressable
              onPress={async () => {
                setBlockSheet(false);
                setBlockReason(null);
                if (user?.id && params.peerId) {
                  await blockUser(user.id, params.peerId);
                }
                showToast(`${peerName} has been blocked`, "success");
                router.back();
              }}
              style={[
                styles.blockConfirmBtn,
                { backgroundColor: colors.semanticDanger },
              ]}
            >
              <Text style={styles.blockConfirmText}>Block User</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInner: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 8,
  },
  columnWrap: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPeerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  headerName: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerStatus: {
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 6,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
    gap: 8,
    marginBottom: 4,
  },
  msgRowMine: {
    justifyContent: "flex-end",
  },
  msgRowOther: {
    justifyContent: "flex-start",
  },
  msgGrouped: {
    marginBottom: 2,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTime: {
    fontSize: 10.5,
    alignSelf: "flex-end",
    marginTop: 1,
    fontVariant: ["tabular-nums"],
  },
  translationBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: RADIUS.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  replyPreview: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 5,
    marginBottom: 4,
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  deletedText: {
    fontSize: 13,
    fontStyle: "italic",
  },
  msgImage: {
    width: 220,
    height: 220,
    borderRadius: RADIUS.md,
  },
  msgVideo: {
    width: 220,
    height: 165,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  fileBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    minWidth: 150,
  },
  audioBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    minWidth: 196,
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  sharedPost: {
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    maxWidth: 224,
  },
  sharedPostImg: {
    width: "100%",
    height: 120,
    borderRadius: 8,
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 8,
  },
  emptyChatIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  emptyChatSub: {
    fontSize: 14,
  },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    position: "relative",
  },
  recordTrashZone: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 170,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
  },
  recordTrashLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  recordSlide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordingText: {
    fontWeight: "700",
    fontSize: 14,
    minWidth: 44,
    fontVariant: ["tabular-nums"],
  },
  recordHintRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  recordingHint: {
    fontSize: 12,
  },
  discardOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  discardText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  discardConfirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  discardConfirmText: {
    fontWeight: "700",
    fontSize: 13,
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  replyBarAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  replyBarLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  replyBarContent: {
    fontSize: 13,
  },
  aiRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  aiLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  aiLabelText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  aiChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aiChipText: {
    fontSize: 13,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputIconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  inputField: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 11,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  typingRow: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  typingBubble: {
    flexDirection: "row",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 540,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 52,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 4,
  },
  sheetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetItemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
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
    gap: 2,
  },
  reactionEmoji: {
    fontSize: 22,
  },
  reactionCount: {
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  reactionPillCount: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  reasonCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  blockConfirmBtn: {
    borderRadius: RADIUS.md,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  blockConfirmText: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "700",
  },
});