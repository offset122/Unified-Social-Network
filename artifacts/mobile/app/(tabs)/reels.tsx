import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Platform, Dimensions, StatusBar, Share, Animated, Image, Modal,
  TextInput, Alert,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Link } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  fetchReels, likePost, unlikePost, savePost, unsavePost,
  createComment, fetchComments, resolveMediaUrl, formatCount, timeAgo,
  incrementPostViews, type Post, type Comment, type Profile,
} from "@/lib/db";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const REEL_HEIGHT = Platform.OS === "web" ? 620 : SCREEN_HEIGHT;

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

function VideoProgress({ progress, duration }: { progress: number; duration: number }) {
  const pct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  return <View style={S.progressBar}><View style={[S.progressFill, { width: `${pct * 100}%` }]} /></View>;
}

function ReelComments({ postId, visible, onClose, userId, onCountChange }: {
  postId: string; visible: boolean; onClose: () => void; userId: string; onCountChange?: (n: number) => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { data: comments = [] } = useQuery({
    queryKey: ["reel-comments", postId],
    queryFn: () => fetchComments(postId),
    enabled: visible,
  });

  useEffect(() => { if (comments.length > 0) onCountChange?.(comments.length); }, [comments.length]);

  const submit = async () => {
    if (!text.trim() || !userId) return;
    setSubmitting(true);
    try {
      await createComment(postId, userId, text.trim());
      setText("");
      qc.invalidateQueries({ queryKey: ["reel-comments", postId] });
      qc.invalidateQueries({ queryKey: ["reels"] });
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#18181b" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#3f3f46" }}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>Comments ({(comments as Comment[]).length})</Text>
          <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color="#fff" /></Pressable>
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
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3f3f46" }}>
          <TextInput
            style={{ flex: 1, backgroundColor: "#27272a", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontSize: 14 }}
            placeholder="Add a comment..." placeholderTextColor="#71717a"
            value={text} onChangeText={setText} returnKeyType="send" onSubmitEditing={submit}
          />
          <Pressable onPress={submit} disabled={submitting || !text.trim()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: text.trim() ? "#7c3aed" : "#3f3f46", alignItems: "center", justifyContent: "center" }}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ReelCard({ item, isVisible }: { item: Post; isVisible: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const videoRef = useRef<Video>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiked, setIsLiked] = useState(item.is_liked ?? false);
  const [likesCount, setLikesCount] = useState(item.likes_count);
  const [isSaved, setIsSaved] = useState(item.is_saved ?? false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentsCount, setCommentsCount] = useState(item.comments_count);
  const [sharesCount, setSharesCount] = useState(item.shares_count);
  const pauseOpacity = useRef(new Animated.Value(0)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const doubleTapAnim = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  const profile = item.profiles as Profile | undefined;
  const videoUri = item.media_urls?.[0] ? resolveMediaUrl(item.media_urls[0]) : null;

  const videoAspect = item.media_width && item.media_height ? item.media_width / item.media_height : null;
  const isPortrait = videoAspect !== null && videoAspect < 1;
  const isLandscape = videoAspect !== null && videoAspect > 1.3;

  useEffect(() => {
    if (!videoRef.current) return;
    if (isVisible && !isPaused) videoRef.current.playAsync().catch(() => {});
    else videoRef.current.pauseAsync().catch(() => {});
  }, [isVisible, isPaused]);

  useEffect(() => {
    if (isVisible) incrementPostViews(item.id);
  }, [isVisible]);

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
    if (now - lastTap.current < 300) {
      // Double tap = like
      if (!isLiked) {
        setIsLiked(true);
        setLikesCount(c => c + 1);
        animateLike();
        animateDoubleTapHeart();
        likePost(user?.id ?? "", item.id).catch(() => { setIsLiked(false); setLikesCount(c => c - 1); });
      } else {
        animateDoubleTapHeart();
      }
    } else {
      // Single tap = pause
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
    if (!user?.id) return;
    const next = !isLiked;
    setIsLiked(next);
    setLikesCount(c => c + (next ? 1 : -1));
    animateLike();
    const fn = next ? likePost : unlikePost;
    fn(user.id, item.id).catch(() => { setIsLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); });
  };

  const handleSave = () => {
    if (!user?.id) return;
    const next = !isSaved;
    setIsSaved(next);
    const fn = next ? savePost : unsavePost;
    fn(user.id, item.id).catch(() => setIsSaved(!next));
  };

  const handleShare = async () => {
    try {
      setSharesCount(c => c + 1);
      await Share.share({ message: `🎬 Check out this reel by @${profile?.username}: ${item.content}` });
    } catch { setSharesCount(c => c - 1); }
  };

  const hashtags = (item.content ?? "").split(/\s+/).filter(w => w.startsWith("#")).slice(0, 5);
  const caption = (item.content ?? "").split(/\s+/).filter(w => !w.startsWith("#")).join(" ");

  // Determine video resize mode and container
  const getVideoStyle = (): any => {
    if (isLandscape) {
      return { position: "absolute", left: 0, right: 0, top: "50%", aspectRatio: videoAspect!, transform: [{ translateY: -(SCREEN_WIDTH / videoAspect!) / 2 }] };
    }
    return StyleSheet.absoluteFill;
  };

  return (
    <View style={[S.reelCard, { width: SCREEN_WIDTH, height: REEL_HEIGHT }]}>
      {videoUri ? (
        <Pressable onPress={handleTap} style={StyleSheet.absoluteFill}>
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={getVideoStyle()}
            resizeMode={isLandscape ? ResizeMode.CONTAIN : ResizeMode.COVER}
            isLooping isMuted={isMuted}
            shouldPlay={isVisible && !isPaused}
            onPlaybackStatusUpdate={(s: AVPlaybackStatus) => {
              if (!s.isLoaded) return;
              setPosition(s.positionMillis ?? 0);
              setDuration(s.durationMillis ?? 0);
            }}
            useNativeControls={false}
          />
        </Pressable>
      ) : (
        <LinearGradient colors={["#1a0533", "#2d1b69", "#0f0a1e"]} style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Feather name="film" size={56} color="rgba(255,255,255,0.2)" />
          </View>
        </LinearGradient>
      )}

      {/* Double-tap heart */}
      <Animated.View style={[S.doubleTapHeart, { opacity: doubleTapAnim, transform: [{ scale: doubleTapAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1.3, 1] }) }] }]} pointerEvents="none">
        <Feather name="heart" size={80} color="#ff3b5c" />
      </Animated.View>

      <Animated.View style={[S.pauseOverlay, { opacity: pauseOpacity }]} pointerEvents="none">
        <Feather name={isPaused ? "play" : "pause"} size={56} color="#fff" />
      </Animated.View>

      <LinearGradient colors={["rgba(0,0,0,0.5)", "transparent"]} style={S.topGrad} pointerEvents="none" />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={S.bottomGrad} pointerEvents="none" />

      <VideoProgress progress={position} duration={duration} />

      {/* Aspect ratio indicator */}
      {videoAspect !== null && (
        <View style={S.orientBadge}>
          <Feather name={isPortrait ? "smartphone" : "monitor"} size={9} color="rgba(255,255,255,0.7)" />
          {videoAspect !== null && <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, marginLeft: 2 }}>{isPortrait ? "9:16" : isLandscape ? "16:9" : "1:1"}</Text>}
        </View>
      )}

      {/* Bottom info */}
      <View style={S.bottomLeft}>
        <Link href={`/user/${item.author_id}` as any} asChild>
          <Pressable style={S.authorRow}>
            <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={42} />
            <View style={{ marginLeft: 10 }}>
              <Text style={S.authorName}>{profile?.display_name ?? "User"}</Text>
              <Text style={S.authorHandle}>@{profile?.username ?? "user"}</Text>
            </View>
          </Pressable>
        </Link>
        {!!caption && <Text style={S.caption} numberOfLines={3}>{caption}</Text>}
        {hashtags.length > 0 && (
          <View style={S.hashtagRow}>
            {hashtags.map((t, i) => <Text key={i} style={S.hashtag}>{t}</Text>)}
          </View>
        )}
      </View>

      {/* Right actions */}
      <View style={S.sideActions}>
        <Pressable onPress={handleLike} style={S.sideBtn}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Feather name={isLiked ? "heart" : "heart"} size={30} color={isLiked ? "#ff3b5c" : "#fff"} />
          </Animated.View>
          <Text style={S.sideCount}>{formatCount(likesCount)}</Text>
        </Pressable>

        <Pressable onPress={() => setCommentOpen(true)} style={S.sideBtn}>
          <Feather name="message-circle" size={28} color="#fff" />
          <Text style={S.sideCount}>{formatCount(commentsCount)}</Text>
        </Pressable>

        <Pressable onPress={handleShare} style={S.sideBtn}>
          <Feather name="share-2" size={26} color="#fff" />
          <Text style={S.sideCount}>{formatCount(sharesCount)}</Text>
        </Pressable>

        <Pressable onPress={handleSave} style={S.sideBtn}>
          <Feather name="bookmark" size={26} color={isSaved ? "#a78bfa" : "#fff"}
            style={isSaved ? { textShadowColor: "#a78bfa55", textShadowRadius: 8 } : undefined} />
          <Text style={[S.sideCount, isSaved && { color: "#a78bfa" }]}>{isSaved ? "Saved" : "Save"}</Text>
        </Pressable>

        <Pressable onPress={() => setIsMuted(m => !m)} style={S.sideBtn}>
          <Feather name={isMuted ? "volume-x" : "volume-2"} size={22} color="#fff" />
        </Pressable>
      </View>

      <ReelComments
        postId={item.id} visible={commentOpen}
        onClose={() => setCommentOpen(false)}
        userId={user?.id ?? ""}
        onCountChange={setCommentsCount}
      />
    </View>
  );
}

export default function ReelsScreen() {
  const { user, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [visibleIndex, setVisibleIndex] = useState(0);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["reels"],
    queryFn: () => fetchReels(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    const first = viewableItems.find((v: any) => v.isViewable);
    if (first != null) setVisibleIndex(first.index ?? 0);
  }, []);

  const viewabilityConfigCallbackPairs = useRef([{
    viewabilityConfig: { itemVisiblePercentThreshold: 60 },
    onViewableItemsChanged,
  }]);

  if (!isAuthenticated) return null;

  return (
    <View style={S.container}>
      {Platform.OS !== "web" && <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />}

      <View style={[S.header, { paddingTop: isWeb ? 16 : insets.top + 4 }]}>
        <Text style={S.headerTitle}>Reels</Text>
        <Pressable onPress={() => router.push("/(tabs)/create" as any)} style={S.createBtn}>
          <Feather name="plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={S.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : (data as Post[]).length === 0 ? (
        <View style={S.emptyWrap}>
          <LinearGradient colors={["#1a0533", "#0f0a1e"]} style={StyleSheet.absoluteFill} />
          <Feather name="film" size={64} color="rgba(255,255,255,0.25)" />
          <Text style={S.emptyTitle}>No Reels Yet</Text>
          <Text style={S.emptyDesc}>Be the first to share a reel!</Text>
          <Pressable onPress={() => router.push("/(tabs)/create" as any)} style={S.createFirstBtn}>
            <Feather name="plus" size={18} color="#fff" />
            <Text style={S.createFirstText}>Create Reel</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data as Post[]}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => <ReelCard item={item} isVisible={visibleIndex === index} />}
          snapToInterval={REEL_HEIGHT}
          decelerationRate="fast"
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          pagingEnabled={Platform.OS !== "web"}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
          getItemLayout={(_, index) => ({ length: REEL_HEIGHT, offset: REEL_HEIGHT * index, index })}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  createBtn: { backgroundColor: "#7c3aed", borderRadius: 20, padding: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  reelCard: { position: "relative", overflow: "hidden", backgroundColor: "#000" },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 10 },
  doubleTapHeart: { position: "absolute", top: "40%", left: "50%", marginLeft: -40, zIndex: 30 },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0, height: 130, zIndex: 5 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 340, zIndex: 5 },
  progressBar: { position: "absolute", top: 0, left: 0, right: 0, height: 2.5, backgroundColor: "rgba(255,255,255,0.2)", zIndex: 20 },
  progressFill: { height: "100%", backgroundColor: "#7c3aed" },
  orientBadge: { position: "absolute", top: 8, right: 8, zIndex: 25, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, padding: 4 },
  bottomLeft: { position: "absolute", bottom: 90, left: 16, right: 96, zIndex: 10 },
  authorRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  authorName: { color: "#fff", fontWeight: "700", fontSize: 15, textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  authorHandle: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  caption: { color: "#fff", fontSize: 14, lineHeight: 20, marginBottom: 8, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  hashtagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hashtag: { color: "#a78bfa", fontSize: 13, fontWeight: "600" },
  sideActions: { position: "absolute", right: 12, bottom: 90, alignItems: "center", gap: 20, zIndex: 10 },
  sideBtn: { alignItems: "center", gap: 4 },
  sideCount: { color: "#fff", fontSize: 12, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 16 },
  emptyDesc: { color: "rgba(255,255,255,0.5)", fontSize: 15, textAlign: "center" },
  createFirstBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7c3aed", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, marginTop: 10 },
  createFirstText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
