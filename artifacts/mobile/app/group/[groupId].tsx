import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator,
  Pressable, Alert, Platform, Image, Modal, ScrollView, Animated,
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
import {
  fetchMessages, sendMessage, deleteMessage, markConversationRead,
  fetchConversationMembers, resolveMediaUrl, timeAgo,
  type Message, type Profile,
} from "@/lib/db";

const C = {
  bg: "#0F1117", surface: "#1A1D27", surfaceHigh: "#1E2232", border: "#252836",
  primary: "#6366F1", primaryLight: "#818CF8", text: "#E2E8F0",
  textMuted: "#6B7280", textDim: "#4B5168",
  myBubble1: "#6366F1", myBubble2: "#818CF8", theirBubble: "#1E2232",
  theirBubbleBorder: "#2D3150", red: "#EF4444", green: "#22C55E",
};

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  }
  return (
    <LinearGradient colors={[`hsl(${hue},60%,52%)`, `hsl(${(hue + 40) % 360},70%,38%)`]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}>{initials}</Text>
    </LinearGradient>
  );
}

function MembersSheet({ visible, onClose, members, groupName, isAdmin, onLeave, onRename }:
  { visible: boolean; onClose: () => void; members: Profile[]; groupName: string; isAdmin: boolean; onLeave: () => void; onRename: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: insets.top + 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: "800" }}>Group Info</Text>
          <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={C.text} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <LinearGradient colors={[C.primary, C.primaryLight]} style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Feather name="users" size={32} color="#fff" />
            </LinearGradient>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: "800" }}>{groupName}</Text>
            <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>{members.length} members</Text>
          </View>
          <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 8 }}>MEMBERS</Text>
          {members.map(m => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
              <Avatar name={m.display_name} avatarUrl={m.avatar_url} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "600" }}>{m.display_name}</Text>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>@{m.username}</Text>
              </View>
            </View>
          ))}
          <View style={{ marginTop: 24, paddingHorizontal: 20, gap: 10 }}>
            {isAdmin && (
              <Pressable onPress={onRename} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
                <Feather name="edit-2" size={16} color={C.primary} />
                <Text style={{ color: C.text, fontWeight: "600" }}>Rename Group</Text>
              </Pressable>
            )}
            <Pressable onPress={onLeave} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: "#ef444415", borderWidth: 1, borderColor: "#ef444430" }}>
              <Feather name="log-out" size={16} color={C.red} />
              <Text style={{ color: C.red, fontWeight: "600" }}>Leave Group</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MessageBubble({ msg, isMine, showAvatar, isGrouped, onLongPress }:
  { msg: Message; isMine: boolean; showAvatar: boolean; isGrouped: boolean; onLongPress: (m: Message) => void }) {
  const profile = msg.profiles as Profile | undefined;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  if (msg.is_deleted) {
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther, isGrouped && styles.msgGrouped]}>
        {!isMine && <View style={{ width: 28 }} />}
        <View style={styles.deletedBubble}>
          <Feather name="slash" size={11} color={C.textDim} />
          <Text style={{ fontSize: 13, color: C.textDim, fontStyle: "italic" }}>Message removed</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther, isGrouped && styles.msgGrouped]}>
      {!isMine ? (showAvatar ? <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={28} /> : <View style={{ width: 28 }} />) : null}
      <Animated.View style={{ transform: [{ scale: scaleAnim }], maxWidth: "75%" }}>
        <Pressable onLongPress={() => onLongPress(msg)} onPressIn={onPressIn} onPressOut={onPressOut} delayLongPress={300}>
          {!isMine && showAvatar && (
            <Text style={{ color: C.primaryLight, fontSize: 11, fontWeight: "700", marginBottom: 3, marginLeft: 4 }}>
              {profile?.display_name ?? "User"}
            </Text>
          )}
          {isMine ? (
            <LinearGradient colors={[C.myBubble1, C.myBubble2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.bubbleMine]}>
              <Text style={{ fontSize: 15, lineHeight: 22, color: "#fff" }}>{msg.content}</Text>
              <Text style={{ fontSize: 10, alignSelf: "flex-end", color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                {timeAgo(msg.created_at)} ✓✓
              </Text>
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, styles.bubbleOther]}>
              <Text style={{ fontSize: 15, lineHeight: 22, color: C.text }}>{msg.content}</Text>
              <Text style={{ fontSize: 10, alignSelf: "flex-end", color: C.textDim, marginTop: 1 }}>
                {timeAgo(msg.created_at)}
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [groupName, setGroupName] = useState("Group");

  // Fetch conversation info
  useEffect(() => {
    if (!groupId) return;
    supabase.from("conversations").select("name").eq("id", groupId).single()
      .then(({ data }) => { if (data?.name) setGroupName(data.name); });
  }, [groupId]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["group-messages", groupId],
    queryFn: () => fetchMessages(groupId as string),
    enabled: !!groupId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["group-members", groupId],
    queryFn: () => fetchConversationMembers(groupId as string),
    enabled: !!groupId,
  });

  useEffect(() => {
    if (groupId && user?.id) markConversationRead(groupId as string, user.id);
  }, [groupId, user?.id]);

  useEffect(() => {
    if (!groupId) return;
    const ch = supabase.channel(`group-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${groupId}` }, () => {
        qc.invalidateQueries({ queryKey: ["group-messages", groupId] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [groupId]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || !user?.id) return;
    setSending(true);
    setText("");
    try {
      await sendMessage(groupId as string, user.id, content);
      qc.invalidateQueries({ queryKey: ["group-messages", groupId] });
    } catch {
      setText(content);
      Alert.alert("Error", "Failed to send message");
    } finally { setSending(false); }
  }, [text, groupId, user?.id]);

  const handleLongPress = (msg: Message) => {
    const isMine = msg.sender_id === user?.id;
    if (!isMine) return;
    Alert.alert("Message", undefined, [
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteMessage(msg.id, user!.id); qc.invalidateQueries({ queryKey: ["group-messages", groupId] }); }
        catch { Alert.alert("Error", "Could not delete"); }
      }},
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleLeave = () => {
    Alert.alert("Leave Group", "Are you sure you want to leave this group?", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: async () => {
        if (!user?.id) return;
        await supabase.from("conversation_members").delete().eq("conversation_id", groupId).eq("user_id", user.id);
        router.back();
      }},
    ]);
  };

  const handleRename = () => {
    Alert.prompt?.("Rename Group", "Enter a new group name:", async (newName) => {
      if (!newName?.trim()) return;
      await supabase.from("conversations").update({ name: newName.trim() }).eq("id", groupId);
      setGroupName(newName.trim());
    }, "plain-text", groupName);
  };

  const isAdmin = (members as Profile[]).some(m => m.id === user?.id);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={C.text} />
        </Pressable>
        <Pressable onPress={() => setMembersOpen(true)} style={styles.headerInfo}>
          <LinearGradient colors={[C.primary, C.primaryLight]} style={styles.groupAvatar}>
            <Feather name="users" size={18} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.headerName}>{groupName}</Text>
            <Text style={styles.headerSub}>{(members as Profile[]).length} members · tap for info</Text>
          </View>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingCenter}><ActivityIndicator color={C.primary} size="large" /></View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages as Message[]}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: msg, index }) => {
            const isMine = msg.sender_id === user?.id;
            const prevMsg = index > 0 ? (messages as Message[])[index - 1] : null;
            const showAvatar = !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
            const isGrouped = !!prevMsg && prevMsg.sender_id === msg.sender_id;
            return <MessageBubble msg={msg} isMine={isMine} showAvatar={showAvatar} isGrouped={isGrouped} onLongPress={handleLongPress} />;
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <LinearGradient colors={["rgba(99,102,241,0.2)", "rgba(99,102,241,0.04)"]} style={styles.emptyChatIcon}>
                <Feather name="users" size={34} color={C.primary} />
              </LinearGradient>
              <Text style={styles.emptyChatTitle}>Group created!</Text>
              <Text style={styles.emptyChatSub}>Say hello to the group 👋</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
        <TextInput
          style={styles.inputField}
          placeholder="Message group…"
          placeholderTextColor={C.textDim}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable onPress={handleSend} disabled={sending || !text.trim()} style={styles.sendBtn}>
          <LinearGradient colors={[C.myBubble1, C.myBubble2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendBtnGrad}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={15} color="#fff" />}
          </LinearGradient>
        </Pressable>
      </View>

      <MembersSheet
        visible={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members as Profile[]}
        groupName={groupName}
        isAdmin={isAdmin}
        onLeave={handleLeave}
        onRename={handleRename}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  groupAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerName: { color: C.text, fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  headerSub: { color: C.textMuted, fontSize: 11, marginTop: 1 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  messagesList: { padding: 14, paddingBottom: 10, gap: 2 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 7, marginBottom: 4 },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },
  msgGrouped: { marginBottom: 1 },
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, gap: 4 },
  bubbleMine: { borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: C.theirBubble, borderWidth: 1, borderColor: C.theirBubbleBorder, borderBottomLeftRadius: 5 },
  deletedBubble: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 8 },
  emptyChatIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyChatTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  emptyChatSub: { fontSize: 14, color: C.textDim },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingTop: 10, gap: 4, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  inputField: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, fontSize: 15, color: C.text, backgroundColor: C.surfaceHigh, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  sendBtnGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});
