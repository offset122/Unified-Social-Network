import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator,
  Pressable, Alert, Platform, Image, ActionSheetIOS, Modal, ScrollView,
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
import { Audio } from "expo-av";
import {
  fetchMessages, sendMessage, deleteMessage, markConversationRead,
  uploadMedia, resolveMediaUrl, generateAIReplySuggestion, timeAgo,
  type Message, type Profile, type Post,
} from "@/lib/db";
import { Video, ResizeMode } from "expo-av";

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

function AudioPlayer({ uri, isMine, colors }: { uri: string; isMine: boolean; colors: any }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  const toggle = async () => {
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync({ uri: resolveMediaUrl(uri) }, { shouldPlay: true });
      setSound(s);
      setPlaying(true);
      s.setOnPlaybackStatusUpdate(st => {
        if (!st.isLoaded) return;
        setPosition(st.positionMillis ?? 0);
        setDuration(st.durationMillis ?? 0);
        if (st.didJustFinish) { setPlaying(false); setPosition(0); }
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

  return (
    <Pressable onPress={toggle} style={[styles.audioBubble, { backgroundColor: isMine ? "rgba(255,255,255,0.18)" : colors.secondary }]}>
      <View style={[styles.audioPlayBtn, { backgroundColor: isMine ? "rgba(255,255,255,0.3)" : colors.primary + "33" }]}>
        <Feather name={playing ? "pause" : "play"} size={14} color={isMine ? "#fff" : colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.audioWaveform, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : colors.border }]}>
          <View style={[styles.audioProgress, { width: `${pct * 100}%`, backgroundColor: isMine ? "#fff" : colors.primary }]} />
        </View>
        <Text style={{ color: isMine ? "rgba(255,255,255,0.7)" : colors.mutedForeground, fontSize: 10 }}>
          {duration > 0 ? fmt(position) + " / " + fmt(duration) : "Voice message"}
        </Text>
      </View>
    </Pressable>
  );
}

function SharedPostBubble({ post, isMine, colors, onPress }: { post: any; isMine: boolean; colors: any; onPress: () => void }) {
  const media = post.media_urls?.[0] ? resolveMediaUrl(post.media_urls[0]) : null;
  const profile = post.profiles as Profile | undefined;
  return (
    <Pressable onPress={onPress} style={[styles.sharedPost, { backgroundColor: isMine ? "rgba(255,255,255,0.12)" : colors.secondary, borderColor: isMine ? "rgba(255,255,255,0.2)" : colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Feather name="share-2" size={11} color={isMine ? "rgba(255,255,255,0.6)" : colors.mutedForeground} />
        <Text style={{ color: isMine ? "rgba(255,255,255,0.6)" : colors.mutedForeground, fontSize: 11 }}>Shared a post</Text>
      </View>
      {media && <Image source={{ uri: media }} style={styles.sharedPostImg} resizeMode="cover" />}
      {!!post.content && <Text style={{ color: isMine ? "#fff" : colors.foreground, fontSize: 13, marginTop: media ? 6 : 0 }} numberOfLines={2}>{post.content}</Text>}
      {profile && <Text style={{ color: isMine ? "rgba(255,255,255,0.5)" : colors.mutedForeground, fontSize: 11, marginTop: 4 }}>by @{profile.username}</Text>}
    </Pressable>
  );
}

function MediaBubble({ msg, isMine, colors, router }: { msg: Message; isMine: boolean; colors: any; router: any }) {
  if (msg.shared_post) return <SharedPostBubble post={msg.shared_post} isMine={isMine} colors={colors} onPress={() => router.push(`/post/${msg.shared_post!.id}` as any)} />;
  if (!msg.media_url) return null;
  const uri = resolveMediaUrl(msg.media_url);
  if (msg.media_type === "audio") return <AudioPlayer uri={uri} isMine={isMine} colors={colors} />;
  if (msg.media_type === "image") return <Image source={{ uri }} style={styles.msgImage} resizeMode="cover" />;
  if (msg.media_type === "video") return <View style={styles.msgVideo}><Video source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.COVER} shouldPlay={false} useNativeControls /></View>;
  return (
    <View style={[styles.fileBubble, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : colors.secondary }]}>
      <Feather name="file" size={18} color={isMine ? "#fff" : colors.primary} />
      <Text style={{ color: isMine ? "#fff" : colors.foreground, fontSize: 13, marginLeft: 8 }} numberOfLines={1}>{msg.media_url.split("/").pop()}</Text>
    </View>
  );
}

function MessageBubble({ msg, isMine, showAvatar, colors, onLongPress, router }: {
  msg: Message; isMine: boolean; showAvatar: boolean; colors: any;
  onLongPress: (msg: Message) => void; router: any;
}) {
  const profile = msg.profiles as Profile | undefined;
  if (msg.is_deleted) {
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
        {!isMine && <View style={{ width: 30 }} />}
        <View style={[styles.deletedBubble, { borderColor: colors.border }]}>
          <Feather name="trash-2" size={12} color={colors.mutedForeground} />
          <Text style={[styles.deletedText, { color: colors.mutedForeground }]}>Message deleted</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
      {!isMine && showAvatar ? <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={28} /> : !isMine ? <View style={{ width: 28 }} /> : null}
      <Pressable onLongPress={() => onLongPress(msg)}
        style={[styles.bubble, isMine ? styles.bubbleMine : [styles.bubbleOther, { backgroundColor: colors.card, borderColor: colors.border }]]}>
        {msg.reply_to && (
          <View style={[styles.replyPreview, { borderLeftColor: isMine ? "rgba(255,255,255,0.5)" : colors.primary, backgroundColor: isMine ? "rgba(255,255,255,0.1)" : colors.secondary }]}>
            <Text style={{ color: isMine ? "rgba(255,255,255,0.7)" : colors.primary, fontSize: 11, fontWeight: "700" }}>
              {(msg.reply_to as any).profiles?.display_name ?? "Message"}
            </Text>
            <Text style={{ color: isMine ? "rgba(255,255,255,0.6)" : colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
              {msg.reply_to.media_type ? `📎 ${msg.reply_to.media_type}` : msg.reply_to.content}
            </Text>
          </View>
        )}
        <MediaBubble msg={msg} isMine={isMine} colors={colors} router={router} />
        {!!msg.content && !msg.is_deleted && !msg.shared_post && (
          <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.foreground }]}>{msg.content}</Text>
        )}
        <Text style={[styles.bubbleTime, { color: isMine ? "rgba(255,255,255,0.55)" : colors.mutedForeground }]}>
          {timeAgo(msg.created_at)}{isMine ? " ✓✓" : ""}
        </Text>
      </Pressable>
    </View>
  );
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const params = useLocalSearchParams<{ peerName?: string; peerAvatar?: string; peerId?: string }>();
  const colors = useColors();
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

  // Audio recording
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordAnim = useRef(new Animated.Value(1)).current;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: () => fetchMessages(chatId as string),
    enabled: !!chatId,
  });

  useEffect(() => {
    if (chatId && user?.id) markConversationRead(chatId as string, user.id);
  }, [chatId, user?.id]);

  useEffect(() => {
    if (!chatId) return;
    const ch = supabase.channel(`chat-${chatId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${chatId}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  // Audio recording logic
  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert("Permission", "Microphone access is required"); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
      setRecordDuration(0);
      recordTimer.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
      Animated.loop(Animated.sequence([
        Animated.timing(recordAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(recordAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])).start();
    } catch { Alert.alert("Error", "Could not start recording"); }
  };

  const stopRecording = async (send = true) => {
    if (!recording) return;
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordAnim.stopAnimation();
    recordAnim.setValue(1);
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (send && uri && user?.id) {
        setSending(true);
        try {
          const url = await uploadMedia(uri, `voice_${Date.now()}.m4a`, "audio/m4a", "chat-media");
          await sendMessage(chatId as string, user.id, "", { mediaUrl: url, mediaType: "audio" });
          qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        } catch { Alert.alert("Error", "Failed to send voice message"); }
        finally { setSending(false); }
      }
    } catch {}
  };

  const handleSend = useCallback(async (msgText?: string, opts?: { mediaUrl?: string; mediaType?: string; postId?: string }) => {
    const content = msgText ?? text.trim();
    if (!content && !opts?.mediaUrl && !opts?.postId) return;
    if (!user?.id) return;
    setSending(true);
    const prev = text;
    setText("");
    setReplyTo(null);
    setAiSuggestions([]);
    try {
      await sendMessage(chatId as string, user.id, content, { ...opts, replyToId: replyTo?.id });
      qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      setText(prev);
      Alert.alert("Error", "Failed to send message");
    } finally { setSending(false); }
  }, [text, chatId, user?.id, replyTo]);

  const handleLongPress = (msg: Message) => {
    const isMine = msg.sender_id === user?.id;
    const options = isMine ? ["Reply", "Delete", "Cancel"] : ["Reply", "Cancel"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: isMine ? 1 : -1 },
        (i) => { if (options[i] === "Reply") setReplyTo(msg); if (options[i] === "Delete") handleDelete(msg); }
      );
    } else {
      Alert.alert("Message", undefined, [
        { text: "Reply", onPress: () => setReplyTo(msg) },
        ...(isMine ? [{ text: "Delete", style: "destructive" as const, onPress: () => handleDelete(msg) }] : []),
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const handleDelete = async (msg: Message) => {
    if (!user?.id) return;
    try {
      await deleteMessage(msg.id, user.id);
      qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
    } catch { Alert.alert("Error", "Could not delete message"); }
  };

  const pickImage = async () => {
    setShowMediaMenu(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setSending(true);
      try {
        const a = result.assets[0];
        const ext = a.uri.split(".").pop() ?? "jpg";
        const mime = a.type === "video" ? `video/${ext}` : `image/${ext}`;
        const url = await uploadMedia(a.uri, `${Date.now()}.${ext}`, mime, "chat-media");
        await handleSend("", { mediaUrl: url, mediaType: a.type === "video" ? "video" : "image" });
      } catch { Alert.alert("Error", "Failed to send media"); }
      finally { setSending(false); }
    }
  };

  const getAISuggestions = async () => {
    const lastMsg = (messages as Message[]).filter(m => m.sender_id !== user?.id).pop();
    if (!lastMsg || !lastMsg.content) return;
    setLoadingAI(true);
    try { setAiSuggestions(await generateAIReplySuggestion(lastMsg.content)); }
    finally { setLoadingAI(false); }
  };

  const peerName = params.peerName ?? "Chat";
  const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={[colors.primary, colors.primary + "dd"]} style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Avatar name={peerName} avatarUrl={params.peerAvatar} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.chatHeaderName}>{peerName}</Text>
          <Text style={styles.chatHeaderStatus}>Active now</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: `/call/${chatId}`, params: { peerName } } as any)} style={styles.headerBtn}>
          <Feather name="phone" size={20} color="#fff" />
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: `/call/${chatId}`, params: { peerName, isVideo: "true" } } as any)} style={styles.headerBtn}>
          <Feather name="video" size={20} color="#fff" />
        </Pressable>
      </LinearGradient>

      {/* Messages */}
      {isLoading ? (
        <View style={styles.loadingCenter}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages as Message[]}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 8, gap: 2 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: msg, index }) => {
            const isMine = msg.sender_id === user?.id;
            const prevMsg = index > 0 ? (messages as Message[])[index - 1] : null;
            const showAvatar = !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
            return <MessageBubble msg={msg} isMine={isMine} showAvatar={showAvatar} colors={colors} onLongPress={handleLongPress} router={router} />;
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <LinearGradient colors={[colors.primary + "22", colors.primary + "08"]} style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Feather name="message-circle" size={32} color={colors.primary} />
              </LinearGradient>
              <Text style={[styles.emptyChatText, { color: colors.mutedForeground }]}>Say hello! 👋</Text>
            </View>
          }
        />
      )}

      {/* Recording indicator */}
      {isRecording && (
        <View style={[styles.recordingBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Animated.View style={[styles.recordDot, { transform: [{ scale: recordAnim }] }]} />
          <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 14 }}>Recording {fmtDuration(recordDuration)}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginLeft: "auto" }}>Release to send • Swipe up to cancel</Text>
        </View>
      )}

      {/* Reply preview */}
      {replyTo && !isRecording && (
        <View style={[styles.replyBar, { backgroundColor: colors.secondary, borderTopColor: colors.border }]}>
          <View style={[styles.replyBarLine, { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBarLabel, { color: colors.primary }]}>Replying to {(replyTo.profiles as Profile | undefined)?.display_name ?? "message"}</Text>
            <Text style={[styles.replyBarContent, { color: colors.mutedForeground }]} numberOfLines={1}>
              {replyTo.media_type ? `📎 ${replyTo.media_type}` : replyTo.content}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}><Feather name="x" size={16} color={colors.mutedForeground} /></Pressable>
        </View>
      )}

      {/* AI suggestions */}
      {aiSuggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.aiSuggestions, { borderTopColor: colors.border }]}>
          <View style={[styles.aiTag, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="zap" size={11} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>AI</Text>
          </View>
          {aiSuggestions.map((s, i) => (
            <Pressable key={i} onPress={() => { handleSend(s); setAiSuggestions([]); }}
              style={[styles.aiChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setAiSuggestions([])} style={[styles.aiChip, { backgroundColor: colors.secondary }]}>
            <Feather name="x" size={13} color={colors.mutedForeground} />
          </Pressable>
        </ScrollView>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 4, backgroundColor: colors.background }]}>
        <Pressable onPress={() => setShowMediaMenu(true)} style={styles.inputAction}>
          <Feather name="plus-circle" size={24} color={colors.primary} />
        </Pressable>
        <TextInput
          style={[styles.inputField, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
          placeholder="Message..." placeholderTextColor={colors.mutedForeground}
          value={text} onChangeText={t => { setText(t); if (!t) setAiSuggestions([]); }}
          multiline
        />
        {text.length === 0 ? (
          <>
            <Pressable onPress={getAISuggestions} disabled={loadingAI} style={styles.inputAction}>
              {loadingAI ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="zap" size={22} color={colors.primary} />}
            </Pressable>
            <Pressable
              onLongPress={startRecording}
              onPressOut={() => isRecording && stopRecording(true)}
              delayLongPress={200}
              style={[styles.inputAction, isRecording && { backgroundColor: "#ef444422", borderRadius: 20 }]}
            >
              <Animated.View style={{ transform: [{ scale: isRecording ? recordAnim : 1 }] }}>
                <Feather name="mic" size={22} color={isRecording ? "#ef4444" : colors.primary} />
              </Animated.View>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => handleSend()} disabled={sending || !text.trim()} style={styles.sendBtn}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
          </Pressable>
        )}
      </View>

      {/* Media menu */}
      <Modal visible={showMediaMenu} transparent animationType="slide" onRequestClose={() => setShowMediaMenu(false)}>
        <Pressable style={styles.mediaMenuOverlay} onPress={() => setShowMediaMenu(false)}>
          <View style={[styles.mediaMenu, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.mediaMenuHandle} />
            <Text style={[styles.mediaMenuTitle, { color: colors.foreground }]}>Share</Text>
            {[
              { icon: "image" as const, label: "Photo / Video", color: "#7c3aed", onPress: pickImage },
              { icon: "mic" as const, label: "Voice Message", color: "#ef4444", onPress: async () => { setShowMediaMenu(false); await startRecording(); } },
            ].map(item => (
              <Pressable key={item.label} onPress={item.onPress}
                style={[styles.mediaMenuItem, { borderBottomColor: colors.border }]}>
                <LinearGradient colors={[item.color, item.color + "cc"]} style={styles.mediaMenuIcon}>
                  <Feather name={item.icon} size={20} color="#fff" />
                </LinearGradient>
                <Text style={[styles.mediaMenuLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chatHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  chatHeaderName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  chatHeaderStatus: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 2 },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "75%", borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, gap: 4 },
  bubbleMine: { backgroundColor: "#7c3aed", borderBottomRightRadius: 4 },
  bubbleOther: { borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 10, alignSelf: "flex-end" },
  replyPreview: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, marginBottom: 4, borderRadius: 4, gap: 2 },
  deletedBubble: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  deletedText: { fontSize: 13, fontStyle: "italic" },
  msgImage: { width: 210, height: 210, borderRadius: 12 },
  msgVideo: { width: 210, height: 160, borderRadius: 12, overflow: "hidden" },
  audioBubble: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, minWidth: 180 },
  audioPlayBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  audioWaveform: { height: 4, borderRadius: 2, width: "100%" },
  audioProgress: { height: "100%", borderRadius: 2 },
  fileBubble: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, minWidth: 140 },
  sharedPost: { borderRadius: 12, borderWidth: 1, padding: 10, maxWidth: 210 },
  sharedPostImg: { width: "100%", height: 120, borderRadius: 8 },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 6 },
  emptyChatText: { fontSize: 16 },
  recordingBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  replyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  replyBarLine: { width: 3, height: "100%", borderRadius: 2 },
  replyBarLabel: { fontSize: 12, fontWeight: "700" },
  replyBarContent: { fontSize: 13 },
  aiSuggestions: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  aiTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16 },
  aiChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 8, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  inputAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inputField: { flex: 1, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
  mediaMenuOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  mediaMenu: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  mediaMenuHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#71717a", alignSelf: "center", marginBottom: 14 },
  mediaMenuTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  mediaMenuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  mediaMenuIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  mediaMenuLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
});
