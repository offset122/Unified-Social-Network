import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Image, FlatList, TextInput, Alert,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import {
  fetchComments, createComment, likePost, unlikePost, savePost, unsavePost,
  resolveMediaUrl, timeAgo, formatCount, type Comment, type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";

async function fetchPost(postId: string) {
  const { data } = await supabase
    .from("posts")
    .select("*, profiles(*)")
    .eq("id", postId)
    .single();
  return data;
}

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => fetchPost(postId as string),
    enabled: !!postId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["post-comments", postId],
    queryFn: () => fetchComments(postId as string),
    enabled: !!postId,
  });

  React.useEffect(() => {
    if (post && user?.id) {
      supabase.from("likes").select("user_id").eq("user_id", user.id).eq("post_id", post.id).maybeSingle()
        .then(({ data }) => setIsLiked(!!data));
      supabase.from("saves").select("user_id").eq("user_id", user.id).eq("post_id", post.id).maybeSingle()
        .then(({ data }) => setIsSaved(!!data));
    }
  }, [post?.id, user?.id]);

  const handleLike = async () => {
    if (!user?.id || !post) return;
    const next = !isLiked; setIsLiked(next);
    const fn = next ? likePost : unlikePost;
    await fn(user.id, post.id);
    qc.invalidateQueries({ queryKey: ["post", postId] });
  };

  const handleSave = async () => {
    if (!user?.id || !post) return;
    const next = !isSaved; setIsSaved(next);
    const fn = next ? savePost : unsavePost;
    await fn(user.id, post.id);
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user?.id || !post) return;
    setSubmitting(true);
    try {
      await createComment(post.id, user.id, commentText.trim());
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["post-comments", postId] });
      qc.invalidateQueries({ queryKey: ["post", postId] });
    } finally { setSubmitting(false); }
  };

  if (postLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color="#7c3aed" /></View>;
  if (!post) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><Text style={{ color: colors.mutedForeground }}>Post not found</Text></View>;

  const profile = post.profiles as Profile | undefined;
  const mediaUrls = (post.media_urls ?? []).map(resolveMediaUrl).filter(Boolean);
  const isVideo = post.media_type === "video";
  const aspectRatio = post.media_width && post.media_height ? post.media_width / post.media_height : 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Post</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {/* Author */}
        <View style={styles.authorRow}>
          <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={42} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.authorName, { color: colors.foreground }]}>{profile?.display_name ?? "User"}</Text>
            <Text style={[styles.authorMeta, { color: colors.mutedForeground }]}>@{profile?.username} · {timeAgo(post.created_at)}</Text>
          </View>
        </View>

        {post.content && <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>}

        {/* Media */}
        {mediaUrls.length > 0 && (
          <View style={[styles.media, { aspectRatio: Math.min(Math.max(aspectRatio, 0.5), 2) }]}>
            {isVideo ? (
              <Video source={{ uri: mediaUrls[0] }} style={StyleSheet.absoluteFill}
                resizeMode={ResizeMode.CONTAIN} shouldPlay={false} useNativeControls isLooping />
            ) : (
              <Image source={{ uri: mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            )}
          </View>
        )}

        {/* Actions */}
        <View style={[styles.actions, { borderColor: colors.border }]}>
          <Pressable onPress={handleLike} style={styles.actionBtn}>
            <Feather name="heart" size={22} color={isLiked ? "#ef4444" : colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{formatCount(post.likes_count ?? 0)}</Text>
          </Pressable>
          <View style={styles.actionBtn}>
            <Feather name="message-circle" size={22} color={colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{formatCount(post.comments_count ?? 0)}</Text>
          </View>
          <Pressable style={styles.actionBtn}>
            <Feather name="share-2" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={handleSave} style={{ marginLeft: "auto" }}>
            <Feather name="bookmark" size={22} color={isSaved ? colors.primary : colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Comments */}
        <View style={[styles.commentsSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.commentsTitle, { color: colors.foreground }]}>Comments</Text>
          {(comments as Comment[]).map(c => {
            const cp = c.profiles as Profile | undefined;
            return (
              <View key={c.id} style={styles.commentRow}>
                <Avatar name={cp?.display_name ?? "U"} avatarUrl={cp?.avatar_url} size={32} />
                <View style={[styles.commentBubble, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.commentAuthor, { color: colors.primary }]}>{cp?.username ?? "user"}</Text>
                  <Text style={[styles.commentText, { color: colors.foreground }]}>{c.content}</Text>
                  <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(c.created_at)}</Text>
                </View>
              </View>
            );
          })}
          {(comments as Comment[]).length === 0 && (
            <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }}>No comments yet</Text>
          )}
        </View>
      </ScrollView>

      {/* Comment input */}
      <View style={[styles.commentInputBar, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 4 }]}>
        <TextInput
          style={[styles.commentInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
          placeholder="Add a comment..." placeholderTextColor={colors.mutedForeground}
          value={commentText} onChangeText={setCommentText}
        />
        <Pressable onPress={submitComment} disabled={submitting || !commentText.trim()}
          style={[styles.sendBtn, { backgroundColor: commentText.trim() ? "#7c3aed" : colors.muted }]}>
          {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={15} color="#fff" />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
  authorRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  authorName: { fontSize: 15, fontWeight: "700" },
  authorMeta: { fontSize: 12, marginTop: 1 },
  content: { paddingHorizontal: 14, paddingBottom: 12, fontSize: 16, lineHeight: 24 },
  media: { width: "100%", backgroundColor: "#000" },
  actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginRight: 18 },
  actionCount: { fontSize: 13, fontWeight: "600" },
  commentsSection: { paddingHorizontal: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  commentsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 14 },
  commentRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  commentBubble: { flex: 1, borderRadius: 14, padding: 10 },
  commentAuthor: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentTime: { fontSize: 11, marginTop: 4 },
  commentInputBar: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  commentInput: { flex: 1, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
