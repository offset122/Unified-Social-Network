import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  useColorScheme,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetFeed,
  useGetStories,
  useLikePost,
  useUnlikePost,
  getGetFeedQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function Avatar({ name, size, bg }: { name: string; size: number; bg: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

type Post = {
  id: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  content: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
};

function PostCard({ post, myId }: { post: Post; myId: string | undefined }) {
  const colors = useColors();
  const qc = useQueryClient();
  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const [optimisticLike, setOptimisticLike] = useState<boolean | null>(null);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);

  const isLiked = optimisticLike !== null ? optimisticLike : post.isLiked;
  const likesCount = optimisticCount !== null ? optimisticCount : post.likesCount;

  const handleLike = () => {
    const newLiked = !isLiked;
    setOptimisticLike(newLiked);
    setOptimisticCount((likesCount) + (newLiked ? 1 : -1));
    const mutation = newLiked ? likePost : unlikePost;
    mutation.mutate({ postId: post.id }, {
      onError: () => {
        setOptimisticLike(null);
        setOptimisticCount(null);
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFeedQueryKey() });
      },
    });
  };

  return (
    <Link href={`/post/${post.id}`} asChild>
      <Pressable style={[styles.postCard, { borderBottomColor: colors.border }]}>
        <View style={styles.postHeader}>
          <Avatar name={post.author.displayName} size={40} bg="#7c3aed" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.postAuthor, { color: colors.foreground }]}>{post.author.displayName}</Text>
            <Text style={[styles.postMeta, { color: colors.mutedForeground }]}>@{post.author.username} · {timeAgo(post.createdAt)}</Text>
          </View>
        </View>
        <Text style={[styles.postContent, { color: colors.foreground }]}>{post.content}</Text>
        <View style={styles.postActions}>
          <Pressable
            onPress={(e) => { e.preventDefault?.(); handleLike(); }}
            style={styles.actionBtn}
            hitSlop={8}
          >
            <Feather name="heart" size={18} color={isLiked ? "#ef4444" : colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: isLiked ? "#ef4444" : colors.mutedForeground }]}>{likesCount}</Text>
          </Pressable>
          <View style={styles.actionBtn}>
            <Feather name="message-circle" size={18} color={colors.mutedForeground} />
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{post.commentsCount}</Text>
          </View>
          <Pressable onPress={(e) => e.preventDefault?.()} style={styles.actionBtn} hitSlop={8}>
            <Feather name="share-2" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </Pressable>
    </Link>
  );
}

export default function HomeScreen() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();

  const { data: feedData, isLoading: feedLoading, refetch } = useGetFeed();
  const { data: storiesData } = useGetStories();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const posts = feedData?.items ?? [];
  const stories = Array.isArray(storiesData) ? storiesData : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>SocialApp</Text>
        <Link href="/notifications" asChild>
          <Pressable style={[styles.notifBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="bell" size={20} color={colors.foreground} />
          </Pressable>
        </Link>
      </View>

      {feedLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={posts as Post[]}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            stories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesRow} contentContainerStyle={styles.storiesContent}>
                {(stories as unknown as Array<{ id: string; author: { displayName: string } }>).map((story) => (
                  <View key={story.id} style={styles.storyItem}>
                    <View style={[styles.storyRing, { borderColor: colors.primary }]}>
                      <Avatar name={story.author.displayName} size={52} bg="#7c3aed" />
                    </View>
                    <Text style={[styles.storyLabel, { color: colors.foreground }]} numberOfLines={1}>
                      {story.author.displayName.split(" ")[0]}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null
          }
          renderItem={({ item }) => <PostCard post={item as Post} myId={user?.id} />}
          contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={[styles.empty, { paddingTop: 80 }]}>
              <Feather name="users" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your feed is empty</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>Follow people to see their posts here</Text>
              <Link href="/search" asChild>
                <Pressable style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Discover People</Text>
                </Pressable>
              </Link>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  notifBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  storiesRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  storiesContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  storyItem: { alignItems: "center", width: 68 },
  storyRing: { borderRadius: 30, borderWidth: 2, padding: 2, marginBottom: 4 },
  storyLabel: { fontSize: 11, fontWeight: "500", textAlign: "center" },
  postCard: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  postAuthor: { fontWeight: "700", fontSize: 14 },
  postMeta: { fontSize: 12, marginTop: 1 },
  postContent: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  postActions: { flexDirection: "row", gap: 24 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { fontSize: 13 },
  empty: { flex: 1, alignItems: "center", paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 12 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
});
