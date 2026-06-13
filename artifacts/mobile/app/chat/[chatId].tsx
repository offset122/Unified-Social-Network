import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Pressable, Alert, Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetChatMessages,
  getGetChatMessagesQueryKey,
  useSendMessage,
  useGetUserPublicKey,
  getGetUserPublicKeyQueryKey,
  useRegisterPublicKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth";
import {
  isE2ESupported,
  getOrCreateKeyPair,
  getSharedKey,
  encryptMessage,
  decryptMessage,
  isEncrypted,
} from "@/lib/e2e-crypto";

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string; peerId?: string; peerName?: string; peerAvatar?: string }>();
  const params = useLocalSearchParams<{ peerId?: string; peerName?: string; peerAvatar?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [text, setText] = useState("");
  const [e2eReady, setE2eReady] = useState(false);
  const [e2eEnabled, setE2eEnabled] = useState(false);
  const sharedKeyRef = useRef<CryptoKey | null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});

  const { data: page, isLoading } = useGetChatMessages(
    chatId as string,
    undefined,
    { query: { enabled: !!chatId, queryKey: getGetChatMessagesQueryKey(chatId as string) } },
  );

  const { data: peerKeyData } = useGetUserPublicKey(
    params.peerId ?? "",
    { query: { enabled: !!params.peerId, queryKey: getGetUserPublicKeyQueryKey(params.peerId ?? "") } },
  );

  const sendMessage = useSendMessage();
  const registerPublicKey = useRegisterPublicKey();

  // Set up E2E encryption
  useEffect(() => {
    if (!isE2ESupported() || !user?.id) return;
    getOrCreateKeyPair().then(async (result) => {
      if (!result) return;
      registerPublicKey.mutate({ data: { publicKey: result.publicKeyJwk } });
      setE2eReady(true);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!e2eReady || !peerKeyData?.publicKey || !params.peerId) return;
    getSharedKey(peerKeyData.publicKey, `${user?.id}:${params.peerId}`).then((key) => {
      if (key) {
        sharedKeyRef.current = key;
        setE2eEnabled(true);
      }
    });
  }, [e2eReady, peerKeyData?.publicKey, params.peerId]);

  // Decrypt messages as they come in
  useEffect(() => {
    if (!sharedKeyRef.current) return;
    const messages = page?.items ?? [];
    const toDecrypt = messages.filter((m) => isEncrypted(m.content) && !decryptedMessages[m.id]);
    if (toDecrypt.length === 0) return;
    Promise.all(
      toDecrypt.map(async (m) => ({
        id: m.id,
        text: await decryptMessage(sharedKeyRef.current!, m.content),
      })),
    ).then((results) => {
      setDecryptedMessages((prev) => {
        const updated = { ...prev };
        results.forEach(({ id, text }) => { updated[id] = text; });
        return updated;
      });
    });
  }, [page?.items, e2eEnabled]);

  // Socket setup
  useEffect(() => {
    let active = true;
    const setupSocket = async () => {
      const socket = await getSocket();
      if (!socket || !active || !chatId) return;
      socket.emit("join_chat", chatId);
      if (user?.id) socket.emit("join", user.id);
      socket.on("new_message", () => {
        queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey(chatId) });
      });

      // Incoming call notification
      socket.on("call:incoming", ({ from, fromName, chatId: incomingChatId, offer, callType }: {
        from: string; fromName: string; chatId: string; offer: unknown; callType: string;
      }) => {
        if (!active) return;
        Alert.alert(
          `📞 Incoming ${callType} call`,
          `${fromName} is calling you`,
          [
            { text: "Decline", style: "destructive", onPress: async () => {
              const s = await getSocket();
              s?.emit("call:reject", { to: from });
            }},
            { text: "Accept", onPress: () => {
              router.push({
                pathname: `/call/${incomingChatId}` as any,
                params: {
                  fromId: from, toName: fromName, callType,
                  isIncoming: "true",
                  offer: offer ? JSON.stringify(offer) : "",
                },
              });
            }},
          ],
        );
      });
    };
    setupSocket();
    return () => { active = false; };
  }, [chatId, queryClient, user?.id]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !chatId) return;
    let content = text.trim();
    if (e2eEnabled && sharedKeyRef.current) {
      content = await encryptMessage(sharedKeyRef.current, content);
    }
    sendMessage.mutate(
      { chatId: chatId as string, data: { content } },
      {
        onSuccess: () => {
          setText("");
          queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey(chatId) });
        },
      },
    );
  }, [text, chatId, e2eEnabled, sendMessage, queryClient]);

  const startCall = (callType: "audio" | "video") => {
    if (!params.peerId) {
      Alert.alert("Unable to call", "Could not identify the other user.");
      return;
    }
    router.push({
      pathname: `/call/${chatId}` as any,
      params: { toId: params.peerId, toName: params.peerName ?? "User", callType, isIncoming: "false" },
    });
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
      <Stack.Screen
        options={{
          title: params.peerName ?? "Chat",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 12, paddingRight: 4 }}>
              {e2eEnabled && (
                <Feather name="lock" size={14} color="#22c55e" style={{ alignSelf: "center" }} />
              )}
              <Pressable onPress={() => startCall("audio")} hitSlop={8}>
                <Feather name="phone" size={22} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => startCall("video")} hitSlop={8}>
                <Feather name="video" size={22} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />

      <FlatList
        data={[...messages].reverse()}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const isMe = item.senderId === user?.id;
          const displayText = decryptedMessages[item.id] ?? (isEncrypted(item.content) ? "🔒 decrypting…" : item.content);
          const wasEncrypted = isEncrypted(item.content);
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
                {displayText}
              </Text>
              {wasEncrypted && (
                <View style={styles.encRow}>
                  <Feather name="lock" size={9} color={isMe ? "rgba(255,255,255,0.6)" : colors.mutedForeground} />
                  <Text style={[styles.encLabel, { color: isMe ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>
                    encrypted
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      />

      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={90}>
        <View
          style={[
            styles.inputContainer,
            { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background },
          ]}
        >
          {e2eEnabled && (
            <View style={styles.e2eBadge}>
              <Feather name="lock" size={10} color="#22c55e" />
              <Text style={styles.e2eBadgeText}>E2E</Text>
            </View>
          )}
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary }]}
            placeholder={e2eEnabled ? "Encrypted message…" : "Message…"}
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable onPress={handleSend} disabled={!text.trim() || sendMessage.isPending} style={styles.sendBtn}>
            {sendMessage.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={{ color: text.trim() ? colors.primary : colors.mutedForeground, fontWeight: "600" }}>
                Send
              </Text>
            )}
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
  encRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  encLabel: { fontSize: 9 },
  inputContainer: {
    flexDirection: "row", padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth, alignItems: "center",
  },
  e2eBadge: {
    flexDirection: "row", alignItems: "center", gap: 2,
    marginRight: 6, backgroundColor: "#dcfce7",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  e2eBadgeText: { fontSize: 10, color: "#16a34a", fontWeight: "700" },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 16, marginRight: 8,
  },
  sendBtn: { padding: 8 },
});
