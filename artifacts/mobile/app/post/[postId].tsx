import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, Pressable } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import {
  useGetPost,
  getGetPostQueryKey,
  useGetComments,
  getGetCommentsQueryKey,
  useCreateComment,
} from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");

  const { data: post, isLoading: isPostLoading } = useGetPost(
    postId as string,
    { query: { enabled: !!postId, queryKey: getGetPostQueryKey(postId as string) } },
  );
  const { data: commentsPage } = useGetComments(
    postId as string,
    undefined,
    { query: { enabled: !!postId, queryKey: getGetCommentsQueryKey(postId as string) } },
  );
  const createComment = useCreateComment();

  const handleSend = () => {
    if (!commentText.trim() || !postId) return;
    createComment.mutate(
      { postId: postId as string, data: { content: commentText.trim() } },
      {
        onSuccess: () => {
          setCommentText("");
          queryClient.invalidateQueries({ queryKey: getGetCommentsQueryKey(postId) });
        },
      },
    );
  };

  if (isPostLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!post) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Post not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Post" }} />
      <FlatList
        data={commentsPage?.items ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={[styles.postContainer, { borderBottomColor: colors.border }]}>
            <Text style={[styles.author, { color: colors.foreground }]}>{post.author.displayName}</Text>
            <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.commentCard, { borderBottomColor: colors.border }]}>
            <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{item.author.displayName}</Text>
            <Text style={[styles.commentContent, { color: colors.foreground }]}>{item.content}</Text>
          </View>
        )}
      />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={90}>
        <View style={[styles.inputContainer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary }]}
            placeholder="Add a comment..."
            placeholderTextColor={colors.mutedForeground}
            value={commentText}
            onChangeText={setCommentText}
          />
          <Pressable
            onPress={handleSend}
            disabled={!commentText.trim() || createComment.isPending}
            style={styles.sendButton}
          >
            <Text style={{ color: !commentText.trim() ? colors.mutedForeground : colors.primary, fontWeight: "600" }}>
              Post
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  postContainer: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  author: { fontWeight: "bold", fontSize: 16, marginBottom: 8 },
  content: { fontSize: 16, lineHeight: 24 },
  commentCard: { padding: 16, paddingLeft: 32, borderBottomWidth: StyleSheet.hairlineWidth },
  commentAuthor: { fontWeight: "600", marginBottom: 4 },
  commentContent: { fontSize: 15 },
  inputContainer: { flexDirection: "row", padding: 12, borderTopWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, marginRight: 12 },
  sendButton: { padding: 8 },
});
