import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import {
  useGetFeed,
  useGetStories,
  useLikePost,
  useUnlikePost,
  useSavePost,
  useUnsavePost,
  getGetFeedQueryKey,
  useGetComments,
  getGetCommentsQueryKey,
  useCreateComment,
  useGetUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
  getGetStoriesQueryKey,
  useSearch,
  getSearchQueryKey,
  useCreateStory,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import type { Post, StoryGroup } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  // DB stores /objects/... but API serves at /api/storage/objects/...
  const apiPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
  return `${BASE_URL}${apiPath}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const bg = `hsl(${hue}, 55%, 58%)`;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── Story Item ───────────────────────────────────────────────────────────────

function StoryItem({ group }: { group: StoryGroup }) {
  const colors = useColors();
  const router = useRouter();
  const hasUnviewed =
    (group as any).hasUnviewed ?? group.stories?.some((s: any) => !s.isViewed);
  const author = group.user;
  return (
    <Pressable
      style={styles.storyItem}
      onPress={() => router.push(`/story-viewer?userId=${author.id}` as any)}
    >
      <View
        style={[
          styles.storyRing,
          {
            borderColor: hasUnviewed ? colors.primary : colors.border,
            borderWidth: hasUnviewed ? 2.5 : 1.5,
          },
        ]}
      >
        <Avatar
          name={author.displayName}
          avatarUrl={author.avatarUrl}
          size={52}
        />
      </View>
      {hasUnviewed && (
        <View style={[styles.storyDot, { backgroundColor: colors.primary }]} />
      )}
      <Text
        style={[styles.storyLabel, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {author.displayName.split(" ")[0]}
      </Text>
    </Pressable>
  );
}

// ─── Inline Video Player ──────────────────────────────────────────────────────

function InlineVideo({ uri, isVisible }: { uri: string; isVisible: boolean }) {
  const [isMuted, setIsMuted] = useState(true);
  const colors = useColors();

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        setIsMuted((m) => !m);
      }}
      style={styles.videoContainer}
    >
      <Video
        source={{ uri }}
        style={styles.videoPlayer}
        resizeMode={ResizeMode.COVER}
        isLooping
        isMuted={isMuted}
        shouldPlay={isVisible}
        useNativeControls={false}
      />
      <View style={[styles.muteBtn, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
        <Feather
          name={isMuted ? "volume-x" : "volume-2"}
          size={14}
          color="#fff"
        />
      </View>
    </Pressable>
  );
}

// ─── Media Grid ───────────────────────────────────────────────────────────────

function MediaGrid({
  mediaUrls,
  mediaType,
  isVisible,
}: {
  mediaUrls: string[];
  mediaType: string | null;
  isVisible: boolean;
}) {
  // Guard: treat "null" string and actual null the same
  const isVideo = mediaType === "video" && mediaUrls.length > 0;
  const count = mediaUrls.length;

  if (count === 0) return null;

  // Single video
  if (isVideo) {
    return (
      <View style={styles.mediaWrapper}>
        <InlineVideo uri={mediaUrls[0]} isVisible={isVisible} />
      </View>
    );
  }

  // Single image
  if (count === 1) {
    return (
      <View style={styles.mediaWrapper}>
        <Image
          source={{ uri: mediaUrls[0] }}
          style={styles.mediaSingle}
          resizeMode="cover"
        />
      </View>
    );
  }

  // 2 images side by side
  if (count === 2) {
    return (
      <View style={[styles.mediaWrapper, styles.mediaRow]}>
        {mediaUrls.map((url, i) => (
          <Image
            key={i}
            source={{ uri: url }}
            style={styles.mediaHalf}
            resizeMode="cover"
          />
        ))}
      </View>
    );
  }

  // 3 images
  if (count === 3) {
    return (
      <View style={[styles.mediaWrapper, styles.mediaRow]}>
        <Image
          source={{ uri: mediaUrls[0] }}
          style={styles.mediaThirdLeft}
          resizeMode="cover"
        />
        <View style={styles.mediaThirdRightCol}>
          <Image
            source={{ uri: mediaUrls[1] }}
            style={styles.mediaThirdRight}
            resizeMode="cover"
          />
          <Image
            source={{ uri: mediaUrls[2] }}
            style={styles.mediaThirdRight}
            resizeMode="cover"
          />
        </View>
      </View>
    );
  }

  // 4+ images grid
  const gridItemSize = (SCREEN_WIDTH - 32 - 3) / 2; // account for padding + gap
  return (
    <View style={[styles.mediaWrapper, styles.mediaGrid]}>
      {mediaUrls.slice(0, 4).map((url, i) => (
        <View
          key={i}
          style={[
            styles.mediaGridItem,
            { width: gridItemSize, height: gridItemSize },
          ]}
        >
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {i === 3 && count > 4 && (
            <View style={styles.moreOverlay}>
              <Text style={styles.moreText}>+{count - 4}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Animated Heart ───────────────────────────────────────────────────────────

function AnimatedHeart({
  isLiked,
  onPress,
}: {
  isLiked: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const colors = useColors();

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.4,
        useNativeDriver: true,
        speed: 60,
      }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60 }),
    ]).start();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={styles.actionBtn} hitSlop={10}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather
          name="heart"
          size={20}
          color={isLiked ? "#ff3b5c" : colors.mutedForeground}
          style={{ opacity: isLiked ? 1 : 0.65 }}
        />
      </Animated.View>
    </Pressable>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  myId,
  isVisible,
  onCommentPress,
}: {
  post: Post;
  myId: string | undefined;
  isVisible: boolean;
  onCommentPress: () => void;
}) {
  const colors = useColors();
  const qc = useQueryClient();
  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const savePost = useSavePost();
  const unsavePost = useUnsavePost();

  const [optimisticLike, setOptimisticLike] = useState<boolean | null>(null);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
  const [optimisticSave, setOptimisticSave] = useState<boolean | null>(null);

  const isLiked = optimisticLike !== null ? optimisticLike : post.isLiked;
  const likesCount =
    optimisticCount !== null ? optimisticCount : post.likesCount;
  const isSaved = optimisticSave !== null ? optimisticSave : post.isSaved;
  const isOwn = post.author.id === myId;

  // Use typed fields directly — no (post as any) needed
  const mediaUrls: string[] = Array.isArray(post.mediaUrls)
    ? post.mediaUrls.map(resolveMediaUrl)
    : [];

  console.log("DEBUG", {
    id: post.id,
    raw: post.mediaUrls,
    resolved: mediaUrls,
    base: BASE_URL,
    domain: process.env.EXPO_PUBLIC_DOMAIN,
  });
  const mediaType: string | null =
    post.mediaType && post.mediaType !== "null" ? post.mediaType : null;

  const handleLike = () => {
    const newLiked = !isLiked;
    setOptimisticLike(newLiked);
    setOptimisticCount(likesCount + (newLiked ? 1 : -1));
    const mutation = newLiked ? likePost : unlikePost;
    mutation.mutate(
      { postId: post.id },
      {
        onError: () => {
          setOptimisticLike(null);
          setOptimisticCount(null);
        },
        onSuccess: () =>
          qc.invalidateQueries({ queryKey: getGetFeedQueryKey() }),
      },
    );
  };

  const handleSave = () => {
    const newSaved = !isSaved;
    setOptimisticSave(newSaved);
    const mutation = newSaved ? savePost : unsavePost;
    mutation.mutate(
      { postId: post.id },
      { onError: () => setOptimisticSave(null) },
    );
  };

  return (
    <Link href={`/post/${post.id}`} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.postCard,
          { backgroundColor: colors.background },
          pressed && { opacity: 0.96 },
        ]}
      >
        {/* Header */}
        <View style={styles.postHeader}>
          <Link href={`/user/${post.author.id}` as any} asChild>
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              <View style={styles.avatarWrap}>
                <Avatar
                  name={post.author.displayName}
                  avatarUrl={post.author.avatarUrl}
                  size={40}
                />
                {isOwn && (
                  <View
                    style={[styles.ownDot, { backgroundColor: colors.primary }]}
                  />
                )}
              </View>
            </Pressable>
          </Link>

          <View style={styles.postHeaderText}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.postAuthor, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {post.author.displayName}
              </Text>
              <Text
                style={[styles.postTime, { color: colors.mutedForeground }]}
              >
                · {timeAgo(post.createdAt)}
              </Text>
            </View>
            <Text
              style={[styles.postUsername, { color: colors.mutedForeground }]}
            >
              @{post.author.username}
            </Text>
          </View>

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              handleSave();
            }}
            hitSlop={10}
            style={styles.saveBtn}
          >
            <Feather
              name="bookmark"
              size={18}
              color={isSaved ? colors.primary : colors.mutedForeground}
              style={{ opacity: isSaved ? 1 : 0.5 }}
            />
          </Pressable>
        </View>

        {/* Text content */}
        {!!post.content && (
          <Text style={[styles.postContent, { color: colors.foreground }]}>
            {post.content}
          </Text>
        )}

        {/* Media */}
        {mediaUrls.length > 0 && (
          <MediaGrid
            mediaUrls={mediaUrls}
            mediaType={mediaType}
            isVisible={isVisible}
          />
        )}

        {/* Actions */}
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          <AnimatedHeart isLiked={isLiked} onPress={handleLike} />
          <Text
            style={[
              styles.actionCount,
              { color: isLiked ? "#ff3b5c" : colors.mutedForeground },
            ]}
          >
            {formatCount(likesCount)}
          </Text>

          <View style={styles.actionGap} />

          <Pressable
            onPress={onCommentPress}
            style={styles.actionBtn}
            hitSlop={10}
          >
            <Feather
              name="message-circle"
              size={20}
              color={colors.mutedForeground}
              style={{ opacity: 0.65 }}
            />
          </Pressable>
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>
            {formatCount(post.commentsCount)}
          </Text>

          <View style={styles.actionGap} />

          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={styles.actionBtn}
            hitSlop={10}
          >
            <Feather
              name="repeat"
              size={20}
              color={colors.mutedForeground}
              style={{ opacity: 0.65 }}
            />
          </Pressable>
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>
            {formatCount(post.sharesCount ?? 0)}
          </Text>

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={styles.actionBtn}
            hitSlop={10}
          >
            <Feather
              name="share"
              size={18}
              color={colors.mutedForeground}
              style={{ opacity: 0.5 }}
            />
          </Pressable>
        </View>
      </Pressable>
    </Link>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PostSkeleton() {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={[
        styles.postCard,
        { backgroundColor: colors.background, opacity: pulse },
      ]}
    >
      <View style={styles.postHeader}>
        <View
          style={[styles.skeletonCircle, { backgroundColor: colors.secondary }]}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <View
            style={[
              styles.skeletonLine,
              { width: "45%", backgroundColor: colors.secondary },
            ]}
          />
          <View
            style={[
              styles.skeletonLine,
              { width: "28%", backgroundColor: colors.secondary },
            ]}
          />
        </View>
      </View>
      <View style={{ gap: 7, marginTop: 14 }}>
        <View
          style={[
            styles.skeletonLine,
            { width: "100%", backgroundColor: colors.secondary },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            { width: "80%", backgroundColor: colors.secondary },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            { width: "55%", backgroundColor: colors.secondary },
          ]}
        />
      </View>
    </Animated.View>
  );
}

// ─── Comment Sheet ───────────────────────────────────────────────────────────

function CommentSheet({
  postId,
  onClose,
  colors,
}: {
  postId: string;
  onClose: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data: commentsPage, isLoading } = useGetComments(postId, undefined, {
    query: { queryKey: getGetCommentsQueryKey(postId) },
  });
  const createComment = useCreateComment();

  const handleSend = () => {
    if (!text.trim()) return;
    createComment.mutate(
      { postId, data: { content: text.trim() } },
      {
        onSuccess: () => {
          setText("");
          qc.invalidateQueries({ queryKey: getGetCommentsQueryKey(postId) });
        },
      },
    );
  };

  const comments = commentsPage?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Handle bar */}
      <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
      </View>
      <View style={[sheetStyles.header, { borderBottomColor: colors.border }]}>
        <Text style={[sheetStyles.title, { color: colors.foreground }]}>
          Comments
        </Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.mutedForeground }}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <Feather name="message-circle" size={26} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
                No comments yet. Be the first!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const initials = item.author.displayName
              .split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            const hue = item.author.displayName.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360;
            return (
              <View style={[sheetStyles.commentRow, { borderBottomColor: colors.border }]}>
                {item.author.avatarUrl ? (
                  <Image
                    source={{ uri: resolveMediaUrl(item.author.avatarUrl) }}
                    style={sheetStyles.commentAvatar}
                  />
                ) : (
                  <View style={[sheetStyles.commentAvatar, { backgroundColor: `hsl(${hue},55%,58%)`, alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{initials}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[sheetStyles.commentName, { color: colors.foreground }]}>
                      {item.author.displayName}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                      {(() => {
                        const diff = Date.now() - new Date(item.createdAt).getTime();
                        const m = Math.floor(diff / 60000);
                        if (m < 1) return "now";
                        if (m < 60) return `${m}m`;
                        const h = Math.floor(m / 60);
                        return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
                      })()}
                    </Text>
                  </View>
                  <Text style={[sheetStyles.commentText, { color: colors.foreground }]}>{item.content}</Text>
                </View>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 10 }}
        />
      )}

      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={10}>
        <View
          style={[
            sheetStyles.inputRow,
            { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 4 },
          ]}
        >
          <TextInput
            style={[sheetStyles.input, { color: colors.foreground, backgroundColor: colors.secondary }]}
            placeholder="Write a comment…"
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || createComment.isPending}
            hitSlop={8}
            style={({ pressed }) => ({
              opacity: !text.trim() || createComment.isPending ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Feather name="send" size={22} color={colors.primary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: "700" },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, flexShrink: 0 },
  commentName: { fontSize: 13, fontWeight: "700" },
  commentText: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 90 },
});

// ─── Home Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [visiblePostId, setVisiblePostId] = useState<string | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [storyMedia, setStoryMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [storyUploading, setStoryUploading] = useState(false);
  const debouncedSearch = useRef(searchQuery);
  useEffect(() => {
    const t = setTimeout(() => { debouncedSearch.current = searchQuery; }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: unreadData } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      enabled: isAuthenticated === true,
    },
  });
  const unreadCount = unreadData?.count ?? 0;

  const {
    data: feedData,
    isLoading: feedLoading,
    refetch,
  } = useGetFeed(undefined, {
    query: { queryKey: getGetFeedQueryKey(), enabled: isAuthenticated === true },
  });
  const { data: storiesData } = useGetStories({
    query: { queryKey: getGetStoriesQueryKey(), enabled: isAuthenticated === true },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    const first = viewableItems.find((v: any) => v.isViewable);
    setVisiblePostId(first?.item?.id ?? null);
  }, []);

  // Stable ref to avoid FlatList warning
  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 60 },
      onViewableItemsChanged,
    },
  ]);

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const posts: Post[] = feedData?.items ?? [];
  const stories: StoryGroup[] = Array.isArray(storiesData) ? storiesData : [];

  const { data: searchResults, isFetching: searchLoading } = useSearch(
    { q: searchQuery },
    {
      query: {
        queryKey: getSearchQueryKey({ q: searchQuery }),
        enabled: searchQuery.length >= 2,
      },
    },
  );

  const qcHome = useQueryClient();
  const createStory = useCreateStory();
  const requestUploadUrl = useRequestUploadUrl();

  const handlePickStoryMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow media access to share a story.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]) {
      setStoryMedia(result.assets[0]);
      setShowCreateStory(true);
    }
  };

  const handlePostStory = async () => {
    if (!storyMedia) return;
    setStoryUploading(true);
    try {
      const ext = storyMedia.uri.split(".").pop() ?? "jpg";
      const contentType = storyMedia.type === "video" ? "video/mp4" : `image/${ext}`;
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: { name: `story-${Date.now()}.${ext}`, size: storyMedia.fileSize ?? 0, contentType },
      });
      const blob = await (await fetch(storyMedia.uri)).blob();
      await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
      await createStory.mutateAsync({
        data: { mediaUrl: objectPath, mediaType: "image" as const },
      });
      setShowCreateStory(false);
      setStoryMedia(null);
      qcHome.invalidateQueries({ queryKey: getGetStoriesQueryKey() });
    } catch {
      Alert.alert("Error", "Failed to post story. Try again.");
    } finally {
      setStoryUploading(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: isWeb ? 67 : insets.top,
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>SocialApp</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => router.push("/live-sessions" as any)}
            style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
          >
            <Feather name="video" size={18} color="#ef4444" />
          </Pressable>
          <Link href="/notifications" asChild>
            <Pressable style={[styles.headerBtn, { backgroundColor: colors.secondary }]}>
              <Feather name="bell" size={19} color={colors.foreground} />
              {unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </Link>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchWrapper, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.secondary }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search people, posts..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Search Results Overlay */}
      {searchQuery.length >= 2 && (
        <View style={[StyleSheet.absoluteFillObject, { top: isWeb ? 67 + 58 + 56 : insets.top + 58 + 56, backgroundColor: colors.background, zIndex: 10 }]}>
          {searchLoading ? (
            <View style={{ flex: 1, alignItems: "center", paddingTop: 40 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={[
                ...(searchResults?.users ?? []).map((u) => ({ type: "user" as const, item: u })),
                ...(searchResults?.posts ?? []).map((p) => ({ type: "post" as const, item: p })),
              ]}
              keyExtractor={(r) => `${r.type}-${r.item.id}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 120 }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingTop: 60, gap: 8 }}>
                  <Feather name="search" size={28} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>No results for "{searchQuery}"</Text>
                </View>
              }
              renderItem={({ item: row }) => {
                if (row.type === "user") {
                  const u = row.item as any;
                  return (
                    <Pressable
                      onPress={() => { setSearchQuery(""); router.push(`/user/${u.id}` as any); }}
                      style={({ pressed }) => [styles.searchRow, { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border }]}
                    >
                      <Avatar name={u.displayName} avatarUrl={u.avatarUrl} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={[{ fontWeight: "600", fontSize: 15, color: colors.foreground }]}>{u.displayName}</Text>
                        {u.username && <Text style={[{ fontSize: 13, color: colors.mutedForeground }]}>@{u.username}</Text>}
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  );
                }
                const p = row.item as any;
                return (
                  <Pressable
                    onPress={() => { setSearchQuery(""); router.push(`/post/${p.id}` as any); }}
                    style={({ pressed }) => [styles.searchRow, { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.searchPostIcon, { backgroundColor: colors.secondary }]}>
                      <Feather name="file-text" size={18} color={colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontWeight: "600", fontSize: 14, color: colors.foreground }]} numberOfLines={1}>{p.author?.displayName ?? "Post"}</Text>
                      <Text style={[{ fontSize: 13, color: colors.mutedForeground }]} numberOfLines={1}>{p.content}</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      )}

      {feedLoading && !refreshing ? (
        <View>
          <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.storiesBar, { borderBottomColor: colors.border }]}
              contentContainerStyle={styles.storiesContent}
            >
              <Pressable onPress={handlePickStoryMedia} style={styles.storyItem}>
                <View style={[styles.storyRing, { borderColor: colors.primary, borderWidth: 2 }]}>
                  <Avatar name={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Me"} avatarUrl={(user as any)?.profileImageUrl} size={52} />
                </View>
                <View style={[styles.storyPlusBtn, { backgroundColor: colors.primary }]}>
                  <Feather name="plus" size={12} color="#fff" />
                </View>
                <Text style={[styles.storyLabel, { color: colors.foreground }]} numberOfLines={1}>Your Story</Text>
              </Pressable>
              {stories.map((g) => (
                <StoryItem key={g.user.id} group={g} />
              ))}
            </ScrollView>
          {[0, 1, 2, 3].map((i) => (
            <PostSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          viewabilityConfigCallbackPairs={
            viewabilityConfigCallbackPairs.current
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => (
            <View
              style={[styles.separator, { backgroundColor: colors.border }]}
            />
          )}
          ListHeaderComponent={
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[styles.storiesBar, { borderBottomColor: colors.border }]}
                contentContainerStyle={styles.storiesContent}
              >
                <Pressable onPress={handlePickStoryMedia} style={styles.storyItem}>
                  <View style={[styles.storyRing, { borderColor: colors.primary, borderWidth: 2 }]}>
                    <Avatar name={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Me"} avatarUrl={(user as any)?.profileImageUrl} size={52} />
                  </View>
                  <View style={[styles.storyPlusBtn, { backgroundColor: colors.primary }]}>
                    <Feather name="plus" size={12} color="#fff" />
                  </View>
                  <Text style={[styles.storyLabel, { color: colors.foreground }]} numberOfLines={1}>Your Story</Text>
                </Pressable>
                {stories.map((g) => (
                  <StoryItem key={g.user.id} group={g} />
                ))}
              </ScrollView>
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              myId={user?.id}
              isVisible={visiblePostId === item.id}
              onCommentPress={() => setCommentPostId(item.id)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View
                style={[
                  styles.emptyIconWrap,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <Feather name="wind" size={30} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Nothing here yet
              </Text>
              <Text
                style={[styles.emptyDesc, { color: colors.mutedForeground }]}
              >
                Follow people to fill your feed
              </Text>
              <Link href="/search" asChild>
                <Pressable
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                >
                  <Feather name="search" size={15} color="#fff" />
                  <Text style={styles.emptyBtnText}>Find people</Text>
                </Pressable>
              </Link>
            </View>
          }
        />
      )}
      <Modal
        visible={!!commentPostId}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCommentPostId(null)}
      >
        {commentPostId && (
          <CommentSheet
            postId={commentPostId}
            onClose={() => setCommentPostId(null)}
            colors={colors}
          />
        )}
      </Modal>

      {/* Story Creation Modal */}
      <Modal
        visible={showCreateStory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCreateStory(false); setStoryMedia(null); }}
      >
        <View style={[styles.storyModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.storyModalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => { setShowCreateStory(false); setStoryMedia(null); }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.storyModalTitle, { color: colors.foreground }]}>New Story</Text>
            <Pressable
              onPress={handlePostStory}
              disabled={storyUploading || !storyMedia}
              style={[styles.storyPostBtn, { backgroundColor: colors.primary, opacity: storyUploading ? 0.6 : 1 }]}
            >
              {storyUploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Share</Text>
              }
            </Pressable>
          </View>
          {storyMedia ? (
            <View style={styles.storyPreviewWrap}>
              <Image source={{ uri: storyMedia.uri }} style={styles.storyPreviewImg} resizeMode="cover" />
              <View style={[styles.storyPreviewOverlay]}>
                <Pressable onPress={handlePickStoryMedia} style={[styles.storyChangeBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                  <Feather name="image" size={14} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Change</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={handlePickStoryMedia} style={[styles.storyPickerPlaceholder, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Feather name="image" size={40} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 16, fontWeight: "600", marginTop: 10 }}>Tap to pick a photo</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>Your story disappears after 24 hours</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.6 },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },

  searchWrapper: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "transparent" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 22 },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  searchPostIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  storiesBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  storiesContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 14 },
  storyItem: { alignItems: "center", width: 64, position: "relative" },
  storyRing: { borderRadius: 30, padding: 2.5, marginBottom: 5 },
  storyPlusBtn: { position: "absolute", bottom: 20, right: 0, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  storyModalContainer: { flex: 1 },
  storyModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  storyModalTitle: { fontSize: 17, fontWeight: "700" },
  storyPostBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, minWidth: 70, alignItems: "center" },
  storyPreviewWrap: { flex: 1, position: "relative" },
  storyPreviewImg: { flex: 1, width: "100%" },
  storyPreviewOverlay: { position: "absolute", bottom: 20, left: 0, right: 0, alignItems: "center" },
  storyChangeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  storyPickerPlaceholder: { flex: 1, margin: 20, borderRadius: 20, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  storyDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    position: "absolute",
    bottom: 19,
    right: 1,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  storyLabel: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    width: "100%",
  },

  postCard: { paddingTop: 14, paddingBottom: 2, paddingHorizontal: 16 },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  avatarWrap: { position: "relative" },
  ownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: "absolute",
    bottom: 0,
    right: 0,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  postHeaderText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  postAuthor: { fontWeight: "700", fontSize: 14.5 },
  postTime: { fontSize: 13, marginLeft: 3 },
  postUsername: { fontSize: 12.5, marginTop: 1 },
  saveBtn: { padding: 4 },

  postContent: {
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 12,
    letterSpacing: 0.1,
  },

  // Media
  mediaWrapper: { marginBottom: 12, borderRadius: 14, overflow: "hidden" },
  mediaSingle: { width: "100%", height: 240, borderRadius: 14 },
  mediaRow: { flexDirection: "row", gap: 3 },
  mediaHalf: { flex: 1, height: 200, borderRadius: 10 },
  mediaThirdLeft: { flex: 1, height: 200, borderRadius: 10 },
  mediaThirdRightCol: { flex: 1, gap: 3 },
  mediaThirdRight: { flex: 1, borderRadius: 8 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  mediaGridItem: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#eee",
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { color: "#fff", fontWeight: "700", fontSize: 22 },

  // Video
  videoContainer: {
    width: "100%",
    height: 260,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  videoPlayer: { width: "100%", height: "100%" },
  muteBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    borderRadius: 20,
    padding: 6,
  },

  // Actions
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  actionBtn: { padding: 4 },
  actionCount: { fontSize: 13.5, fontWeight: "500", marginLeft: 4 },
  actionGap: { width: 16 },

  separator: { height: StyleSheet.hairlineWidth },

  skeletonCircle: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  skeletonLine: { height: 13, borderRadius: 7 },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: {
    marginTop: 14,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
