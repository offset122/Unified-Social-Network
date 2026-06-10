import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useCreatePost, getGetFeedQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

const MAX_CHARS = 500;

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function CreateScreen() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [content, setContent] = useState("");
  const qc = useQueryClient();
  const createPost = useCreatePost();

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const remaining = MAX_CHARS - content.length;
  const canPost = content.trim().length > 0 && remaining >= 0;

  const handlePost = () => {
    if (!canPost || createPost.isPending) return;
    createPost.mutate(
      { data: { content: content.trim() } },
      {
        onSuccess: () => {
          setContent("");
          qc.invalidateQueries({ queryKey: getGetFeedQueryKey() });
          router.replace("/(tabs)");
        },
        onError: () => {
          Alert.alert("Error", "Failed to create post. Please try again.");
        },
      },
    );
  };

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "You";

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.cancelBtn]}>
          <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>New Post</Text>
        <Pressable
          onPress={handlePost}
          disabled={!canPost || createPost.isPending}
          style={[
            styles.postBtn,
            { backgroundColor: canPost ? colors.primary : colors.muted },
          ]}
        >
          {createPost.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={[styles.postBtnText, { color: canPost ? "#fff" : colors.mutedForeground }]}>Post</Text>
          }
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.body}>
            <Avatar name={displayName} size={44} />
            <View style={styles.inputArea}>
              <Text style={[styles.authorName, { color: colors.foreground }]}>{displayName}</Text>
              <TextInput
                style={[styles.textInput, { color: colors.foreground }]}
                placeholder="What's on your mind?"
                placeholderTextColor={colors.mutedForeground}
                value={content}
                onChangeText={setContent}
                multiline
                autoFocus
                maxLength={MAX_CHARS + 1}
                textAlignVertical="top"
              />
            </View>
          </View>

          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              <Pressable style={styles.toolbarBtn} hitSlop={8}>
                <Feather name="image" size={22} color={colors.primary} />
              </Pressable>
              <Pressable style={styles.toolbarBtn} hitSlop={8}>
                <Feather name="at-sign" size={22} color={colors.primary} />
              </Pressable>
              <Pressable style={styles.toolbarBtn} hitSlop={8}>
                <Feather name="hash" size={22} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.charCountWrap}>
              {remaining <= 50 && (
                <Text style={[styles.charCount, { color: remaining < 0 ? colors.destructive : colors.mutedForeground }]}>
                  {remaining}
                </Text>
              )}
              <View
                style={[
                  styles.charRing,
                  {
                    borderColor: remaining < 0 ? colors.destructive : remaining < 50 ? "#f59e0b" : colors.primary,
                    opacity: content.length === 0 ? 0.3 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.charRingFill,
                    {
                      width: `${Math.min(100, (content.length / MAX_CHARS) * 100)}%` as unknown as number,
                      backgroundColor: remaining < 0 ? colors.destructive : colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  cancelBtn: { paddingVertical: 6, paddingRight: 12 },
  cancelText: { fontSize: 15 },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, minWidth: 60, alignItems: "center" },
  postBtnText: { fontWeight: "700", fontSize: 15 },
  body: { flexDirection: "row", padding: 16, gap: 12 },
  inputArea: { flex: 1 },
  authorName: { fontWeight: "600", fontSize: 15, marginBottom: 6 },
  textInput: { fontSize: 17, lineHeight: 25, minHeight: 120 },
  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarLeft: { flexDirection: "row", gap: 4 },
  toolbarBtn: { padding: 8 },
  charCountWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  charCount: { fontSize: 13 },
  charRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, overflow: "hidden", justifyContent: "center" },
  charRingFill: { height: 2, alignSelf: "flex-start" },
});
