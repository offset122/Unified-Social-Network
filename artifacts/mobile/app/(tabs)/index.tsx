import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform,
  RefreshControl, ScrollView, Image, Animated, Dimensions,
  Modal, TextInput, ActivityIndicator, Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  fetchFeed, fetchStories, likePost, unlikePost, savePost, unsavePost,
  createComment, fetchComments, resolveMediaUrl, uploadMedia,
  fetchUnreadNotificationCount, generateAICaption, timeAgo, formatCount,
  type Post, type Comment, type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return (
      <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setErr(true)} />
    );
  }
  return (
    <LinearGradient colors={["#7c3aed", "#4f46e5"]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}>{initials}</Text>
    </LinearGradient>
  );
}

// ─── Story Bar ────────────────────────────────────────────────────────────────

function StoryBar({ userId }: { userId: string }) {
  const router = useRouter();
  const { data: stories = [], refetch } = useQuery({
    queryKey: ["stories"],
    queryFn: () => fetchStories(userId),
  });

  const grouped = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const s of stories) {
      if (!map.has(s.author_id)) {
        map.set(s.author_id, { user: s.profiles, stories: [], hasUnviewed: true });
      }
      map.get(s.author_id).stories.push(s);
    }
    return Array.from(map.values());
  }, [stories]);

  return (
    <View style={styles.storyBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyScroll}>
        <Pressable style={styles.addStoryBtn} onPress={() => router.push("/create" as any)}>
          <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.addStoryCircle}>
            <Feather name="plus" size={22} color="#fff" />
          </LinearGradient>
          <Text style={styles.addStoryLabel}>Your Story</Text>
        </Pressable>
        {grouped.map((g, i) => (
          <Pressable key={i} style={styles.storyItem}
            onPress={() => router.push({ pathname: "/story-viewer", params: { storyGroupIndex: i } } as any)}>
            <LinearGradient colors={["#f97316", "#ec4899", "#7c3aed"]} style={styles.storyRing}>
              <View style={styles.storyAvatarWrap}>
                <Avatar name={g.user?.display_name ?? "U"} avatarUrl={g.user?.avatar_url} size={52} />
              </View>
            </LinearGradient>
            <Text style={styles.storyName} numberOfLines={1}>{g.user?.username ?? "user"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Comment Sheet ────────────────────────────────────────────────────────────

function CommentSheet({ postId, visible, onClose, userId, colors }: {
  postId: string; visible: boolean; onClose: () => void;
  userId: string; colors: any;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { data: comments = [] } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => fetchComments(postId),
    enabled: visible && !!postId,
  });

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await createComment(postId, userId, text.trim());
      setText("");
      qc.invalidateQueries({ queryKey: ["comments", postId] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.commentHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.commentTitle, { color: colors.foreground }]}>Comments</Text>
          <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={colors.foreground} /></Pressable>
        </View>
        <FlatList
          data={comments as Comment[]}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 16 }}
          renderItem={({ item: c }) => (
            <View style={styles.commentRow}>
              <Avatar name={c.profiles?.display_name ?? "U"} avatarUrl={c.profiles?.avatar_url} size={34} />
              <View style={[styles.commentBubble, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.commentAuthor, { color: colors.primary }]}>{c.profiles?.username ?? "user"}</Text>
                <Text style={[styles.commentContent, { color: colors.foreground }]}>{c.content}</Text>
                <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(c.created_at)}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.mutedForeground, marginTop: 40 }}>No comments yet. Be first!</Text>}
        />
        <View style={[styles.commentInput, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            style={[styles.commentTextInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
            placeholder="Add a comment..." placeholderTextColor={colors.mutedForeground}
            value={text} onChangeText={setText} multiline
          />
          <Pressable onPress={handleSubmit} disabled={submitting || !text.trim()}
            style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.muted }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, userId, colors }: { post: Post; userId: string; colors: any }) {
  const qc = useQueryClient();
  const [liked, setLiked] = useState(post.is_liked ?? false);
  const [likes, setLikes] = useState(post.likes_count);
  const [saved, setSaved] = useState(post.is_saved ?? false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const likeScale = useRef(new Animated.Value(1)).current;

  const mediaUrls = (post.media_urls ?? []).map(resolveMediaUrl).filter(Boolean);
  const isVideo = post.media_type === "video";

  const aspectRatio = post.media_width && post.media_height
    ? post.media_width / post.media_height
    : 1;

  const handleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikes(l => l + (next ? 1 : -1));
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 100 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 100 }),
    ]).start();
    const fn = next ? likePost : unlikePost;
    fn(userId, post.id).catch(() => { setLiked(!next); setLikes(l => l + (next ? -1 : 1)); });
  };

  const handleSave = () => {
    const next = !saved;
    setSaved(next);
    const fn = next ? savePost : unsavePost;
    fn(userId, post.id).catch(() => setSaved(!next));
  };

  const profile = post.profiles as Profile | undefined;
  const displayName = profile?.display_name ?? "User";
  const username = profile?.username ?? "user";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Author */}
      <View style={styles.cardHeader}>
        <Link href={`/user/${post.author_id}` as any} asChild>
          <Pressable style={styles.authorRow}>
            <Avatar name={displayName} avatarUrl={profile?.avatar_url} size={40} />
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.authorName, { color: colors.foreground }]}>{displayName}</Text>
              <Text style={[styles.authorMeta, { color: colors.mutedForeground }]}>@{username} · {timeAgo(post.created_at)}</Text>
            </View>
          </Pressable>
        </Link>
        <Pressable hitSlop={8}><Feather name="more-horizontal" size={20} color={colors.mutedForeground} /></Pressable>
      </View>

      {/* Content */}
      {!!post.content && (
        <Text style={[styles.postContent, { color: colors.foreground }]}>{post.content}</Text>
      )}

      {/* Media */}
      {mediaUrls.length > 0 && (
        <View style={[styles.mediaWrap, { aspectRatio: Math.min(Math.max(aspectRatio, 0.5), 2) }]}>
          {isVideo ? (
            <Video source={{ uri: mediaUrls[0] }} style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN} shouldPlay={false} isLooping useNativeControls />
          ) : (
            <>
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={e => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}>
                {mediaUrls.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={{ width: SCREEN_WIDTH, height: "100%" }} resizeMode="contain" />
                ))}
              </ScrollView>
              {mediaUrls.length > 1 && (
                <View style={styles.dots}>
                  {mediaUrls.map((_, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: i === imgIdx ? "#fff" : "rgba(255,255,255,0.4)" }]} />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.leftActions}>
          <Pressable onPress={handleLike} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Feather name={liked ? "heart" : "heart"} size={22}
                color={liked ? "#ff3b5c" : colors.mutedForeground}
                style={liked ? { textShadowColor: "#ff3b5c55", textShadowRadius: 8 } : undefined} />
            </Animated.View>
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{formatCount(likes)}</Text>
          </Pressable>
          <Pressable onPress={() => setCommentOpen(true)} style={styles.actionBtn}>
            <Feather name="message-circle" size={22} color={colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{formatCount(post.comments_count)}</Text>
          </Pressable>
          <Pressable style={styles.actionBtn}>
            <Feather name="share-2" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Pressable onPress={handleSave}>
          <Feather name={saved ? "bookmark" : "bookmark"} size={22}
            color={saved ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      <CommentSheet postId={post.id} visible={commentOpen} onClose={() => setCommentOpen(false)}
        userId={userId} colors={colors} />
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const qc = useQueryClient();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["feed"],
    queryFn: () => fetchFeed(user?.id ?? "", undefined),
    enabled: !!user?.id,
  });

  const { data: notifCount = 0 } = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => fetchUnreadNotificationCount(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (data) { setPosts(data); if (data.length) setCursor(data[data.length - 1].created_at); }
  }, [data]);

  // Realtime subscription for new posts
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel("feed-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
        qc.invalidateQueries({ queryKey: ["feed"] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor || !user?.id) return;
    setLoadingMore(true);
    try {
      const more = await fetchFeed(user.id, cursor);
      if (more.length) {
        setPosts(p => [...p, ...more]);
        setCursor(more[more.length - 1].created_at);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, cursor, user?.id]);

  const router = useRouter();

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: isWeb ? 16 : insets.top + 4, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>SocialApp</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push("/notifications" as any)} style={styles.iconBtn}>
            <Feather name="bell" size={22} color={colors.foreground} />
            {notifCount > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{notifCount > 99 ? "99+" : notifCount}</Text></View>
            )}
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/messages" as any)} style={styles.iconBtn}>
            <Feather name="send" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={p => p.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={<StoryBar userId={user?.id ?? ""} />}
        renderItem={({ item }) => <PostCard post={item} userId={user?.id ?? ""} colors={colors} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: 20 }} /> : null}
        ListEmptyComponent={!isLoading ? (
          <View style={styles.empty}>
            <Feather name="home" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your feed is empty</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>Follow people to see their posts here</Text>
          </View>
        ) : null}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 2, right: 2, backgroundColor: "#ef4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  storyBar: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e4e4e7" },
  storyScroll: { paddingHorizontal: 12, paddingVertical: 12, gap: 14 },
  addStoryBtn: { alignItems: "center", gap: 5 },
  addStoryCircle: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  addStoryLabel: { fontSize: 11, color: "#71717a", maxWidth: 58, textAlign: "center" },
  storyItem: { alignItems: "center", gap: 5 },
  storyRing: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", padding: 2 },
  storyAvatarWrap: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#fff", overflow: "hidden" },
  storyName: { fontSize: 11, color: "#71717a", maxWidth: 62, textAlign: "center" },

  card: { marginHorizontal: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 },
  authorRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  authorName: { fontSize: 15, fontWeight: "700" },
  authorMeta: { fontSize: 12, marginTop: 1 },
  postContent: { paddingHorizontal: 14, paddingBottom: 12, fontSize: 15, lineHeight: 22 },
  mediaWrap: { width: "100%", overflow: "hidden", backgroundColor: "#000" },
  dots: { position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  leftActions: { flexDirection: "row", gap: 16 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { fontSize: 13, fontWeight: "600" },

  commentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  commentTitle: { fontSize: 17, fontWeight: "700" },
  commentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  commentBubble: { flex: 1, borderRadius: 14, padding: 10 },
  commentAuthor: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  commentContent: { fontSize: 14, lineHeight: 20 },
  commentTime: { fontSize: 11, marginTop: 4 },
  commentInput: { flexDirection: "row", alignItems: "flex-end", padding: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  commentTextInput: { flex: 1, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", paddingVertical: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center" },
});
