import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  StatusBar,
  Share,
  Animated,
  Modal,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, AntDesign, Ionicons } from "@expo/vector-icons";
import { LongPressGestureHandler, State as GHState } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router, Link } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import AuthPromptModal from "@/components/AuthPromptModal";
import { Avatar } from "@/components/Avatar";
import { haptics, SPRING_HEART, useReducedMotion } from "@/lib/motion";
import {
  fetchReels,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  createComment,
  fetchComments,
  resolveMediaUrl,
  formatCount,
  timeAgo,
  incrementPostViews,
  incrementPostShares,
  followUser,
  unfollowUser,
  type Post,
  type Comment,
  type Profile,
} from "@/lib/db";
import AICommentSuggestions from "@/components/ai/AICommentSuggestions";
import { RADIUS } from "@/constants/colors";

const isWeb = Platform.OS === "web";
const MUTE_KEY = "reels_muted";

function VideoProgress({
  progress,
  duration,
  onScrub,
  bottomOffset,
}: {
  progress: number;
  duration: number;
  onScrub?: (ratio: number) => void;
  bottomOffset: number;
}) {
  const pct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const [barW, setBarW] = useState(0);
  const [active, setActive] = useState(false);

  const handle = (x: number) => {
    if (!barW || duration <= 0) return;
    onScrub?.(Math.min(Math.max(x / barW, 0), 1));
  };

  return (
    <Pressable
      hitSlop={10}
      onPressIn={(e) => {
        setActive(true);
        handle(e.nativeEvent.locationX);
      }}
      onPressOut={() => setActive(false)}
      onPress={(e) => handle(e.nativeEvent.locationX)}
      onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
      style={[S.progressBar, { bottom: bottomOffset }]}
      accessibilityRole="adjustable"
      accessibilityLabel="Video progress"
    >
      <View style={[S.progressTrack, { height: active ? 6 : 2.5 }]}>
        <View style={[S.progressFill, { width: `${pct * 100}%` }]} />
      </View>
    </Pressable>
  );
}

function ReelComments({
  postId,
  postContent,
  visible,
  onClose,
  userId,
  onCountChange,
  onRequireAuth,
}: {
  postId: string;
  postContent: string;
  visible: boolean;
  onClose: () => void;
  userId: string;
  onCountChange?: (n: number) => void;
  onRequireAuth: () => void;
}) {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["reel-comments", postId],
    queryFn: () => fetchComments(postId),
    enabled: visible,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (comments.length > 0) onCountChange?.(comments.length);
  }, [comments.length, onCountChange]);

  const submit = async () => {
    if (!text.trim()) return;
    if (!userId) {
      onRequireAuth();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createComment(postId, userId, text.trim());
      haptics.success();
      setText("");
      qc.invalidateQueries({ queryKey: ["reel-comments", postId] });
      qc.invalidateQueries({ queryKey: ["reels"] });
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? "Could not post comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#121216" }}>
        <View style={S.modalHeader}>
          <Text style={S.modalTitle}>Comments ({(comments as Comment[]).length})</Text>
          <Pressable
            onPress={onClose}
            style={S.hitTarget}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
          >
            <Feather name="x" size={20} color="#F5F5F7" />
          </Pressable>
        </View>
        <FlatList
          data={comments as Comment[]}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          renderItem={({ item: c }) => (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Avatar
                name={c.profiles?.display_name ?? "U"}
                avatarUrl={c.profiles?.avatar_url}
                size={34}
              />
              <View style={S.modalBubble}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                  <Text style={{ color: "#A78BFA", fontSize: 13, fontWeight: "600" }}>
                    @{c.profiles?.username ?? "user"}
                  </Text>
                  <Text style={{ color: "#9A9AA6", fontSize: 11.5 }}>{timeAgo(c.created_at)}</Text>
                </View>
                <Text style={{ color: "#F5F5F7", fontSize: 14.5, lineHeight: 20 }}>{c.content}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: "#9A9AA6", marginTop: 48, fontSize: 15 }}>
              No comments yet. Be first!
            </Text>
          }
        />
        <View
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: "rgba(255,255,255,0.12)",
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <AICommentSuggestions postContent={postContent} onSelect={(s) => setText(s)} />
          {!!error && (
            <Text style={{ color: "#FB7185", fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 }}>
              {error}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingTop: 10 }}>
            <TextInput
              style={S.modalInput}
              placeholder="Add a comment..."
              placeholderTextColor="#6E6E78"
              value={text}
              onChangeText={setText}
              returnKeyType="send"
              onSubmitEditing={submit}
              accessibilityLabel="Comment input"
            />
            <Pressable
              onPress={submit}
              disabled={submitting || !text.trim()}
              style={[
                S.modalSend,
                { backgroundColor: text.trim() ? "#8B5CF6" : "#2C2C34" },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Feather name="send" size={16} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ReelCard({
  item,
  isActive,
  isMuted,
  onToggleMute,
  cardWidth,
  cardHeight,
  bottomInset,
}: {
  item: Post;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  cardWidth: number;
  cardHeight: number;
  bottomInset: number;
}) {
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<Video | null>(null);

  const [rate, setRate] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [videoKey, setVideoKey] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiked, setIsLiked] = useState(item.is_liked ?? false);
  const [likesCount, setLikesCount] = useState(item.likes_count);
  const [isSaved, setIsSaved] = useState(item.is_saved ?? false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [commentsCount, setCommentsCount] = useState(item.comments_count);
  const [sharesCount, setSharesCount] = useState(item.shares_count);

  const pauseOpacity = useRef(new Animated.Value(0)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const doubleTapAnim = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  const isOwnReel = user?.id === item.author_id;
  const profile = item.profiles as Profile | undefined;
  const videoUri = item.media_urls?.[0] ? resolveMediaUrl(item.media_urls[0]) : null;
  const videoAspect =
    item.media_width && item.media_height ? item.media_width / item.media_height : null;
  const isLandscape = videoAspect !== null && videoAspect > 1.3;

  const animateLike = () => {
    if (reducedMotion) return;
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.24, ...SPRING_HEART, useNativeDriver: true }),
      Animated.spring(likeScale, { toValue: 1, ...SPRING_HEART, useNativeDriver: true }),
    ]).start();
  };

  const animateDoubleTapHeart = () => {
    if (reducedMotion) return;
    doubleTapAnim.setValue(0);
    Animated.sequence([
      Animated.timing(doubleTapAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(doubleTapAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  };

  const handleFollow = async () => {
    if (!user?.id) {
      setAuthPrompt(true);
      return;
    }
    const next = !isFollowing;
    setIsFollowing(next);
    haptics.selection();
    try {
      if (next) await followUser(user.id, item.author_id);
      else await unfollowUser(user.id, item.author_id);
    } catch {
      setIsFollowing(!next);
    }
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (!user?.id) {
        setAuthPrompt(true);
        lastTap.current = now;
        return;
      }
      if (!isLiked) {
        setIsLiked(true);
        setLikesCount((c) => c + 1);
        animateLike();
        animateDoubleTapHeart();
        haptics.medium();
        likePost(user.id, item.id).catch(() => {
          setIsLiked(false);
          setLikesCount((c) => Math.max(0, c - 1));
        });
      } else {
        animateDoubleTapHeart();
      }
    } else {
      setIsPaused((p) => !p);
      if (!reducedMotion) {
        Animated.sequence([
          Animated.timing(pauseOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
          Animated.delay(450),
          Animated.timing(pauseOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
        ]).start();
      }
    }
    lastTap.current = now;
  };

  const handleLike = () => {
    if (!user?.id) {
      setAuthPrompt(true);
      return;
    }
    const next = !isLiked;
    setIsLiked(next);
    setLikesCount((c) => Math.max(0, c + (next ? 1 : -1)));
    animateLike();
    haptics.light();
    const fn = next ? likePost : unlikePost;
    fn(user.id, item.id).catch(() => {
      setIsLiked(!next);
      setLikesCount((c) => Math.max(0, c + (next ? -1 : 1)));
    });
  };

  const handleSave = () => {
    if (!user?.id) {
      setAuthPrompt(true);
      return;
    }
    const next = !isSaved;
    setIsSaved(next);
    haptics.selection();
    const fn = next ? savePost : unsavePost;
    fn(user.id, item.id).catch(() => setIsSaved(!next));
  };

  const handleShare = async () => {
    try {
      setSharesCount((c) => c + 1);
      const result = await Share.share({
        message: `Check out this reel by @${profile?.username ?? "user"}: ${item.content ?? ""} https://vibe.app/reel/${item.id}`,
      });
      if (result.action === Share.sharedAction) {
        await incrementPostShares(item.id);
      } else {
        setSharesCount((c) => Math.max(0, c - 1));
      }
    } catch {
      setSharesCount((c) => Math.max(0, c - 1));
    }
  };

  const scrub = (ratio: number) => {
    if (duration <= 0) return;
    const target = Math.round(ratio * duration);
    setPosition(target);
    videoRef.current?.setPositionAsync(target).catch(() => {});
  };

  const words = (item.content ?? "").split(/\s+/);
  const hashtags = words.filter((w) => w.startsWith("#")).slice(0, 5);
  const caption = words.filter((w) => !w.startsWith("#")).join(" ");
  const captionTruncatable = caption.length > 90;

  const getVideoStyle = (): any => {
    if (isLandscape && videoAspect) {
      return {
        position: "absolute",
        left: 0,
        right: 0,
        top: "50%",
        aspectRatio: videoAspect,
        transform: [{ translateY: -(cardWidth / videoAspect) / 2 }],
      };
    }
    return StyleSheet.absoluteFill;
  };

  const railBottom = bottomInset + 22;

  return (
    <View style={[S.reelCard, { width: cardWidth, height: cardHeight }]}>
      {videoUri ? (
        <LongPressGestureHandler
          minDurationMs={350}
          maxDist={40}
          onHandlerStateChange={(e) => {
            if (e.nativeEvent.state === GHState.ACTIVE) setRate(2);
            else if (
              e.nativeEvent.state === GHState.END ||
              e.nativeEvent.state === GHState.CANCELLED ||
              e.nativeEvent.state === GHState.FAILED
            ) {
              setRate(1);
            }
          }}
        >
          <Pressable
            onPress={handleTap}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Toggle play or pause, double-tap to like"
          >
            <Video
              key={videoKey}
              ref={(r) => {
                videoRef.current = r;
              }}
              source={{ uri: videoUri }}
              style={getVideoStyle()}
              resizeMode={isLandscape ? ResizeMode.CONTAIN : ResizeMode.COVER}
              isLooping
              isMuted={isMuted}
              rate={rate}
              shouldCorrectPitch
              shouldPlay={isActive && !isPaused}
              onLoadStart={() => {
                setLoadError(false);
                setIsBuffering(true);
              }}
              onReadyForDisplay={() => setIsBuffering(false)}
              onPlaybackStatusUpdate={(s: AVPlaybackStatus) => {
                if (!s.isLoaded) {
                  if ((s as any).error) setLoadError(true);
                  return;
                }
                setIsBuffering(!!s.isBuffering);
                setPosition(s.positionMillis ?? 0);
                setDuration(s.durationMillis ?? 0);
              }}
              useNativeControls={false}
            />
          </Pressable>
        </LongPressGestureHandler>
      ) : (
        <LinearGradient colors={["#161224", "#241942", "#0B0B0F"]} style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Feather name="film" size={52} color="rgba(255,255,255,0.22)" />
          </View>
        </LinearGradient>
      )}

      {videoUri && isActive && isBuffering && !loadError && (
        <View style={S.bufferOverlay} pointerEvents="none">
          <ActivityIndicator color="rgba(255,255,255,0.9)" size="large" />
        </View>
      )}

      {videoUri && loadError && (
        <View style={S.bufferOverlay}>
          <Pressable
            onPress={() => {
              setLoadError(false);
              setVideoKey((k) => k + 1);
            }}
            style={S.retryChip}
            accessibilityRole="button"
            accessibilityLabel="Retry video"
          >
            <Feather name="refresh-cw" size={14} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>Tap to retry</Text>
          </Pressable>
        </View>
      )}

      <Animated.View
        style={[
          S.doubleTapHeart,
          {
            opacity: doubleTapAnim,
            transform: [
              {
                scale: doubleTapAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.6, 1.25, 1],
                }),
              },
            ],
            pointerEvents: "none",
          } as any,
        ]}
      >
        <AntDesign name="heart" size={80} color="#FB7185" />
      </Animated.View>

      <Animated.View style={[S.pauseOverlay, { opacity: pauseOpacity, pointerEvents: "none" } as any]}>
        <View style={S.pauseIcon}>
          <Feather
            name={rate === 2 ? "fast-forward" : isPaused ? "play" : "pause"}
            size={rate === 2 ? 28 : 34}
            color="#FFFFFF"
          />
        </View>
        {rate === 2 && (
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700", marginTop: 6 }}>
            2× speed
          </Text>
        )}
      </Animated.View>

      <LinearGradient
        colors={["rgba(0,0,0,0.48)", "transparent"]}
        style={[S.topGrad, { pointerEvents: "none" } as any]}
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.42)", "rgba(0,0,0,0.88)"]}
        style={[S.bottomGrad, { pointerEvents: "none" } as any]}
      />

      {/* Bottom left info */}
      <View style={[S.bottomLeft, { bottom: railBottom }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Link href={`/user/${item.author_id}` as any} asChild>
            <Pressable
              style={({ pressed }) => [S.authorRow, pressed && { opacity: 0.8 }]}
              accessibilityRole="link"
              accessibilityLabel={`View ${profile?.display_name ?? "user"} profile`}
            >
              <Avatar
                name={profile?.display_name ?? "User"}
                avatarUrl={profile?.avatar_url}
                size={40}
              />
              <View style={{ marginLeft: 10 }}>
                <Text style={S.authorName}>{profile?.display_name ?? "User"}</Text>
                <Text style={S.authorHandle}>@{profile?.username ?? "user"}</Text>
              </View>
            </Pressable>
          </Link>
          {!isOwnReel && (
            <Pressable
              onPress={handleFollow}
              style={[S.followBtn, isFollowing && S.followBtnActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: isFollowing }}
              accessibilityLabel={isFollowing ? "Unfollow creator" : "Follow creator"}
            >
              <Text style={S.followBtnText}>{isFollowing ? "Following" : "Follow"}</Text>
            </Pressable>
          )}
        </View>

        {!!caption && (
          <Pressable
            onPress={() => captionTruncatable && setCaptionExpanded((x) => !x)}
            disabled={!captionTruncatable}
          >
            <Text style={S.caption} numberOfLines={captionExpanded ? undefined : 2}>
              {caption}
              {captionTruncatable && !captionExpanded && (
                <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "600" }}> more</Text>
              )}
            </Text>
          </Pressable>
        )}

        {hashtags.length > 0 && (
          <View style={S.hashtagRow}>
            {hashtags.map((t, i) => (
              <Pressable
                key={i}
                onPress={() => router.push(`/(tabs)/search?q=${encodeURIComponent(t)}` as any)}
                style={{ minHeight: 28, justifyContent: "center" }}
                accessibilityRole="link"
                accessibilityLabel={`Search ${t}`}
              >
                <Text style={S.hashtag}>{t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Right actions rail */}
      <View style={[S.sideActions, { bottom: railBottom }]}>
        <Pressable
          onPress={handleLike}
          style={S.sideBtn}
          accessibilityRole="button"
          accessibilityState={{ selected: isLiked }}
          accessibilityLabel={isLiked ? "Unlike reel" : "Like reel"}
        >
          <Animated.View
            style={[
              S.sideBtnCircle,
              isLiked && S.sideBtnCircleActive,
              { transform: [{ scale: likeScale }] },
            ]}
          >
            <AntDesign
              name={(isLiked ? "heart" : "hearto") as any}
              size={22}
              color={isLiked ? "#FB7185" : "#FFFFFF"}
            />
          </Animated.View>
          <Text style={[S.sideCount, isLiked && { color: "#FB7185" }]}>
            {formatCount(likesCount)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (!user?.id) {
              setAuthPrompt(true);
              return;
            }
            setCommentOpen(true);
          }}
          style={S.sideBtn}
          accessibilityRole="button"
          accessibilityLabel="Open comments"
        >
          <View style={S.sideBtnCircle}>
            <Feather name="message-circle" size={22} color="#FFFFFF" />
          </View>
          <Text style={S.sideCount}>{formatCount(commentsCount)}</Text>
        </Pressable>

        <Pressable
          onPress={handleShare}
          style={S.sideBtn}
          accessibilityRole="button"
          accessibilityLabel="Share reel"
        >
          <View style={S.sideBtnCircle}>
            <Feather name="share" size={21} color="#FFFFFF" />
          </View>
          <Text style={S.sideCount}>{formatCount(sharesCount)}</Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          style={S.sideBtn}
          accessibilityRole="button"
          accessibilityState={{ selected: isSaved }}
          accessibilityLabel={isSaved ? "Remove bookmark" : "Bookmark reel"}
        >
          <View
            style={[
              S.sideBtnCircle,
              isSaved && {
                backgroundColor: "rgba(139,92,246,0.28)",
                borderColor: "rgba(167,139,250,0.55)",
              },
            ]}
          >
            <Ionicons
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={21}
              color={isSaved ? "#C4B5FD" : "#FFFFFF"}
            />
          </View>
          <Text style={[S.sideCount, isSaved && { color: "#C4B5FD" }]}>
            {isSaved ? "Saved" : "Save"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onToggleMute}
          style={S.sideBtn}
          accessibilityRole="button"
          accessibilityState={{ selected: isMuted }}
          accessibilityLabel={isMuted ? "Unmute audio" : "Mute audio"}
        >
          <View style={S.sideBtnCircle}>
            <Feather name={isMuted ? "volume-x" : "volume-2"} size={20} color="#FFFFFF" />
          </View>
        </Pressable>
      </View>

      <VideoProgress
        progress={position}
        duration={duration}
        onScrub={scrub}
        bottomOffset={Math.max(4, bottomInset - 14)}
      />

      <ReelComments
        postId={item.id}
        postContent={item.content ?? ""}
        visible={commentOpen}
        onClose={() => setCommentOpen(false)}
        userId={user?.id ?? ""}
        onCountChange={setCommentsCount}
        onRequireAuth={() => setAuthPrompt(true)}
      />

      <AuthPromptModal
        visible={authPrompt}
        onDismiss={() => setAuthPrompt(false)}
        reason="Sign up to like, comment, and save reels."
      />
    </View>
  );
}

export default function ReelsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isDesktopWeb = isWeb && width >= 768;
  const stageWidth = isDesktopWeb ? Math.min(440, width - 280) : width;
  const stageHeight = isDesktopWeb ? Math.max(540, height - 32) : height;
  const bottomInset = isDesktopWeb ? 24 : Math.max(insets.bottom + 64, 78);

  const [visibleIndex, setVisibleIndex] = useState(0);
  const [tabFocused, setTabFocused] = useState(true);
  const [reels, setReels] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(MUTE_KEY)
      .then((v) => {
        if (v !== null) setIsMuted(v === "1");
      })
      .catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    haptics.selection();
    setIsMuted((m) => {
      const next = !m;
      AsyncStorage.setItem(MUTE_KEY, next ? "1" : "0").catch(() => {});
      return next;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setTabFocused(true);
      return () => {
        setTabFocused(false);
        setVisibleIndex(-1);
      };
    }, []),
  );

  const { data: firstPage = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reels", user?.id ?? ""],
    queryFn: () => fetchReels(user?.id ?? ""),
  });

  useEffect(() => {
    setReels(firstPage as Post[]);
    const last = (firstPage as Post[])[(firstPage as Post[]).length - 1];
    setCursor(last?.created_at);
    setHasMore(((firstPage as Post[]).length ?? 0) >= 10);
  }, [firstPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchReels(user?.id ?? "", cursor);
      setReels((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = next.filter((p) => !seen.has(p.id));
        return [...prev, ...fresh];
      });
      if (next.length < 10) setHasMore(false);
      else setCursor(next[next.length - 1].created_at);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, cursor, hasMore, user?.id]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: any) => {
      if (!tabFocused) return;
      const first = viewableItems.find((v: any) => v.isViewable);
      if (first != null) {
        const idx = first.index ?? 0;
        setVisibleIndex(idx);
        const reel = reels[idx];
        if (reel && !viewedRef.current.has(reel.id)) {
          viewedRef.current.add(reel.id);
          incrementPostViews(reel.id);
        }
      }
    },
    [tabFocused, reels],
  );

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 65 },
      onViewableItemsChanged,
    },
  ]);

  useEffect(() => {
    viewabilityConfigCallbackPairs.current[0].onViewableItemsChanged = onViewableItemsChanged;
  }, [onViewableItemsChanged]);

  return (
    <View style={S.container}>
      {!isWeb && <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />}

      {/* Floating header */}
      <View
        style={[
          S.header,
          {
            paddingTop: isWeb ? 14 : Math.max(insets.top + 6, 12),
            maxWidth: isDesktopWeb ? stageWidth : undefined,
            alignSelf: "center",
            width: "100%",
          },
        ]}
      >
        <Text style={S.headerTitle}>Reels</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={toggleMute}
            style={S.headerGlassBtn}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? "Unmute reels" : "Mute reels"}
          >
            <Feather name={isMuted ? "volume-x" : "volume-2"} size={19} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.light();
              router.push("/(tabs)/create" as any);
            }}
            style={S.headerGlassBtn}
            accessibilityRole="button"
            accessibilityLabel="Create reel"
          >
            <Feather name="plus" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={S.center}>
          <ActivityIndicator color="#8B5CF6" size="large" />
        </View>
      ) : isError ? (
        <View style={S.emptyWrap}>
          <Feather name="alert-circle" size={48} color="#FB7185" />
          <Text style={S.emptyTitle}>Couldn't load reels</Text>
          <Text style={S.emptyDesc}>{(error as any)?.message ?? "Something went wrong."}</Text>
          <Pressable
            onPress={() => refetch()}
            style={S.createFirstBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry loading reels"
          >
            <Feather name="refresh-cw" size={16} color="#FFFFFF" />
            <Text style={S.createFirstText}>Retry</Text>
          </Pressable>
        </View>
      ) : reels.length === 0 ? (
        <View style={S.emptyWrap}>
          <Feather name="film" size={56} color="rgba(255,255,255,0.28)" />
          <Text style={S.emptyTitle}>No Reels Yet</Text>
          <Text style={S.emptyDesc}>Share vertical video clips with the community.</Text>
          <Pressable
            onPress={() => router.push("/(tabs)/create" as any)}
            style={S.createFirstBtn}
            accessibilityRole="button"
            accessibilityLabel="Create reel"
          >
            <Feather name="plus" size={17} color="#FFFFFF" />
            <Text style={S.createFirstText}>Create Reel</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)" as any)}
            style={[S.createFirstBtn, { backgroundColor: "rgba(255,255,255,0.12)", marginTop: 0 }]}
            accessibilityRole="button"
            accessibilityLabel="Browse home feed"
          >
            <Feather name="home" size={16} color="#FFFFFF" />
            <Text style={S.createFirstText}>Browse Feed</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={isDesktopWeb ? { alignItems: "center", paddingVertical: 16, gap: 16 } : undefined}
          renderItem={({ item, index }) => (
            <ReelCard
              item={item}
              isActive={tabFocused && visibleIndex === index}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              cardWidth={stageWidth}
              cardHeight={stageHeight}
              bottomInset={bottomInset}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
              </View>
            ) : !hasMore && reels.length > 0 ? (
              <View style={{ paddingVertical: 28, alignItems: "center" }}>
                <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
                  You're all caught up
                </Text>
              </View>
            ) : null
          }
          snapToInterval={isDesktopWeb ? undefined : stageHeight}
          decelerationRate={Platform.OS === "ios" ? 0.992 : "fast"}
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          pagingEnabled={!isWeb}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
          getItemLayout={
            isDesktopWeb
              ? undefined
              : (_, index) => ({ length: stageHeight, offset: stageHeight * index, index })
          }
          removeClippedSubviews={!isWeb}
          maxToRenderPerBatch={3}
          windowSize={5}
          initialNumToRender={2}
          scrollEventThrottle={16}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: {
    position: "absolute",
    top: 0,
    zIndex: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  headerGlassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  hitTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  reelCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#000000",
    borderRadius: isWeb ? RADIUS.lg : 0,
  },
  bufferOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 15 },
  retryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 22,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 10 },
  pauseIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  doubleTapHeart: { position: "absolute", top: "40%", left: "50%", marginLeft: -40, zIndex: 30 },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0, height: 120, zIndex: 5 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 320, zIndex: 5 },
  progressBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 18,
    justifyContent: "center",
    zIndex: 25,
  },
  progressTrack: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#8B5CF6" },
  followBtn: {
    paddingHorizontal: 14,
    minHeight: 34,
    justifyContent: "center",
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.38)",
  },
  followBtnActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  followBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  bottomLeft: { position: "absolute", left: 16, right: 86, zIndex: 10 },
  authorRow: { flexDirection: "row", alignItems: "center" },
  authorName: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  authorHandle: { color: "rgba(255,255,255,0.7)", fontSize: 12.5 },
  caption: { color: "#FFFFFF", fontSize: 14.5, lineHeight: 20, marginBottom: 6 },
  hashtagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hashtag: { color: "#C4B5FD", fontSize: 13.5, fontWeight: "600" },
  sideActions: { position: "absolute", right: 12, alignItems: "center", gap: 16, zIndex: 10 },
  sideBtn: { alignItems: "center", gap: 4, minWidth: 44 },
  sideBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  sideBtnCircleActive: {
    backgroundColor: "rgba(251,113,133,0.22)",
    borderColor: "rgba(251,113,133,0.48)",
  },
  sideCount: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  emptyTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginTop: 8 },
  emptyDesc: { color: "#9A9AA6", fontSize: 15, textAlign: "center", maxWidth: 300 },
  createFirstBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 24,
    minHeight: 46,
    borderRadius: RADIUS.pill,
    marginTop: 6,
  },
  createFirstText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  modalTitle: { color: "#F5F5F7", fontSize: 17, fontWeight: "600" },
  modalBubble: {
    flex: 1,
    backgroundColor: "#1C1C22",
    borderRadius: RADIUS.md,
    padding: 12,
  },
  modalInput: {
    flex: 1,
    backgroundColor: "#1C1C22",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#F5F5F7",
    fontSize: 14.5,
    minHeight: 44,
  },
  modalSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
