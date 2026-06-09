import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, Pressable } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetChatMessages,
  getGetChatMessagesQueryKey,
  useSendMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth";

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const { data: page, isLoading } = useGetChatMessages(
    chatId as string,
    undefined,
    { query: { enabled: !!chatId, queryKey: getGetChatMessagesQueryKey(chatId as string) } },
  );

  const sendMessage = useSendMessage();

  useEffect(() => {
    let active = true;
    const setupSocket = async () => {
      const socket = await getSocket();
      if (!socket || !active || !chatId) return;
      socket.emit("join_chat", chatId);
      socket.on("new_message", () => {
        queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey(chatId) });
      });
    };
    setupSocket();
    return () => {
      active = false;
    };
  }, [chatId, queryClient]);

  const handleSend = () => {
    if (!text.trim() || !chatId) return;
    sendMessage.mutate(
      { chatId: chatId as string, data: { content: text.trim() } },
      {
        onSuccess: () => {
          setText("");
          queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey(chatId) });
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
      <Stack.Screen options={{ title: "Chat" }} />
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
