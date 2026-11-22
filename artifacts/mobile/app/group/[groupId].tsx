import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  deleteMessage,
  fetchConversationMembers,
  fetchMessages,
  markConversationRead,
  sendMessage,
  timeAgo,
  type Message,
  type Profile,
} from "@/lib/db";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { ActionSheet, PromptSheet } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { RADIUS } from "@/constants/colors";

function MembersSheet({
  visible,
  onClose,
  members,
  groupName,
  isAdmin,
  onLeave,
  onRename,
}: {
  visible: boolean;
  onClose: () => void;
  members: Profile[];
  groupName: string;
  isAdmin: boolean;
  onLeave: () => void;
  onRename: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            paddingTop: Platform.OS === "web" ? 16 : insets.top + 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.separator,
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            Group Info
          </Text>
          <Pressable
            onPress={onClose}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel="Close group info"
          >
            <Feather name="x" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + 40,
            maxWidth: 640,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <LinearGradient
              colors={[colors.accentPrimary, "#8B5CF6"]}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Feather name="users" size={30} color="#FFFFFF" />
            </LinearGradient>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 20,
                fontWeight: "700",
              }}
            >
              {groupName}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                marginTop: 4,
                fontVariant: ["tabular-nums"],
              }}
            >
              {members.length} member{members.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 11.5,
              fontWeight: "700",
              letterSpacing: 0.8,
              paddingHorizontal: 20,
              marginBottom: 8,
            }}
          >
            MEMBERS
          </Text>
          {members.map((m) => (
            <View
              key={m.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            >
              <Avatar
                name={m.display_name}
                avatarUrl={m.avatar_url}
                size={40}
                canvasColor={colors.bgCanvas}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                  {m.display_name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  @{m.username}
                </Text>
              </View>
            </View>
          ))}
          <View style={{ marginTop: 24, paddingHorizontal: 20, gap: 10 }}>
            {isAdmin && (
              <Pressable
                onPress={onRename}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  height: 48,
                  borderRadius: RADIUS.md,
                  backgroundColor: colors.bgElevated,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.separator,
                }}
              >
                <Feather name="edit-2" size={16} color={colors.accentPrimary} />
                <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                  Rename Group
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onLeave}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 14,
                height: 48,
                borderRadius: RADIUS.md,
                backgroundColor: "rgba(225,29,72,0.10)",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: "rgba(225,29,72,0.28)",
              }}
            >
              <Feather name="log-out" size={16} color={colors.semanticDanger} />
              <Text
                style={{ color: colors.semanticDanger, fontWeight: "600" }}
              >
                Leave Group
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MessageBubble({
  msg,
  isMine,
  showAvatar,
  isGrouped,
  onLongPress,
}: {
  msg: Message;
  isMine: boolean;
  showAvatar: boolean;
  isGrouped: boolean;
  onLongPress: (m: Message) => void;
}) {
  const colors = useColors();
  const profile = msg.profiles as Profile | undefined;

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
          <Text
            style={{
              fontSize: 13,
              color: colors.textTertiary,
              fontStyle: "italic",
            }}
          >
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
      <View style={{ maxWidth: "76%" }}>
        <Pressable onLongPress={() => onLongPress(msg)} delayLongPress={280}>
          {!isMine && showAvatar && (
            <Text
              style={{
                color: colors.accentPrimary,
                fontSize: 11.5,
                fontWeight: "700",
                marginBottom: 3,
                marginLeft: 4,
              }}
            >
              {profile?.display_name ?? "User"}
            </Text>
          )}
          {isMine ? (
            <LinearGradient
              colors={[colors.accentPrimary, "#8B5CF6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.bubbleMine]}
            >
              <Text style={{ fontSize: 15, lineHeight: 22, color: "#FFFFFF" }}>
                {msg.content}
              </Text>
              <Text
                style={{
                  fontSize: 10.5,
                  alignSelf: "flex-end",
                  color: "rgba(255,255,255,0.72)",
                  marginTop: 1,
                }}
              >
                {timeAgo(msg.created_at)} ✓✓
              </Text>
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.bubble,
                styles.bubbleOther,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 22,
                  color: colors.textPrimary,
                }}
              >
                {msg.content}
              </Text>
              <Text
                style={{
                  fontSize: 10.5,
                  alignSelf: "flex-end",
                  color: colors.textTertiary,
                  marginTop: 1,
                }}
              >
                {timeAgo(msg.created_at)}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const colors = useColors();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const flatRef = useRef<FlatList>(null);
  const isDesktopWeb = Platform.OS === "web" && width >= 768;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [groupName, setGroupName] = useState("Group");
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<Message | null>(null);

  useEffect(() => {
    if (!groupId) return;
    supabase
      .from("conversations")
      .select("name, created_by")
      .eq("id", groupId)
      .single()
      .then(({ data }) => {
        if (data?.name) setGroupName(data.name);
        if (data?.created_by && data.created_by === user?.id) {
          setIsGroupAdmin(true);
        }
      });
    if (user?.id) {
      supabase
        .from("conversation_members")
        .select("is_admin")
        .eq("conversation_id", groupId)
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.is_admin) setIsGroupAdmin(true);
        });
    }
  }, [groupId, user?.id]);

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
    const ch = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${groupId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["group-messages", groupId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, qc]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
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
      showToast("Failed to send message", "error");
    } finally {
      setSending(false);
    }
  }, [text, groupId, user?.id, qc, showToast]);

  const handleLongPress = (msg: Message) => {
    if (msg.sender_id !== user?.id) return;
    setDeleteMsgTarget(msg);
  };

  const handleRenameSubmit = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("conversations")
      .update({ name: trimmed })
      .eq("id", groupId);
    if (error) {
      showToast("Could not rename group", "error");
      return;
    }
    setGroupName(trimmed);
    showToast("Group renamed", "success");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bgCanvas }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />

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
            onPress={() => setMembersOpen(true)}
            style={styles.headerInfo}
            accessibilityRole="button"
            accessibilityLabel="Open group details"
          >
            <LinearGradient
              colors={[colors.accentPrimary, "#8B5CF6"]}
              style={styles.groupAvatar}
            >
              <Feather name="users" size={18} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.headerName, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {groupName}
              </Text>
              <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                {(members as Profile[]).length} members · tap for info
              </Text>
            </View>
          </Pressable>
        </View>
      </GlassSurface>

      <View
        style={[
          styles.columnWrap,
          { maxWidth: isDesktopWeb ? 720 : undefined },
        ]}
      >
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.accentPrimary} size="large" />
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
              const prevMsg =
                index > 0 ? (messages as Message[])[index - 1] : null;
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
                  onLongPress={handleLongPress}
                />
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <View
                  style={[
                    styles.emptyChatIcon,
                    { backgroundColor: colors.accentTint },
                  ]}
                >
                  <Feather name="users" size={32} color={colors.accentPrimary} />
                </View>
                <Text
                  style={[styles.emptyChatTitle, { color: colors.textPrimary }]}
                >
                  Group ready
                </Text>
                <Text
                  style={[styles.emptyChatSub, { color: colors.textSecondary }]}
                >
                  Say hello to the group
                </Text>
              </View>
            }
          />
        )}

        <GlassSurface
          style={[
            styles.inputBar,
            {
              borderTopColor: colors.separator,
              paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
            },
          ]}
        >
          <TextInput
            style={[
              styles.inputField,
              {
                color: colors.textPrimary,
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
            placeholder="Message group…"
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !text.trim()}
            style={[
              styles.sendBtn,
              {
                backgroundColor: text.trim()
                  ? colors.accentPrimary
                  : colors.muted,
              },
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
        </GlassSurface>
      </View>

      <MembersSheet
        visible={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members as Profile[]}
        groupName={groupName}
        isAdmin={isGroupAdmin}
        onLeave={() => {
          setMembersOpen(false);
          setLeaveConfirmOpen(true);
        }}
        onRename={() => {
          setMembersOpen(false);
          setRenameOpen(true);
        }}
      />

      <PromptSheet
        visible={renameOpen}
        title="Rename Group"
        placeholder="Enter group name"
        initialValue={groupName}
        submitLabel="Rename"
        onClose={() => setRenameOpen(false)}
        onSubmit={handleRenameSubmit}
      />

      <ActionSheet
        visible={leaveConfirmOpen}
        title="Leave Group"
        message="You will stop receiving messages from this group."
        onClose={() => setLeaveConfirmOpen(false)}
        items={[
          {
            id: "confirm-leave",
            label: "Leave Group",
            icon: "log-out",
            destructive: true,
            onPress: async () => {
              if (!user?.id) return;
              await supabase
                .from("conversation_members")
                .delete()
                .eq("conversation_id", groupId)
                .eq("user_id", user.id);
              showToast("Left group", "info");
              router.back();
            },
          },
        ]}
      />

      <ActionSheet
        visible={!!deleteMsgTarget}
        title="Message Options"
        onClose={() => setDeleteMsgTarget(null)}
        items={
          deleteMsgTarget
            ? [
                {
                  id: "delete-msg",
                  label: "Delete Message",
                  icon: "trash-2",
                  destructive: true,
                  onPress: async () => {
                    try {
                      await deleteMessage(deleteMsgTarget.id, user!.id);
                      qc.invalidateQueries({
                        queryKey: ["group-messages", groupId],
                      });
                      showToast("Message deleted", "success");
                    } catch {
                      showToast("Could not delete message", "error");
                    }
                  },
                },
              ]
            : []
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
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
  headerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerName: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  headerSub: { fontSize: 12, marginTop: 1, fontVariant: ["tabular-nums"] },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  messagesList: { padding: 14, paddingBottom: 10, gap: 2 },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },
  msgGrouped: { marginBottom: 2 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 4,
  },
  bubbleMine: { borderBottomRightRadius: 5 },
  bubbleOther: {
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 5,
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
  emptyChatTitle: { fontSize: 18, fontWeight: "700" },
  emptyChatSub: { fontSize: 14 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
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
});
