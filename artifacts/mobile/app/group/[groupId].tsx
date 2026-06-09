import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, Pressable } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetGroup,
  getGetGroupQueryKey,
  useGetGroupMessages,
  getGetGroupMessagesQueryKey,
  useSendGroupMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth";

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const { data: group } = useGetGroup(
    groupId as string,
    { query: { enabled: !!groupId, queryKey: getGetGroupQueryKey(groupId as string) } },
  );
  const { data: page, isLoading } = useGetGroupMessages(
    groupId as string,
    undefined,
    { query: { enabled: !!groupId, queryKey: getGetGroupMessagesQueryKey(groupId as string) } },
  );
  const sendMessage = useSendGroupMessage();

  useEffect(() => {
    let active = true;
    const setupSocket = async () => {
      const socket = await getSocket();
      if (!socket || !active || !groupId) return;
      socket.emit("join_group", groupId);
      socket.on("new_message", () => {
        queryClient.invalidateQueries({ queryKey: getGetGroupMessagesQueryKey(groupId) });
      });
    };
    setupSocket();
    return () => {
      active = false;
    };
  }, [groupId, queryClient]);

  const handleSend = () => {
    if (!text.trim() || !groupId) return;
    sendMessage.mutate(
      { groupId: groupId as string, data: { content: text.trim() } },
      {
        onSuccess: () => {
          setText("");
          queryClient.invalidateQueries({ queryKey: getGetGroupMessagesQueryKey(groupId) });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const messages = page?.items ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: group?.name ?? "Group" }} />
      <FlatList
        data={[...messages].reverse()}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMe = item.senderId === user?.id;
          return (
            <View
              style={[
                styles.bubble,
                isMe
                  ? [styles.bubbleMe, { backgroundColor: colors.primary }]
                  : [styles.bubbleOther, { backgroundColor: colors.secondary }],
              ]}
            >
              {!isMe && (
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>
                  {item.sender?.displayName}
                </Text>
              )}
              <Text style={{ color: isMe ? colors.primaryForeground : colors.secondaryForeground }}>
                {item.content}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={{ padding: 16 }}
      />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={90}>
        <View
          style={[
            styles.inputContainer,
            { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary }]}
            placeholder="Message..."
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable onPress={handleSend} disabled={!text.trim() || sendMessage.isPending} style={styles.sendBtn}>
            <Text style={{ color: text.trim() ? colors.primary : colors.mutedForeground, fontWeight: "600" }}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubble: { padding: 12, borderRadius: 16, maxWidth: "80%", marginBottom: 8 },
  bubbleMe: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleOther: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  inputContainer: { flexDirection: "row", padding: 12, borderTopWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, marginRight: 8 },
  sendBtn: { padding: 8 },
});
