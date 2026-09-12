import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Image, FlatList, TextInput, Alert, Share, Animated,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import {
  fetchComments, createComment, likePost, unlikePost, savePost, unsavePost, fetchPost,
  incrementPostViews, incrementPostShares, followUser, unfollowUser, isFollowing,
  resolveMediaUrl, timeAgo, formatCount, summarizeAIComments, analyzeAISentiment,
  deletePost, updatePostVisibility, createReport,
  type Comment, type Profile,
} from "@/lib/db";
import AICommentSuggestions from "@/components/ai/AICommentSuggestions";
import { Avatar } from "@/components/Avatar";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

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
  const [followLoading, setFollowLoading] = useState(false);
  const [sharesCount, setSharesCount] = useState(0);
  const [postSummary, setPostSummary] = useState("");
  const [loadingPostSummary, setLoadingPostSummary] = useState(false);
  const [commentSummary, setCommentSummary] = useState("");
  const [loadingCommentSummary, setLoadingCommentSummary] = useState(false);
  const [commentSentiment, setCommentSentiment] = useState<{ label: string; emoji: string } | null>(null);
  const [loadingSentiment, setLoadingSentiment] = useState(false);

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

  // Hydrate like/save from the post row (fetched with viewer flags when available)
  const postRef = post as any;
  React.useEffect(() => {
    if (!post) return;
    if (typeof postRef.is_liked === "boolean") setIsLiked(postRef.is_liked);
    if (typeof postRef.is_saved === "boolean") setIsSaved(postRef.is_saved);
    setSharesCount(post.shares_count ?? 0);
  }, [post?.id]);

  // Live follow state
  const { data: following = false } = useQuery({
    queryKey: ["is-following", user?.id, post?.author_id],
    queryFn: () => isFollowing(user!.id, post!.author_id),
    enabled: !!user?.id && !!post?.author_id && user.id !== post.author_id,
  });
  const isFollowingAuthor = following as boolean;

  // Count a view once per session
  const viewedRef = useRef(false);
  React.useEffect(() => {
    if (post?.id && !viewedRef.current) {
      viewedRef.current = true;
      incrementPostViews(post.id);
    }
  }, [post?.id]);

  const likeScale = useRef(new Animated.Value(1)).current;

  const handleLike = async () => {
    if (!user?.id || !post) return;
    const next = !isLiked; setIsLiked(next);
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.5, useNativeDriver: true, speed: 80, bounciness: 14 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 80 }),
    ]).start();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const fn = next ? likePost : unlikePost;
    await fn(user.id, post.id);
    qc.invalidateQueries({ queryKey: ["post", postId] });
  };

  const handleSave = async () => {
    if (!user?.id || !post) return;
    const next = !isSaved; setIsSaved(next);
    const fn = next ? savePost : unsavePost;
    try { await fn(user.id, post.id); } catch { setIsSaved(!next); }
  };

  const handleFollowToggle = async () => {
    if (!user?.id || !post) return;
    const next = !isFollowingAuthor;
    setFollowLoading(true);
    try {
      if (next) await followUser(user.id, post.author_id);
      else await unfollowUser(user.id, post.author_id);
      qc.invalidateQueries({ queryKey: ["is-following", user.id, post.author_id] });
    } finally {
      setFollowLoading(false);
    }
  };

  const isOwnPost = !!user?.id && post?.author_id === user.id;

  const handleOwnerMenu = () => {
    if (!post || !user?.id) return;
    Alert.alert("Post Options", undefined, [
      {
        text: "Change Visibility",
        onPress: () => {
          Alert.alert("Set Visibility", "Who can see this post?", [
            { text: "Public", onPress: () => changeVisibility("public") },
            { text: "Followers Only", onPress: () => changeVisibility("followers") },
            { text: "Private", onPress: () => changeVisibility("private") },
            { text: "Cancel", style: "cancel" },
          ]);
        },
      },
      {
        text: "Delete Post", style: "destructive",
        onPress: () => {
          Alert.alert("Delete Post", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete", style: "destructive",
              onPress: async () => {
                try {
                  await deletePost(post.id, user.id);
                  qc.invalidateQueries({ queryKey: ["feed"] });
                  qc.invalidateQueries({ queryKey: ["my-posts"] });
                  router.back();
                } catch { Alert.alert("Error", "Could not delete post"); }
              },
            },
          ]);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const changeVisibility = async (v: "public" | "followers" | "private") => {
    if (!post || !user?.id) return;
    try {
      await updatePostVisibility(post.id, user.id, v);
      qc.invalidateQueries({ queryKey: ["post", postId] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch { Alert.alert("Error", "Could not update visibility"); }
  };

  const handleReportMenu = () => {
    if (!post || !user?.id) return;
    Alert.alert("Report Post", "Why are you reporting this post?", [
      { text: "Spam", onPress: () => submitReport("spam") },
      { text: "Inappropriate", onPress: () => submitReport("inappropriate") },
      { text: "Harassment", onPress: () => submitReport("harassment") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const submitReport = async (reason: "spam" | "inappropriate" | "harassment" | "other") => {
    if (!post || !user?.id) return;
    try {
      await createReport(user.id, post.id, reason);
      Alert.alert("Reported", "Thank you. Our moderation team will review this.");
    } catch { Alert.alert("Error", "Could not submit report."); }
  };

  const [commentError, setCommentError] = useState("");

  const submitComment = async () => {
    if (!commentText.trim() || !user?.id || !post) return;
    setSubmitting(true);
    setCommentError("");
    try {
      await createComment(post.id, user.id, commentText.trim());
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["post-comments", postId] });
      qc.invalidateQueries({ queryKey: ["post", postId] });
    } catch (e: any) {
      setCommentError(e?.message ?? "Could not post comment. Please try again.");
    } finally { setSubmitting(false); }
  };

  const summarizePost = async () => {
    if (!post?.content) return;
    setLoadingPostSummary(true);
    setPostSummary("");
    try {
      const { callAI } = await import("@/lib/db");
      setPostSummary(await callAI("You are a social media assistant. Summarize this post in 1-2 short sentences.", post.content, 120));
    } finally {
      setLoadingPostSummary(false);
    }
  };

  const summarizeComments = async () => {
    setLoadingCommentSummary(true);
    setCommentSummary("");
    try {
      setCommentSummary(await summarizeAIComments(comments as Comment[]));
    } finally {
      setLoadingCommentSummary(false);
    }
  };

  const analyzeCommentsSentiment = async () => {
    setLoadingSentiment(true);
    setCommentSentiment(null);
    try {
      const allText = (comments as Comment[]).slice(0, 20).map(c => c.content).join(" ");
      const result = await analyzeAISentiment(allText);
      setCommentSentiment(result);
    } finally {
      setLoadingSentiment(false);
    }
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
        {user?.id ? (
          isOwnPost ? (
            <Pressable onPress={handleOwnerMenu} hitSlop={8}>
              <Feather name="more-horizontal" size={22} color={colors.foreground} />
            </Pressable>
          ) : (
            <Pressable onPress={handleReportMenu} hitSlop={8}>
              <Feather name="flag" size={20} color={colors.mutedForeground} />
            </Pressable>
          )
        ) : <View style={{ width: 24 }} />}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {/* Author */}
        <Pressable onPress={() => router.push(`/user/${post.author_id}` as any)} style={styles.authorRow}>
          <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={42} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.authorName, { color: colors.foreground }]}>{profile?.display_name ?? "User"}</Text>
            <Text style={[styles.authorMeta, { color: colors.mutedForeground }]}>@{profile?.username} · {timeAgo(post.created_at)}</Text>
          </View>
          {user?.id && user.id !== post.author_id && (
            <Pressable
              onPress={handleFollowToggle}
              disabled={followLoading}
              style={[styles.followBtn, { borderColor: isFollowingAuthor ? colors.border : colors.primary, backgroundColor: isFollowingAuthor ? colors.secondary : "transparent" }]}
              accessibilityRole="button"
              accessibilityState={{ selected: isFollowingAuthor }}
              accessibilityLabel={isFollowingAuthor ? "Unfollow" : "Follow"}
            >
              <Text style={{ color: isFollowingAuthor ? colors.mutedForeground : colors.primary, fontSize: 12, fontWeight: "700" }}>
                {followLoading ? "..." : isFollowingAuthor ? "Following" : "Follow"}
              </Text>
            </Pressable>
          )}
        </Pressable>

        {post.content && <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>}

        {/* AI Post Summary */}
        {!!post.content && (
          <View style={{ marginHorizontal: 16, marginTop: 8 }}>
            {!postSummary && !loadingPostSummary && (
              <Pressable onPress={summarizePost} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="zap" size={14} color="#7c3aed" />
                <Text style={{ color: "#7c3aed", fontSize: 13, fontWeight: "600" }}>AI Summary</Text>
              </Pressable>
            )}
            {loadingPostSummary && <ActivityIndicator size="small" color="#7c3aed" style={{ marginVertical: 8 }} />}
            {!!postSummary && (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: "rgba(124,58,237,0.08)", borderWidth: 1, borderColor: "rgba(124,58,237,0.15)" }}>
                <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>{postSummary}</Text>
              </View>
            )}
          </View>
        )}

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
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <AntDesign name={(isLiked ? "heart" : "hearto") as any} size={22} color={isLiked ? "#ff3b5c" : colors.mutedForeground} />
            </Animated.View>
            <Text style={[styles.actionCount, { color: isLiked ? "#ff3b5c" : colors.mutedForeground }]}>{formatCount(post.likes_count ?? 0)}</Text>
          </Pressable>
          <View style={styles.actionBtn}>
            <Feather name="message-circle" size={22} color={colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{formatCount(post.comments_count ?? 0)}</Text>
          </View>
          <Pressable style={styles.actionBtn} onPress={async () => {
            try {
              setSharesCount(s => s + 1);
              const result = await Share.share({ message: post.content ? `${post.content} — https://vibe.app/post/${post.id}` : `Check this out on Vibe! https://vibe.app/post/${post.id}` });
              if (result.action === Share.sharedAction) {
                if (post?.id) await incrementPostShares(post.id);
              } else {
                setSharesCount(s => s - 1);
              }
            } catch { setSharesCount(s => s - 1); }
          }}>
            <Feather name="share-2" size={20} color={colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{formatCount(sharesCount)}</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={{ marginLeft: "auto" }} accessibilityRole="button" accessibilityState={{ selected: isSaved }} accessibilityLabel={isSaved ? "Remove from saved" : "Save post"}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={22} color={isSaved ? colors.primary : colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Comments */}
        <View style={[styles.commentsSection, { borderTopColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[styles.commentsTitle, { color: colors.foreground }]}>Comments</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={summarizeComments} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="zap" size={12} color="#7c3aed" />
                <Text style={{ color: "#7c3aed", fontSize: 11, fontWeight: "600" }}>{loadingCommentSummary ? "..." : "Summary"}</Text>
              </Pressable>
              <Pressable onPress={analyzeCommentsSentiment} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="smile" size={12} color="#7c3aed" />
                <Text style={{ color: "#7c3aed", fontSize: 11, fontWeight: "600" }}>{loadingSentiment ? "..." : "Sentiment"}</Text>
              </Pressable>
            </View>
          </View>
          {(comments as Comment[]).length > 0 && (commentSummary || commentSentiment) && (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: "rgba(124,58,237,0.06)", borderWidth: 1, borderColor: "rgba(124,58,237,0.12)", marginBottom: 12 }}>
              {!!commentSummary && <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 18, marginBottom: 4 }}>{commentSummary}</Text>}
              {!!commentSentiment && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>{commentSentiment.emoji}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, textTransform: "capitalize" }}>{commentSentiment.label} sentiment</Text>
                </View>
              )}
            </View>
          )}
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
        <AICommentSuggestions
          postContent={post?.content ?? ""}
          onSelect={t => setCommentText(t)}
        />
        {!!commentError && (
          <Text style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>{commentError}</Text>
        )}
        <TextInput
          style={[styles.commentInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
          placeholder="Add a comment..." placeholderTextColor={colors.mutedForeground}
          value={commentText} onChangeText={setCommentText}
          multiline
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
  followBtn: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
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
  commentInputBar: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, alignItems: "flex-end" },
  commentInput: { flex: 1, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 110 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
