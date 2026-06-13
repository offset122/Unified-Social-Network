import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TextInput,
  Pressable,
  Image,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetPost,
  getGetPostQueryKey,
  useGetComments,
  getGetCommentsQueryKey,
  useCreateComment,
  useLikePost,
  useUnlikePost,
  useSavePost,
  useUnsavePost,
  getGetFeedQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Video, ResizeMode } from "expo-av";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const apiPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
  return `${BASE_URL}${apiPath}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return (
      <Image
        source={{ uri: resolveMediaUrl(avatarUrl) }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,58%)`,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

function HighlightedText({ text, style }: { text: string; style: any }) {
  const parts = text.split(/(\B[#@]\w+)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => (
        <Text key={i} style={part.startsWith("#") ? { color: "#7c3aed" } : part.startsWith("@") ? { color: "#0ea5e9" } : undefined}>
          {part}
        </Text>
      ))}
    </Text>
  );
}

export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const { user: me } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [optimisticLike, setOptimisticLike] = useState<boolean | null>(null);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
  const [optimisticSave, setOptimisticSave] = useState<boolean | null>(null);

  const { data: post, isLoading: postLoading } = useGetPost(
    postId as string,
    { query: { enabled: !!postId, queryKey: getGetPostQueryKey(postId as string) } },
  );
  const { data: commentsPage, isLoading: commentsLoading } = useGetComments(
    postId as string,
    undefined,
    { query: { enabled: !!postId, queryKey: getGetCommentsQueryKey(postId as string) } },
  );
  const createComment = useCreateComment();
  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const savePost = useSavePost();
  const unsavePost = useUnsavePost();

  const isLiked = optimisticLike !== null ? optimisticLike : (post?.isLiked ?? false);
  const likesCount = optimisticCount !== null ? optimisticCount : (post?.likesCount ?? 0);
  const isSaved = optimisticSave !== null ? optimisticSave : (post?.isSaved ?? false);

  const handleLike = () => {
    if (!postId) return;
    const next = !isLiked;
    setOptimisticLike(next);
    setOptimisticCount(likesCount + (next ? 1 : -1));
    const mut = next ? likePost : unlikePost;
    mut.mutate({ postId: postId as string }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPostQueryKey(postId as string) });
        qc.invalidateQueries({ queryKey: getGetFeedQueryKey() });
        setOptimisticLike(null);
        setOptimisticCount(null);
      },
      onError: () => { setOptimisticLike(null); setOptimisticCount(null); },
    });
  };

  const handleSave = () => {
    if (!postId) return;
    const next = !isSaved;
    setOptimisticSave(next);
    const mut = next ? savePost : unsavePost;
    mut.mutate({ postId: postId as string }, {
      onSuccess: () => setOptimisticSave(null),
      onError: () => setOptimisticSave(null),
    });
  };

  const handleComment = () => {
    if (!commentText.trim() || !postId) return;
    createComment.mutate(
      { postId: postId as string, data: { content: commentText.trim() } },
      {
        onSuccess: () => {
          setCommentText("");
          qc.invalidateQueries({ queryKey: getGetCommentsQueryKey(postId as string) });
          qc.invalidateQueries({ queryKey: getGetPostQueryKey(postId as string) });
        },
      },
    );
  };

  if (postLoading) {
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

  const mediaUrls: string[] = Array.isArray(post.mediaUrls)
    ? post.mediaUrls.map(resolveMediaUrl)
    : [];
  const mediaType = post.mediaType && post.mediaType !== "null" ? post.mediaType : null;
  const comments = commentsPage?.items ?? [];

  const PostHeader = (
    <View>
      {/* Author row */}
      <Pressable
        onPress={() => router.push(`/user/${post.author.id}`)}
        style={[styles.authorRow, { borderBottomColor: colors.border }]}
      >
        <Avatar name={post.author.displayName} avatarUrl={post.author.avatarUrl} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.authorName, { color: colors.foreground }]}>{post.author.displayName}</Text>
          <Text style={[styles.authorMeta, { color: colors.mutedForeground }]}>
            @{post.author.username} · {timeAgo(post.createdAt)}
          </Text>
        </View>
        {(post as any).visibility && (post as any).visibility !== "public" && (
          <View style={[styles.visibilityBadge, { backgroundColor: colors.secondary }]}>
            <Feather
              name={(post as any).visibility === "followers" ? "users" : "lock"}
              size={12}
              color={colors.mutedForeground}
            />
          </View>
        )}
      </Pressable>

      {/* Content */}
      <View style={styles.contentBlock}>
        <HighlightedText
          text={post.content}
          style={[styles.postContent, { color: colors.foreground }]}
        />
      </View>

      {/* Media */}
      {mediaUrls.length > 0 && (
        <View style={styles.mediaBlock}>
          {mediaType === "video" ? (
            <Video
              source={{ uri: mediaUrls[0] }}
              style={styles.videoPlayer}
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
              isLooping={false}
              useNativeControls
            />
          ) : mediaUrls.length === 1 ? (
            <Image source={{ uri: mediaUrls[0] }} style={styles.singleImage} resizeMode="cover" />
          ) : (
            <View style={styles.gridWrap}>
              {mediaUrls.slice(0, 4).map((url, i) => (
                <View key={i} style={[styles.gridItem, { backgroundColor: colors.secondary }]}>
                  <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  {i === 3 && mediaUrls.length > 4 && (
                    <View style={styles.moreOverlay}>
                      <Text style={styles.moreText}>+{mediaUrls.length - 4}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Stats row */}
      <View style={[styles.statsRow, { borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Feather name="eye" size={14} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{formatNum((post as any).viewsCount ?? 0)} views</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="message-circle" size={14} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{formatNum(post.commentsCount)} comments</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="repeat" size={14} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{formatNum(post.sharesCount ?? 0)} shares</Text>
        </View>
      </View>

      {/* Action row */}
      <View style={[styles.actionsRow, { borderColor: colors.border }]}>
        <Pressable onPress={handleLike} style={styles.actionBtn} hitSlop={10}>
          <Feather name="heart" size={22} color={isLiked ? "#ef4444" : colors.mutedForeground} />
          <Text style={[styles.actionCount, { color: isLiked ? "#ef4444" : colors.mutedForeground }]}>
            {formatNum(likesCount)}
          </Text>
        </Pressable>
        <Pressable onPress={handleSave} style={styles.actionBtn} hitSlop={10}>
          <Feather name="bookmark" size={22} color={isSaved ? colors.primary : colors.mutedForeground} />
        </Pressable>
        <Pressable style={styles.actionBtn} hitSlop={10}>
          <Feather name="share-2" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Comments section label */}
      <View style={[styles.commentsLabel, { borderBottomColor: colors.border }]}>
        <Text style={[styles.commentsTitle, { color: colors.foreground }]}>Comments</Text>
        {commentsLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Post", headerBackTitle: "" }} />
      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={PostHeader}
        ListEmptyComponent={
          !commentsLoading ? (
            <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
              <Feather name="message-circle" size={28} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>No comments yet. Be the first!</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.commentCard, { borderBottomColor: colors.border }]}>
            <Avatar name={item.author.displayName} avatarUrl={item.author.avatarUrl} size={36} />
            <View style={styles.commentBody}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{item.author.displayName}</Text>
                <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
              </View>
              <HighlightedText
                text={item.content}
                style={[styles.commentContent, { color: colors.foreground }]}
              />
            </View>
          </View>
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={90}>
        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary }]}
            placeholder="Add a comment…"
            placeholderTextColor={colors.mutedForeground}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
          />
          <Pressable
            onPress={handleComment}
            disabled={!commentText.trim() || createComment.isPending}
            style={({ pressed }) => [styles.sendBtn, { opacity: !commentText.trim() || createComment.isPending ? 0.4 : pressed ? 0.7 : 1 }]}
          >
            <Feather name="send" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  authorName: { fontSize: 15, fontWeight: "700" },
  authorMeta: { fontSize: 13, marginTop: 1 },
  visibilityBadge: { padding: 6, borderRadius: 12 },
  contentBlock: { paddingHorizontal: 16, paddingVertical: 14 },
  postContent: { fontSize: 17, lineHeight: 26 },
  mediaBlock: { marginHorizontal: 16, marginBottom: 14, borderRadius: 14, overflow: "hidden" },
  videoPlayer: { width: "100%", height: 260, borderRadius: 14 },
  singleImage: { width: "100%", height: 280, borderRadius: 14 },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  gridItem: { width: "49%", height: 160, borderRadius: 8, overflow: "hidden", position: "relative" },
  moreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  moreText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { fontSize: 13 },
  actionsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 24, borderBottomWidth: StyleSheet.hairlineWidth },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCount: { fontSize: 14, fontWeight: "600" },
  commentsLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  commentsTitle: { fontSize: 16, fontWeight: "700" },
  commentCard: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  commentBody: { flex: 1 },
  commentAuthor: { fontSize: 14, fontWeight: "700" },
  commentTime: { fontSize: 12 },
  commentContent: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  inputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { padding: 10 },
});
