import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Platform, Dimensions, StatusBar, Share, Animated, Image, Modal,
  TextInput, Alert,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { LongPressGestureHandler, State as GHState } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router, Link } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import AuthPromptModal from "@/components/AuthPromptModal";
import {
  fetchReels, likePost, unlikePost, savePost, unsavePost,
  createComment, fetchComments, resolveMediaUrl, formatCount, timeAgo,
  incrementPostViews, incrementPostShares, followUser, unfollowUser,
  type Post, type Comment, type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import AICommentSuggestions from "@/components/ai/AICommentSuggestions";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const REEL_HEIGHT = isWeb ? Math.min(640, SCREEN_HEIGHT - 100) : SCREEN_HEIGHT;
const MUTE_KEY = "reels_muted";

function haptic(style: Haptics.ImpactFeedbackStyle) {
  if (!isWeb) Haptics.impactAsync(style).catch(() => {});
}

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) return <Image source={{ uri: resolveMediaUrl(avatarUrl) }} style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

function VideoProgress({ progress, duration, onScrub }: { progress: number; duration: number; onScrub?: (ratio: number) => void }) {
  const pct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const [barW, setBarW] = useState(0);
  const [active, setActive] = useState(false);

  const handle = (x: number) => {
    if (!barW || duration <= 0) return;
    onScrub?.(Math.min(Math.max(x / barW, 0), 1));
  };

  return (
    <Pressable
      hitSlop={8}
      onPressIn={(e) => { setActive(true); handle(e.nativeEvent.locationX); }}
      onPressOut={() => setActive(false)}
      onPress={(e) => handle(e.nativeEvent.locationX)}
      onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
      style={S.progressBar}
      accessibilityRole="adjustable"
      accessibilityLabel="Video progress"
    >
      <View style={[S.progressFill, { width: `${pct * 100}%`, height: active ? 4 : undefined }]} />
    </Pressable>
  );
}

function ReelComments({ postId, postContent, visible, onClose, userId, onCountChange, onRequireAuth }: {
  postId: string; postContent: string; visible: boolean; onClose: () => void;
  userId: string; onCountChange?: (n: number) => void; onRequireAuth: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { data: comments = [] } = useQuery({
    queryKey: ["reel-comments", postId],
    queryFn: () => fetchComments(postId),
    enabled: visible,
    staleTime: 30_000,
  });

  useEffect(() => { if (comments.length > 0) onCountChange?.(comments.length); }, [comments.length]);

  const submit = async () => {
    if (!text.trim()) return;
    if (!userId) { onRequireAuth(); return; }
    setSubmitting(true);
    setError("");
    try {
      await createComment(postId, userId, text.trim());
      setText("");
      qc.invalidateQueries({ queryKey: ["reel-comments", postId] });
      qc.invalidateQueries({ queryKey: ["reels"] });
    } catch (e: any) {
      setError(e?.message ?? "Could not post comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#18181b" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#3f3f46" }}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>Comments ({(comments as Comment[]).length})</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close comments">
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
        </View>
        <FlatList
          data={comments as Comment[]}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          renderItem={({ item: c }) => (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Avatar name={c.profiles?.display_name ?? "U"} avatarUrl={c.profiles?.avatar_url} size={34} />
              <View style={{ flex: 1, backgroundColor: "#27272a", borderRadius: 14, padding: 10 }}>
                <Text style={{ color: "#a78bfa", fontSize: 13, fontWeight: "700" }}>@{c.profiles?.username ?? "user"}</Text>
                <Text style={{ color: "#fff", fontSize: 14, marginTop: 2 }}>{c.content}</Text>
                <Text style={{ color: "#71717a", fontSize: 11, marginTop: 4 }}>{timeAgo(c.created_at)}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: "#71717a", marginTop: 48, fontSize: 15 }}>No comments yet. Be first!</Text>}
        />
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3f3f46" }}>
          <AICommentSuggestions postContent={postContent} onSelect={(s) => setText(s)} />
          {!!error && (
            <Text style={{ color: "#ef4444", fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 }}>{error}</Text>
          )}
          <View style={{ flexDirection: "row", gap: 10, padding: 12 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: "#27272a", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontSize: 14 }}
              placeholder="Add a comment..." placeholderTextColor="#71717a"
              value={text} onChangeText={setText} returnKeyType="send" onSubmitEditing={submit}
            />
            <Pressable onPress={submit} disabled={submitting || !text.trim()}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: text.trim() ? "#7c3aed" : "#3f3f46", alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button" accessibilityLabel="Post comment">
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ReelCard({ item, isActive, isMuted, onToggleMute }: {
  item: Post; isActive: boolean; isMuted: boolean; onToggleMute: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
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

  const handleFollow = async () => {
    if (!user?.id) { setAuthPrompt(true); return; }
    const next = !isFollowing;
    setIsFollowing(next);
    try {
      if (next) await followUser(user.id, item.author_id);
      else await unfollowUser(user.id, item.author_id);
    } catch { setIsFollowing(!next); }
  };

  const profile = item.profiles as Profile | undefined;
  const videoUri = item.media_urls?.[0] ? resolveMediaUrl(item.media_urls[0]) : null;

  const videoAspect = item.media_width && item.media_height ? item.media_width / item.media_height : null;
  const isPortrait = videoAspect !== null && videoAspect < 1;
  const isLandscape = videoAspect !== null && videoAspect > 1.3;

  const animateLike = () => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.5, useNativeDriver: true, speed: 80 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 80 }),
    ]).start();
  };

  const animateDoubleTapHeart = () => {
    doubleTapAnim.setValue(0);
    Animated.sequence([
      Animated.timing(doubleTapAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(doubleTapAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (!isLiked) {
        setIsLiked(true);
        setLikesCount(c => c + 1);
        animateLike();
        animateDoubleTapHeart();
        haptic(Haptics.ImpactFeedbackStyle.Medium);
        likePost(user?.id ?? "", item.id).catch(() => { setIsLiked(false); setLikesCount(c => c - 1); });
      } else {
        animateDoubleTapHeart();
      }
    } else {
      setIsPaused(p => !p);
      Animated.sequence([
        Animated.timing(pauseOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(500),
        Animated.timing(pauseOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
    lastTap.current = now;
  };

  const handleLike = () => {
    if (!user?.id) { setAuthPrompt(true); return; }
    const next = !isLiked;
    setIsLiked(next);
    setLikesCount(c => c + (next ? 1 : -1));
    animateLike();
    haptic(Haptics.ImpactFeedbackStyle.Light);
    const fn = next ? likePost : unlikePost;
    fn(user.id, item.id).catch(() => { setIsLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); });
  };

  const handleSave = () => {
    if (!user?.id) { setAuthPrompt(true); return; }
    const next = !isSaved;
    setIsSaved(next);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    const fn = next ? savePost : unsavePost;
    fn(user.id, item.id).catch(() => setIsSaved(!next));
  };

  const handleShare = async () => {
    try {
      setSharesCount(c => c + 1);
      const result = await Share.share({ message: `🎬 Check out this reel by @${profile?.username}: ${item.content} https://vibe.app/reel/${item.id}` });
      if (result.action === Share.sharedAction) {
        await incrementPostShares(item.id);
      } else {
        setSharesCount(c => c - 1);
      }
    } catch { setSharesCount(c => c - 1); }
  };

  const openComments = () => {
    if (!user?.id) { setAuthPrompt(true); return; }
    setCommentOpen(true);
  };

  const scrub = (ratio: number) => {
    if (duration <= 0) return;
    const target = Math.round(ratio * duration);
    setPosition(target);
    videoRef.current?.setPositionAsync(target).catch(() => {});
  };

  const words = (item.content ?? "").split(/\s+/);
  const hashtags = words.filter(w => w.startsWith("#")).slice(0, 5);
  const caption = words.filter(w => !w.startsWith("#")).join(" ");
  const captionTruncatable = caption.length > 90;

  const getVideoStyle = (): any => {
    if (isLandscape) {
      return { position: "absolute", left: 0, right: 0, top: "50%", aspectRatio: videoAspect!, transform: [{ translateY: -(SCREEN_WIDTH / videoAspect!) / 2 }] };
    }
    return StyleSheet.absoluteFill;
  };

  return (
    <View style={[S.reelCard, { width: SCREEN_WIDTH, height: REEL_HEIGHT }]}>
      {videoUri ? (
        <LongPressGestureHandler
          minDurationMs={350}
          maxDist={40}
          onHandlerStateChange={(e) => {
            if (e.nativeEvent.state === GHState.ACTIVE) setRate(2);
            else if (e.nativeEvent.state === GHState.END || e.nativeEvent.state === GHState.CANCELLED || e.nativeEvent.state === GHState.FAILED) setRate(1);
          }}
        >
          <Pressable onPress={handleTap} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Toggle play/pause, double-tap to like">
            <Video
              key={videoKey}
              ref={(r) => { videoRef.current = r; }}
              source={{ uri: videoUri }}
              style={getVideoStyle()}
              resizeMode={isLandscape ? ResizeMode.CONTAIN : ResizeMode.COVER}
              isLooping
              isMuted={isMuted}
              rate={rate}
              shouldCorrectPitch
              shouldPlay={isActive && !isPaused}
              onLoadStart={() => { setLoadError(false); setIsBuffering(true); }}
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
        <LinearGradient colors={["#1a0533", "#2d1b69", "#0f0a1e"]} style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Feather name="film" size={56} color="rgba(255,255,255,0.2)" />
          </View>
        </LinearGradient>
      )}

      {/* Buffering / error overlays */}
      {videoUri && isActive && isBuffering && !loadError && (
        <View style={S.bufferOverlay} pointerEvents="none">
          <ActivityIndicator color="rgba(255,255,255,0.9)" size="large" />
        </View>
      )}
      {videoUri && loadError && (
        <View style={S.bufferOverlay}>
          <Pressable onPress={() => { setLoadError(false); setVideoKey(k => k + 1); }} style={S.retryChip} accessibilityRole="button" accessibilityLabel="Retry video">
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Tap to retry</Text>
          </Pressable>
        </View>
      )}

      {/* Double-tap heart */}
      <Animated.View style={[S.doubleTapHeart, { opacity: doubleTapAnim, transform: [{ scale: doubleTapAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1.3, 1] }) }], pointerEvents: "none" } as any]}>
        <AntDesign name="heart" size={80} color="#ff3b5c" />
      </Animated.View>

      <Animated.View style={[S.pauseOverlay, { opacity: pauseOpacity, pointerEvents: "none" } as any]}>
        <View style={S.pauseIcon}>
          <Feather name={rate === 2 ? "fast-forward" : isPaused ? "play" : "pause"} size={rate === 2 ? 30 : 36} color="#fff" />
        </View>
        {rate === 2 && <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 6 }}>2× speed</Text>}
      </Animated.View>

      <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={[S.topGrad, { pointerEvents: "none" } as any]} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={[S.bottomGrad, { pointerEvents: "none" } as any]} />

      <VideoProgress progress={position} duration={duration} onScrub={scrub} />

      {/* Aspect badge */}
      {videoAspect !== null && (
        <View style={S.orientBadge}>
          <Feather name={isPortrait ? "smartphone" : "monitor"} size={9} color="rgba(255,255,255,0.7)" />
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, marginLeft: 2 }}>
            {isPortrait ? "9:16" : isLandscape ? "16:9" : "1:1"}
          </Text>
        </View>
      )}

      {/* Bottom left info */}
      <View style={S.bottomLeft}>
        <Link href={`/user/${item.author_id}` as any} asChild>
          <Pressable style={({ pressed }) => [S.authorRow, pressed && { opacity: 0.8 }]}
            accessibilityRole="link" accessibilityLabel={`View ${profile?.display_name ?? "user"}'s profile`}>
            <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={42} />
            <View style={{ marginLeft: 10 }}>
              <Text style={S.authorName}>{profile?.display_name ?? "User"}</Text>
              <Text style={S.authorHandle}>@{profile?.username ?? "user"}</Text>
            </View>
          </Pressable>
        </Link>
        {!isOwnReel && (
          <Pressable onPress={handleFollow} style={({ pressed }) => [S.followBtn, isFollowing && S.followBtnActive, pressed && { opacity: 0.8 }]}
            accessibilityRole="button" accessibilityState={{ selected: isFollowing }} accessibilityLabel={isFollowing ? "Unfollow" : "Follow"}>
            <Text style={[S.followBtnText, isFollowing && { color: "rgba(255,255,255,0.7)" }]}>
              {isFollowing ? "Following" : "+ Follow"}
            </Text>
          </Pressable>
        )}
        {!!caption && (
          <Pressable onPress={() => captionTruncatable && setCaptionExpanded(x => !x)} disabled={!captionTruncatable}>
            <Text style={S.caption} numberOfLines={captionExpanded ? undefined : 2}>
              {caption}
              {captionTruncatable && !captionExpanded && (
                <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "700" }}>  more</Text>
              )}
            </Text>
          </Pressable>
        )}
        {hashtags.length > 0 && (
          <View style={S.hashtagRow}>
            {hashtags.map((t, i) => (
              <Pressable key={i} onPress={() => router.push(`/search?q=${encodeURIComponent(t)}` as any)}>
                <Text style={S.hashtag}>{t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Right actions */}
      <View style={S.sideActions}>
        <Pressable onPress={handleLike} style={S.sideBtn} accessibilityRole="button" accessibilityState={{ selected: isLiked }} accessibilityLabel={isLiked ? "Unlike" : "Like"}>
          <Animated.View style={[S.sideBtnCircle, isLiked && S.sideBtnCircleActive, { transform: [{ scale: likeScale }] }]}>
            <AntDesign name={(isLiked ? "heart" : "hearto") as any} size={24} color={isLiked ? "#ff3b5c" : "#fff"} />
          </Animated.View>
          <Text style={[S.sideCount, isLiked && { color: "#ff3b5c" }]} accessibilityLiveRegion="polite">{formatCount(likesCount)}</Text>
        </Pressable>

        <Pressable onPress={openComments} style={S.sideBtn} accessibilityRole="button" accessibilityLabel="Open comments">
          <View style={S.sideBtnCircle}>
            <Feather name="message-circle" size={24} color="#fff" />
          </View>
          <Text style={S.sideCount}>{formatCount(commentsCount)}</Text>
        </Pressable>

        <Pressable onPress={handleShare} style={S.sideBtn} accessibilityRole="button" accessibilityLabel="Share reel">
          <View style={S.sideBtnCircle}>
            <Feather name="share-2" size={22} color="#fff" />
          </View>
          <Text style={S.sideCount}>{formatCount(sharesCount)}</Text>
        </Pressable>

        <Pressable onPress={handleSave} style={S.sideBtn} accessibilityRole="button" accessibilityState={{ selected: isSaved }} accessibilityLabel={isSaved ? "Remove from saved" : "Save reel"}>
          <View style={[S.sideBtnCircle, isSaved && { backgroundColor: "rgba(167,139,250,0.25)", borderColor: "rgba(167,139,250,0.5)" }]}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={22} color={isSaved ? "#a78bfa" : "#fff"} />
          </View>
          <Text style={[S.sideCount, isSaved && { color: "#a78bfa" }]}>{isSaved ? "Saved" : "Save"}</Text>
        </Pressable>

        <Pressable onPress={onToggleMute} style={S.sideBtn} accessibilityRole="button" accessibilityState={{ selected: isMuted }} accessibilityLabel={isMuted ? "Unmute" : "Mute"}>
          <View style={S.sideBtnCircle}>
            <Feather name={isMuted ? "volume-x" : "volume-2"} size={20} color="#fff" />
          </View>
        </Pressable>
      </View>

      <ReelComments
        postId={item.id} postContent={item.content ?? ""} visible={commentOpen}
        onClose={() => setCommentOpen(false)} userId={user?.id ?? ""}
        onCountChange={setCommentsCount} onRequireAuth={() => setAuthPrompt(true)}
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
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [tabFocused, setTabFocused] = useState(true);
  const [reels, setReels] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());

  // Persisted global mute preference
  useEffect(() => {
    AsyncStorage.getItem(MUTE_KEY).then(v => { if (v !== null) setIsMuted(v === "1"); }).catch(() => {});
  }, []);
  const toggleMute = useCallback(() => {
    setIsMuted(m => {
      const next = !m;
      AsyncStorage.setItem(MUTE_KEY, next ? "1" : "0").catch(() => {});
      return next;
    });
  }, []);

  // Stop all videos when navigating away from this tab
  useFocusEffect(
    useCallback(() => {
      setTabFocused(true);
      return () => {
        setTabFocused(false);
        setVisibleIndex(-1); // force all videos to pause
      };
    }, [])
  );

  const { data: firstPage = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reels", user?.id ?? ""],
    queryFn: () => fetchReels(user?.id ?? ""),
    enabled: true,
  });

  // Sync first page into local list; reset on user change / refetch
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
      setReels(prev => {
        const seen = new Set(prev.map(p => p.id));
        const fresh = next.filter(p => !seen.has(p.id));
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

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (!tabFocused) return;
    const first = viewableItems.find((v: any) => v.isViewable);
    if (first != null) {
      const idx = first.index ?? 0;
      setVisibleIndex(idx);
      // Count a view once per reel per session
      const reel = reels[idx];
      if (reel && !viewedRef.current.has(reel.id)) {
        viewedRef.current.add(reel.id);
        incrementPostViews(reel.id);
      }
    }
  }, [tabFocused, reels]);

  const viewabilityConfigCallbackPairs = useRef([{
    viewabilityConfig: { itemVisiblePercentThreshold: 65 },
    onViewableItemsChanged,
  }]);
  // Keep the pair's callback fresh without recreating the ref object
  useEffect(() => {
    viewabilityConfigCallbackPairs.current[0].onViewableItemsChanged = onViewableItemsChanged;
  }, [onViewableItemsChanged]);

  return (
    <View style={[S.container, !isWeb && { backgroundColor: "#000" }]}>
      {Platform.OS !== "web" && <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />}

      {/* Floating header */}
      <View style={[S.header, { paddingTop: isWeb ? 16 : insets.top + 4 }]}>
        <Text style={S.headerTitle}>Reels</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={toggleMute} style={S.createBtn} accessibilityRole="button" accessibilityLabel={isMuted ? "Unmute reels" : "Mute reels"}>
            <Feather name={isMuted ? "volume-x" : "volume-2"} size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/create" as any)} style={S.createBtn} accessibilityRole="button" accessibilityLabel="Create reel">
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={S.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : isError ? (
        <View style={S.emptyWrap}>
          <LinearGradient colors={["#1a0533", "#0f0a1e"]} style={StyleSheet.absoluteFill} />
          <Feather name="alert-circle" size={56} color="#ef4444" />
          <Text style={S.emptyTitle}>Couldn't load reels</Text>
          <Text style={S.emptyDesc}>{(error as any)?.message ?? "Something went wrong."}</Text>
          <Pressable onPress={() => refetch()} style={S.createFirstBtn} accessibilityRole="button" accessibilityLabel="Retry">
            <Feather name="refresh-cw" size={16} color="#fff" />
            <Text style={S.createFirstText}>Retry</Text>
          </Pressable>
        </View>
      ) : reels.length === 0 ? (
        <View style={S.emptyWrap}>
          <LinearGradient colors={["#1a0533", "#0f0a1e"]} style={StyleSheet.absoluteFill} />
          <Feather name="film" size={64} color="rgba(255,255,255,0.25)" />
          <Text style={S.emptyTitle}>No Reels Yet</Text>
          <Text style={S.emptyDesc}>Be the first to share a reel!</Text>
          <Pressable onPress={() => router.push("/(tabs)/create" as any)} style={S.createFirstBtn} accessibilityRole="button" accessibilityLabel="Create reel">
            <Feather name="plus" size={18} color="#fff" />
            <Text style={S.createFirstText}>Create Reel</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/index" as any)} style={[S.createFirstBtn, { backgroundColor: "rgba(255,255,255,0.12)", marginTop: 0 }]} accessibilityRole="button" accessibilityLabel="Browse posts">
            <Feather name="home" size={16} color="#fff" />
            <Text style={S.createFirstText}>Browse Posts</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <ReelCard
              item={item}
              isActive={tabFocused && visibleIndex === index}
              isMuted={isMuted}
              onToggleMute={toggleMute}
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
                <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>You're all caught up</Text>
              </View>
            ) : null
          }
          snapToInterval={REEL_HEIGHT}
          decelerationRate={Platform.OS === "ios" ? 0.992 : "fast"}
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          pagingEnabled={Platform.OS !== "web"}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
          getItemLayout={(_, index) => ({ length: REEL_HEIGHT, offset: REEL_HEIGHT * index, index })}
          removeClippedSubviews={Platform.OS !== "web"}
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
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 8,
  },
  headerTitle: {
    color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  createBtn: { backgroundColor: "rgba(124,58,237,0.9)", borderRadius: 20, padding: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  reelCard: { position: "relative", overflow: "hidden", backgroundColor: "#000", alignSelf: "center" },
  bufferOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 15 },
  retryChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10,
  },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 10 },
  pauseIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  doubleTapHeart: { position: "absolute", top: "40%", left: "50%", marginLeft: -40, zIndex: 30 },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0, height: 130, zIndex: 5 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 360, zIndex: 5 },
  progressBar: { position: "absolute", top: 0, left: 0, right: 0, height: 18, justifyContent: "center", backgroundColor: "transparent", zIndex: 20 },
  progressFill: { height: 2.5, backgroundColor: "#7c3aed" },
  orientBadge: {
    position: "absolute", top: 8, right: 8, zIndex: 25,
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, padding: 4,
  },
  followBtn: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", marginBottom: 8 },
  followBtnActive: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)" },
  followBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  bottomLeft: { position: "absolute", bottom: 100, left: 16, right: 96, zIndex: 10 },
  authorRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  authorName: {
    color: "#fff", fontWeight: "700", fontSize: 15,
    textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  authorHandle: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  caption: {
    color: "#fff", fontSize: 14, lineHeight: 20, marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  hashtagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hashtag: { color: "#a78bfa", fontSize: 13, fontWeight: "600" },
  sideActions: { position: "absolute", right: 12, bottom: 110, alignItems: "center", gap: 22, zIndex: 10 },
  sideBtn: { alignItems: "center", gap: 5 },
  sideBtnCircle: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  sideBtnCircleActive: { backgroundColor: "rgba(255,59,92,0.18)", borderColor: "rgba(255,59,92,0.4)" },
  sideCount: {
    color: "#fff", fontSize: 12, fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 16 },
  emptyDesc: { color: "rgba(255,255,255,0.5)", fontSize: 15, textAlign: "center" },
  createFirstBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7c3aed", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, marginTop: 10 },
  createFirstText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
