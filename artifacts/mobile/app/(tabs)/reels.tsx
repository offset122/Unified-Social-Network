import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Dimensions,
  StatusBar,
  Share,
  Animated,
  Image,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Link } from "expo-router";
import {
  useGetReels,
  useLikePost,
  useUnlikePost,
  getGetReelsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const REEL_HEIGHT = Platform.OS === "web" ? 600 : SCREEN_HEIGHT;

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const apiPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
  return `${BASE_URL}${apiPath}`;
}

type ReelPost = {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaType: string | null;
  likesCount: number;
  commentsCount: number;
  sharesCount?: number;
  isLiked: boolean;
  isSaved: boolean;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  createdAt: string;
};

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
  const hue =
    name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const bg = `hsl(${hue}, 55%, 45%)`;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: resolveMediaUrl(avatarUrl) }}
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
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.6)",
      }}
    >
      <Text
        style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}
      >
        {initials}
      </Text>
    </View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function VideoProgress({
  progress,
  duration,
}: {
  progress: number;
  duration: number;
}) {
  const pct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  return (
    <View style={styles.progressBar}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

// ─── Animated Like ────────────────────────────────────────────────────────────

function AnimatedLike({
  isLiked,
  count,
  onPress,
}: {
  isLiked: boolean;
  count: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.5, useNativeDriver: true, speed: 80 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 80 }),
    ]).start();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={styles.sideBtn}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather
          name="heart"
          size={30}
          color={isLiked ? "#ff3b5c" : "#fff"}
          style={isLiked ? styles.likedIcon : styles.actionIcon}
        />
      </Animated.View>
      <Text style={styles.sideCount}>{formatCount(count)}</Text>
    </Pressable>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Reel Card ────────────────────────────────────────────────────────────────

function ReelCard({
  item,
  isVisible,
  index,
}: {
  item: ReelPost;
  isVisible: boolean;
  index: number;
}) {
  const qc = useQueryClient();
  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const videoRef = useRef<Video>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiked, setIsLiked] = useState(item.isLiked);
  const [likesCount, setLikesCount] = useState(item.likesCount);
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const pauseOpacity = useRef(new Animated.Value(0)).current;

  const videoUri =
    item.mediaUrls.length > 0 ? resolveMediaUrl(item.mediaUrls[0]) : null;

  // Pause/play on visibility
  useEffect(() => {
    if (!videoRef.current) return;
    if (isVisible && !isPaused) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
    }
  }, [isVisible, isPaused]);

  const handlePlaybackStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPosition(status.positionMillis ?? 0);
    setDuration(status.durationMillis ?? 0);
  };

  const handleTap = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    setShowPauseIcon(true);
    Animated.sequence([
      Animated.timing(pauseOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(pauseOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setShowPauseIcon(false));
  };

  const handleLike = () => {
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikesCount((c) => c + (newLiked ? 1 : -1));
    const mutation = newLiked ? likePost : unlikePost;
    mutation.mutate(
      { postId: item.id },
      {
        onError: () => {
          setIsLiked(!newLiked);
          setLikesCount((c) => c + (newLiked ? -1 : 1));
        },
        onSuccess: () =>
          qc.invalidateQueries({ queryKey: getGetReelsQueryKey() }),
      },
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this reel by @${item.author.username}: ${item.content}`,
        url: `${BASE_URL}/post/${item.id}`,
      });
    } catch {}
  };

  const hashtags = item.content
    .split(/\s+/)
    .filter((w) => w.startsWith("#"))
    .slice(0, 5);
  const captionText = item.content
    .split(/\s+/)
    .filter((w) => !w.startsWith("#"))
    .join(" ");

  return (
    <View style={[styles.reelCard, { width: SCREEN_WIDTH, height: REEL_HEIGHT }]}>
      {/* Video or fallback */}
      {videoUri ? (
        <Pressable onPress={handleTap} style={StyleSheet.absoluteFill}>
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted={isMuted}
            shouldPlay={isVisible && !isPaused}
            onPlaybackStatusUpdate={handlePlaybackStatus}
            useNativeControls={false}
          />
        </Pressable>
      ) : (
        <View style={styles.noVideoFallback}>
          <LinearGradient
            colors={["#1a0533", "#2d1b69", "#0f0a1e"]}
            style={StyleSheet.absoluteFill}
          />
          <Feather name="film" size={56} color="rgba(255,255,255,0.2)" />
        </View>
      )}

      {/* Pause overlay */}
      {showPauseIcon && (
        <Animated.View style={[styles.pauseOverlay, { opacity: pauseOpacity }]}>
          <Feather name={isPaused ? "pause" : "play"} size={56} color="#fff" />
        </Animated.View>
      )}

      {/* Top gradient */}
      <LinearGradient
        colors={["rgba(0,0,0,0.5)", "transparent"]}
        style={styles.topGradient}
        pointerEvents="none"
      />

      {/* Bottom gradient */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.75)"]}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* Progress bar */}
      <VideoProgress progress={position} duration={duration} />

      {/* Bottom left — author + caption */}
      <View style={styles.bottomLeft}>
        <Link href={`/user/${item.author.id}`} asChild>
          <Pressable style={styles.authorRow}>
            <Avatar
              name={item.author.displayName}
              avatarUrl={item.author.avatarUrl}
              size={38}
            />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.authorName}>{item.author.displayName}</Text>
              <Text style={styles.authorUsername}>@{item.author.username}</Text>
            </View>
          </Pressable>
        </Link>

        {!!captionText && (
          <Text style={styles.caption} numberOfLines={3}>
            {captionText}
          </Text>
        )}

        {hashtags.length > 0 && (
          <View style={styles.hashtagRow}>
            {hashtags.map((tag, i) => (
              <Text key={i} style={styles.hashtag}>
                {tag}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Right side actions */}
      <View style={styles.sideActions}>
        <AnimatedLike
          isLiked={isLiked}
          count={likesCount}
          onPress={handleLike}
        />

        <Pressable
          style={styles.sideBtn}
          onPress={() => router.push(`/post/${item.id}`)}
        >
          <Feather name="message-circle" size={30} color="#fff" style={styles.actionIcon} />
          <Text style={styles.sideCount}>{formatCount(item.commentsCount)}</Text>
        </Pressable>

        <Pressable style={styles.sideBtn} onPress={handleShare}>
          <Feather name="share-2" size={28} color="#fff" style={styles.actionIcon} />
          <Text style={styles.sideCount}>Share</Text>
        </Pressable>

        <Pressable
          style={styles.sideBtn}
          onPress={() => setIsMuted((m) => !m)}
        >
          <Feather
            name={isMuted ? "volume-x" : "volume-2"}
            size={26}
            color="#fff"
            style={styles.actionIcon}
          />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Reels Screen ─────────────────────────────────────────────────────────────

export default function ReelsScreen() {
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [visibleIndex, setVisibleIndex] = useState(0);

  const { data, isLoading, refetch } = useGetReels();
  const reels = (data?.items ?? []) as ReelPost[];

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    const first = viewableItems.find((v: any) => v.isViewable);
    if (first != null) setVisibleIndex(first.index ?? 0);
  }, []);

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 60 },
      onViewableItemsChanged,
    },
  ]);

  return (
    <View style={styles.container}>
      {Platform.OS !== "web" && <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />}

      {/* Header overlay */}
      <View style={[styles.header, { paddingTop: isWeb ? 16 : insets.top + 4 }]}>
        <Text style={styles.headerTitle}>Reels</Text>
        <Pressable
          onPress={() => router.push("/create")}
          style={styles.createBtn}
        >
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7c3aed" size="large" />
        </View>
      ) : reels.length === 0 ? (
        <View style={styles.emptyWrap}>
          <LinearGradient
            colors={["#1a0533", "#0f0a1e"]}
            style={StyleSheet.absoluteFill}
          />
          <Feather name="film" size={56} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>No Reels Yet</Text>
          <Text style={styles.emptyDesc}>Be the first to share a reel!</Text>
          <Pressable
            onPress={() => router.push("/create")}
            style={styles.createFirstBtn}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.createFirstText}>Create Reel</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ReelCard
              item={item}
              isVisible={visibleIndex === index}
              index={index}
            />
          )}
          snapToInterval={REEL_HEIGHT}
          decelerationRate="fast"
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          pagingEnabled={Platform.OS !== "web"}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
          getItemLayout={(_, index) => ({
            length: REEL_HEIGHT,
            offset: REEL_HEIGHT * index,
            index,
          })}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  createBtn: {
    backgroundColor: "#7c3aed",
    borderRadius: 20,
    padding: 8,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  reelCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#000",
  },

  noVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 5,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 5,
  },

  progressBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: "rgba(255,255,255,0.25)",
    zIndex: 20,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#7c3aed",
  },

  bottomLeft: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 90,
    zIndex: 10,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  authorName: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  authorUsername: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
  },
  caption: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hashtagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  hashtag: {
    color: "#a78bfa",
    fontSize: 13,
    fontWeight: "600",
  },

  sideActions: {
    position: "absolute",
    right: 12,
    bottom: 80,
    alignItems: "center",
    gap: 20,
    zIndex: 10,
  },
  sideBtn: {
    alignItems: "center",
    gap: 4,
  },
  sideCount: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionIcon: {
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  likedIcon: {
    textShadowColor: "rgba(255,59,92,0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyDesc: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    textAlign: "center",
  },
  createFirstBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  createFirstText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});