import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chatWithAI } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hey! 👋 I'm your AI assistant. Ask me anything — content ideas, caption help, or just chat!",
};

export default function AIChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (messages.length > 1) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg]
        .filter(m => m.id !== "welcome")
        .map(m => ({ role: m.role, content: m.content }));
      const reply = await chatWithAI(history);
      setMessages(prev => [...prev, { id: Date.now().toString() + "r", role: "assistant", content: reply }]);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
        {!isUser && (
          <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.aiAvatar}>
            <Feather name="zap" size={14} color="#fff" />
          </LinearGradient>
        )}
        <View style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
          { maxWidth: "78%" },
        ]}>
          <Text style={[styles.bubbleText, { color: isUser ? "#fff" : colors.foreground }]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.headerAvatar}>
          <Feather name="zap" size={16} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.foreground }]}>AI Assistant</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Always available</Text>
          </View>
        </View>
        <Pressable onPress={() => setMessages([WELCOME])} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: 12 }]}
        renderItem={renderItem}
        ListFooterComponent={
          loading ? (
            <View style={[styles.msgRow, styles.msgRowAI]}>
              <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.aiAvatar}>
                <Feather name="zap" size={14} color="#fff" />
              </LinearGradient>
              <View style={[styles.bubble, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            </View>
          ) : null
        }
      />

      {/* Input */}
      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
          placeholder="Ask me anything…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          multiline
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable onPress={send} disabled={loading || !input.trim()} style={styles.sendBtn}>
          <LinearGradient
            colors={input.trim() ? ["#7c3aed", "#4f46e5"] : [colors.muted, colors.muted]}
            style={styles.sendGrad}
          >
            <Feather name="send" size={15} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerName: { fontSize: 16, fontWeight: "700" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  onlineText: { color: "#22c55e", fontSize: 11, fontWeight: "600" },
  list: { padding: 14, gap: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAI: { justifyContent: "flex-start" },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  sendGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});
