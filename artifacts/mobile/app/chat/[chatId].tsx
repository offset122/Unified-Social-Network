import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator,
  Pressable, Alert, Platform, Image, ActionSheetIOS, Modal, ScrollView,
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
import * as DocumentPicker from "expo-document-picker";
import {
  fetchMessages, sendMessage, deleteMessage, markConversationRead,
  uploadMedia, resolveMediaUrl, generateAIReplySuggestion, timeAgo,
  type Message, type Profile,
} from "@/lib/db";
import { Video, ResizeMode } from "expo-av";

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setErr(true)} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

function MediaBubble({ msg, isMine, colors }: { msg: Message; isMine: boolean; colors: any }) {
  if (!msg.media_url) return null;
  const uri = resolveMediaUrl(msg.media_url);
  if (msg.media_type === "image") {
    return <Image source={{ uri }} style={styles.msgImage} resizeMode="cover" />;
  }
  if (msg.media_type === "video") {
    return (
      <View style={styles.msgVideo}>
        <Video source={{ uri }} style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER} shouldPlay={false} useNativeControls />
      </View>
    );
  }
  if (msg.media_type === "audio") {
    return (
      <View style={[styles.audioBubble, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : colors.secondary }]}>
        <Feather name="mic" size={18} color={isMine ? "#fff" : colors.primary} />
        <Text style={{ color: isMine ? "#fff" : colors.foreground, fontSize: 13, marginLeft: 8 }}>Audio message</Text>
        <Feather name="play" size={16} color={isMine ? "#fff" : colors.primary} style={{ marginLeft: "auto" }} />
      </View>
    );
  }
  return (
    <View style={[styles.fileBubble, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : colors.secondary }]}>
      <Feather name="file" size={18} color={isMine ? "#fff" : colors.primary} />
      <Text style={{ color: isMine ? "#fff" : colors.foreground, fontSize: 13, marginLeft: 8 }} numberOfLines={1}>
        {msg.media_url.split("/").pop()}
      </Text>
    </View>
  );
}

function MessageBubble({
  msg, isMine, showAvatar, colors, onLongPress,
}: {
  msg: Message; isMine: boolean; showAvatar: boolean; colors: any;
  onLongPress: (msg: Message) => void;
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
      {!isMine && showAvatar ? (
        <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={28} />
      ) : !isMine ? (
        <View style={{ width: 28 }} />
      ) : null}

      <Pressable
        onLongPress={() => onLongPress(msg)}
        style={[styles.bubble, isMine ? styles.bubbleMine : [styles.bubbleOther, { backgroundColor: colors.card, borderColor: colors.border }]]}
      >
        {msg.reply_to_id && (
          <View style={[styles.replyPreview, { borderLeftColor: isMine ? "rgba(255,255,255,0.5)" : colors.primary }]}>
            <Text style={{ color: isMine ? "rgba(255,255,255,0.7)" : colors.mutedForeground, fontSize: 12 }}>Replying to a message</Text>
          </View>
        )}
        <MediaBubble msg={msg} isMine={isMine} colors={colors} />
        {!!msg.content && !msg.is_deleted && (
          <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.foreground }]}>{msg.content}</Text>
        )}
        <Text style={[styles.bubbleTime, { color: isMine ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>
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

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: () => fetchMessages(chatId as string),
    enabled: !!chatId,
    refetchInterval: false,
  });

  // Mark as read when entering
  useEffect(() => {
    if (chatId && user?.id) markConversationRead(chatId as string, user.id);
  }, [chatId, user?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!chatId) return;
    const ch = supabase.channel(`chat-${chatId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "messages",
        filter: `conversation_id=eq.${chatId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async (msgText?: string, opts?: { mediaUrl?: string; mediaType?: string }) => {
    const content = msgText ?? text.trim();
    if (!content && !opts?.mediaUrl) return;
    if (!user?.id) return;

    setSending(true);
    const prev = text;
    setText("");
    setReplyTo(null);
    setAiSuggestions([]);

    try {
      await sendMessage(chatId as string, user.id, content, {
        ...opts,
        replyToId: replyTo?.id,
      });
      qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      setText(prev);
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [text, chatId, user?.id, replyTo]);

  const handleLongPress = (msg: Message) => {
    const isMine = msg.sender_id === user?.id;
    const options = isMine
      ? ["Reply", "Delete", "Cancel"]
      : ["Reply", "Cancel"];
    const destructiveIndex = isMine ? 1 : -1;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: destructiveIndex },
        (i) => {
          if (options[i] === "Reply") setReplyTo(msg);
          if (options[i] === "Delete") handleDelete(msg);
        }
      );
    } else {
      Alert.alert("Message options", undefined, [
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
    } catch {
      Alert.alert("Error", "Could not delete message");
    }
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
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.sender_id === user?.id) return;
    setLoadingAI(true);
    try {
      const suggestions = await generateAIReplySuggestion(lastMsg.content);
      setAiSuggestions(suggestions);
    } finally { setLoadingAI(false); }
  };

  const peerName = params.peerName ?? "Chat";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={[colors.primary, colors.primary + "dd"]}
        style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
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
          contentContainerStyle={{ padding: 12, paddingBottom: 8, gap: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: msg, index }) => {
            const isMine = msg.sender_id === user?.id;
            const prevMsg = index > 0 ? (messages as Message[])[index - 1] : null;
            const showAvatar = !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
            return (
              <MessageBubble msg={msg} isMine={isMine} showAvatar={showAvatar}
                colors={colors} onLongPress={handleLongPress} />
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Feather name="message-circle" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyChatText, { color: colors.mutedForeground }]}>Say hello!</Text>
            </View>
          }
        />
      )}

      {/* Reply preview */}
      {replyTo && (
        <View style={[styles.replyBar, { backgroundColor: colors.secondary, borderTopColor: colors.border }]}>
          <View style={[styles.replyBarLine, { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBarLabel, { color: colors.primary }]}>Replying to {replyTo.profiles ? (replyTo.profiles as Profile).display_name : "message"}</Text>
            <Text style={[styles.replyBarContent, { color: colors.mutedForeground }]} numberOfLines={1}>{replyTo.content}</Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}

      {/* AI suggestions */}
      {aiSuggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.aiSuggestions, { borderTopColor: colors.border }]}>
          {aiSuggestions.map((s, i) => (
            <Pressable key={i} onPress={() => { handleSend(s); setAiSuggestions([]); }}
              style={[styles.aiChip, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
              <Text style={{ color: colors.primary, fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setAiSuggestions([])} style={[styles.aiChip, { backgroundColor: colors.secondary }]}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
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
          <Pressable onPress={getAISuggestions} disabled={loadingAI} style={styles.inputAction}>
            {loadingAI ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="zap" size={22} color={colors.primary} />}
          </Pressable>
        ) : (
          <Pressable onPress={() => handleSend()} disabled={sending || !text.trim()} style={styles.sendBtn}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
          </Pressable>
        )}
      </View>

      {/* Media menu modal */}
      <Modal visible={showMediaMenu} transparent animationType="slide" onRequestClose={() => setShowMediaMenu(false)}>
        <Pressable style={styles.mediaMenuOverlay} onPress={() => setShowMediaMenu(false)}>
          <View style={[styles.mediaMenu, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.mediaMenuTitle, { color: colors.foreground }]}>Share</Text>
            {[
              { icon: "image" as const, label: "Photo / Video", onPress: pickImage },
              { icon: "file" as const, label: "Document", onPress: async () => { setShowMediaMenu(false); /* DocumentPicker would go here */ } },
            ].map(item => (
              <Pressable key={item.label} onPress={item.onPress}
                style={[styles.mediaMenuItem, { borderBottomColor: colors.border }]}>
                <View style={[styles.mediaMenuIcon, { backgroundColor: colors.primary + "22" }]}>
                  <Feather name={item.icon} size={20} color={colors.primary} />
                </View>
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
  bubble: { maxWidth: "72%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, gap: 4 },
  bubbleMine: { backgroundColor: "#7c3aed", borderBottomRightRadius: 4 },
  bubbleOther: { borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 10, alignSelf: "flex-end" },
  replyPreview: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 4 },
  deletedBubble: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  deletedText: { fontSize: 13, fontStyle: "italic" },
  msgImage: { width: 200, height: 200, borderRadius: 12 },
  msgVideo: { width: 200, height: 150, borderRadius: 12, overflow: "hidden" },
  audioBubble: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, minWidth: 140 },
  fileBubble: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, minWidth: 140 },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 10 },
  emptyChatText: { fontSize: 16 },
  replyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  replyBarLine: { width: 3, height: "100%", borderRadius: 2 },
  replyBarLabel: { fontSize: 12, fontWeight: "700" },
  replyBarContent: { fontSize: 13 },
  aiSuggestions: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  aiChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 8, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  inputAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inputField: { flex: 1, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
  mediaMenuOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  mediaMenu: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: StyleSheet.hairlineWidth },
  mediaMenuTitle: { fontSize: 17, fontWeight: "700", marginBottom: 16 },
  mediaMenuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  mediaMenuIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  mediaMenuLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
});
