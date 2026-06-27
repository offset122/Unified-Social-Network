import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
  ScrollView, Alert, Clipboard,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chatWithAI } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

type Role = "user" | "assistant" | "system";
type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  typing?: boolean;
};

const QUICK_PROMPTS = [
  { icon: "image", label: "Caption idea", prompt: "Give me a creative caption idea for a social media post about my day" },
  { icon: "hash", label: "Hashtag help", prompt: "Generate the best hashtags for a lifestyle and travel post" },
  { icon: "trending-up", label: "Grow my account", prompt: "Give me 5 actionable tips to grow my social media following fast" },
  { icon: "edit-2", label: "Write my bio", prompt: "Help me write a catchy social media bio for a lifestyle creator" },
  { icon: "film", label: "Reel idea", prompt: "Suggest a viral reel idea that I can film with just my phone" },
  { icon: "heart", label: "Engagement tips", prompt: "How do I get more comments and likes on my posts?" },
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hey! 👋 I'm your AI assistant. I can help with captions, hashtags, post ideas, bio writing, and anything else for your social media. What can I help you with?",
  timestamp: Date.now(),
};

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 150);
    const a3 = anim(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.dots}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View key={i} style={[styles.dot, { transform: [{ translateY: d }] }]} />
      ))}
    </View>
  );
}

function MessageBubble({ item, onCopy }: { item: ChatMessage; onCopy: (text: string) => void }) {
  const colors = useColors();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  const isUser = item.role === "user";

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (item.typing) {
    return (
      <Animated.View style={[styles.msgRow, styles.msgRowAI, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.aiAvatar}>
          <Feather name="zap" size={13} color="#fff" />
        </LinearGradient>
        <View style={[styles.bubble, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }]}>
          <TypingDots />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[
      styles.msgRow,
      isUser ? styles.msgRowUser : styles.msgRowAI,
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
    ]}>
      {!isUser && (
        <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.aiAvatar}>
          <Feather name="zap" size={13} color="#fff" />
        </LinearGradient>
      )}
      <Pressable
        onLongPress={() => onCopy(item.content)}
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
          { maxWidth: "78%" },
        ]}
      >
        <Text style={[styles.bubbleText, { color: isUser ? "#fff" : colors.foreground }]}>
          {item.content}
        </Text>
        <Text style={[styles.msgTime, { color: isUser ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>
          {time}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function AIChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const flatRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const headerScale = useRef(new Animated.Value(0.95)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(headerScale, { toValue: 1, friction: 7, useNativeDriver: true }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    if (params.prompt) {
      setTimeout(() => sendMessage(params.prompt!), 600);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  useEffect(() => {
    if (messages.length > 1) scrollToBottom();
  }, [messages.length]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const typingMsg: ChatMessage = {
      id: "typing",
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      typing: true,
    };

    setMessages(prev => [...prev, userMsg, typingMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg]
        .filter(m => m.id !== "welcome" && !m.typing)
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const reply = await chatWithAI(history);

      setMessages(prev => [
        ...prev.filter(m => m.id !== "typing"),
        { id: Date.now().toString() + "r", role: "assistant", content: reply, timestamp: Date.now() },
      ]);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== "typing"));
    } finally {
      setLoading(false);
    }
  };

  const send = () => sendMessage(input);

  const handleCopy = (text: string) => {
    if (Clipboard?.setString) {
      Clipboard.setString(text);
    }
    Alert.alert("Copied!", "", [{ text: "OK" }]);
  };

  const clearHistory = () => {
    Alert.alert("Clear chat?", "This will remove all messages.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => setMessages([WELCOME]) },
    ]);
  };

  const allItems = messages as (ChatMessage | { id: string; type: "prompts" })[];

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <Animated.View style={[
        styles.header,
        { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.background },
        { opacity: headerOpacity, transform: [{ scale: headerScale }] },
      ]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>

        <LinearGradient colors={["#a855f7", "#7c3aed", "#4f46e5"]} style={styles.headerAvatar}>
          <Feather name="zap" size={18} color="#fff" />
        </LinearGradient>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.foreground }]}>AI Assistant</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Always available</Text>
          </View>
        </View>

        <Pressable onPress={clearHistory} hitSlop={8} style={styles.clearBtn}>
          <Feather name="trash-2" size={17} color={colors.mutedForeground} />
        </Pressable>
      </Animated.View>

      {/* Quick prompts banner — only when conversation is fresh */}
      {messages.length <= 1 && (
        <View style={[styles.quickBanner, { borderBottomColor: colors.border }]}>
          <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>Quick actions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
            {QUICK_PROMPTS.map(q => (
              <Pressable
                key={q.label}
                onPress={() => sendMessage(q.prompt)}
                style={[styles.quickChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                <Feather name={q.icon as any} size={13} color={colors.primary} />
                <Text style={[styles.quickChipText, { color: colors.foreground }]}>{q.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: 16 }]}
        renderItem={({ item }) => (
          <MessageBubble item={item} onCopy={handleCopy} />
        )}
      />

      {/* Suggested follow-ups when AI just replied */}
      {!loading && messages.length > 2 && messages[messages.length - 1]?.role === "assistant" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.followUpRow, { borderTopColor: colors.border }]}
        >
          {["Tell me more", "Give examples", "Make it shorter", "Any other tips?"].map(s => (
            <Pressable
              key={s}
              onPress={() => sendMessage(s)}
              style={[styles.followUpChip, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "11" }]}
            >
              <Text style={[styles.followUpText, { color: colors.primary }]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Input bar */}
      <View style={[
        styles.inputBar,
        { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
      ]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
          placeholder="Ask me anything…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          multiline
          returnKeyType="send"
          onSubmitEditing={send}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={send}
          disabled={loading || !input.trim()}
          style={styles.sendBtn}
        >
          <LinearGradient
            colors={input.trim() && !loading ? ["#a855f7", "#7c3aed"] : [colors.muted, colors.muted]}
            style={styles.sendGrad}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="send" size={15} color="#fff" />}
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  headerName: { fontSize: 16, fontWeight: "700" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" },
  onlineText: { color: "#22c55e", fontSize: 12, fontWeight: "600" },
  clearBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  quickBanner: { borderBottomWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingBottom: 4 },
  quickLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7, paddingHorizontal: 16, marginBottom: 8 },
  quickRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  quickChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  quickChipText: { fontSize: 13, fontWeight: "500" },
  list: { padding: 14, gap: 10 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAI: { justifyContent: "flex-start" },
  aiAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  msgTime: { fontSize: 10, alignSelf: "flex-end" },
  dots: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#7c3aed" },
  followUpRow: {
    paddingHorizontal: 14, paddingVertical: 8, gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  followUpChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  followUpText: { fontSize: 13, fontWeight: "600" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1, borderWidth: 1, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 120,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, overflow: "hidden" },
  sendGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});
