import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Platform, Image, Alert, ScrollView, Dimensions, Animated,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import {
  fetchProfile, fetchUserPosts, followUser, unfollowUser, isFollowing,
  blockUser, getOrCreateDM, resolveMediaUrl, formatCount, timeAgo,
  deletePost, updatePostVisibility,
  type Post, type Profile,
} from "@/lib/db";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const isTablet = SCREEN_WIDTH >= 768;
const GRID_COLS = isTablet ? 4 : 3;
const GRID_GAP = 2;
const GRID_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size, avatarUrl }: { name: string; size: number; avatarUrl?: string | null }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (avatarUrl && !err) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: "#fff", overflow: "hidden" }}>
        <Image source={{ uri: resolveMediaUrl(avatarUrl) }} style={{ width: "100%", height: "100%" }}
          onError={() => setErr(true)} resizeMode="cover" />
      </View>
    );
  }
  return (
    <LinearGradient colors={["#7c3aed", "#4f46e5"]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.35, fontWeight: "800" }}>{initials}</Text>
    </LinearGradient>
  );
}

// ─── Profile Post Card (list view) ───────────────────────────────────────────

function ProfilePostCard({ post, isOwn, userId, colors, onDeleted }: {
  post: Post; isOwn: boolean; userId: string; colors: any; onDeleted?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [visibility, setVisibility] = useState(post.visibility ?? "public");
  const videoRef = useRef<Video>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const mediaUrls = (post.media_urls ?? []).map(resolveMediaUrl).filter(Boolean);
  const isVideo = post.media_type === "video";
  const isImage = post.media_type === "image";
  const isText = !isVideo && !isImage;
  const aspectRatio = post.media_width && post.media_height
    ? Math.min(Math.max(post.media_width / post.media_height, 0.5625), 1.91)
    : 1;

  const handleMore = () => {
    if (!isOwn) return;
    Alert.alert("Post Options", undefined, [
      {
        text: "Change Visibility",
        onPress: () => {
          Alert.alert("Set Visibility", "Who can see this post?", [
            { text: "Public", onPress: async () => { setVisibility("public"); await updatePostVisibility(post.id, userId, "public"); qc.invalidateQueries({ queryKey: ["user-posts"] }); } },
            { text: "Followers Only", onPress: async () => { setVisibility("followers"); await updatePostVisibility(post.id, userId, "followers"); qc.invalidateQueries({ queryKey: ["user-posts"] }); } },
            { text: "Private", onPress: async () => { setVisibility("private"); await updatePostVisibility(post.id, userId, "private"); qc.invalidateQueries({ queryKey: ["user-posts"] }); } },
            { text: "Cancel", style: "cancel" },
          ]);
        }
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
                  await deletePost(post.id, userId);
                  onDeleted?.(post.id);
                  qc.invalidateQueries({ queryKey: ["user-posts"] });
                } catch { Alert.alert("Error", "Could not delete post"); }
              }
            },
          ]);
        }
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[PC.card, { backgroundColor: colors.card, borderColor: colors.border }, isText && PC.textCard]}>
      {/* Left accent for text posts */}
      {isText && <View style={[PC.textAccent, { backgroundColor: colors.primary }]} />}

      {/* Header */}
      <View style={PC.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {isVideo && (
              <View style={PC.typePill}>
                <Feather name="video" size={10} color="#fff" />
                <Text style={PC.typePillText}>Video</Text>
              </View>
            )}
            {isText && (
              <View style={[PC.typePill, { backgroundColor: "rgba(99,102,241,0.8)" }]}>
                <Feather name="type" size={10} color="#fff" />
                <Text style={PC.typePillText}>Text</Text>
              </View>
            )}
            {isImage && mediaUrls.length > 1 && (
              <View style={[PC.typePill, { backgroundColor: "rgba(16,185,129,0.8)" }]}>
                <Feather name="image" size={10} color="#fff" />
                <Text style={PC.typePillText}>{mediaUrls.length} Photos</Text>
              </View>
            )}
          </View>
          <Text style={[PC.cardTime, { color: colors.mutedForeground }]}>{timeAgo(post.created_at)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isOwn && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Feather
                name={visibility === "public" ? "globe" : visibility === "followers" ? "users" : "lock"}
                size={12} color={colors.mutedForeground}
              />
              <Text style={{ color: colors.mutedForeground, fontSize: 11, textTransform: "capitalize" }}>{visibility}</Text>
            </View>
          )}
          {isOwn && (
            <Pressable hitSlop={8} onPress={handleMore}>
              <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Text content */}
      {!!post.content && (
        isText ? (
          <View style={[PC.textBody, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[PC.textBodyText, { color: colors.foreground }]}>{post.content}</Text>
          </View>
        ) : (
          <Text style={[PC.caption, { color: colors.foreground }]} numberOfLines={3}>{post.content}</Text>
        )
      )}

      {/* Video */}
      {isVideo && mediaUrls.length > 0 && (
        <View style={[PC.mediaBox, { aspectRatio }]}>
          <Video
            ref={videoRef}
            source={{ uri: mediaUrls[0] }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={videoPlaying}
            isLooping
            useNativeControls={videoPlaying}
          />
          {!videoPlaying && (
            <Pressable style={PC.playOverlay} onPress={() => setVideoPlaying(true)}>
              <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
              <View style={PC.playBtn}>
                <Feather name="play" size={28} color="#fff" />
              </View>
              <View style={PC.videoDuration}>
                <Feather name="video" size={11} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Tap to Play</Text>
              </View>
            </Pressable>
          )}
        </View>
      )}

      {/* Images */}
      {isImage && mediaUrls.length > 0 && (
        <View style={[PC.mediaBox, { aspectRatio }]}>
          <Image source={{ uri: mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {mediaUrls.length > 1 && (
            <View style={PC.imageMore}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>+{mediaUrls.length - 1}</Text>
            </View>
          )}
        </View>
      )}

      {/* Stats */}
      <View style={[PC.statsRow, { borderTopColor: colors.border }]}>
        <View style={PC.statItem}>
          <AntDesign name={"hearto" as any} size={14} color={colors.mutedForeground} />
          <Text style={[PC.statText, { color: colors.mutedForeground }]}>{formatCount(post.likes_count)}</Text>
        </View>
        <View style={PC.statItem}>
          <Feather name="message-circle" size={14} color={colors.mutedForeground} />
          <Text style={[PC.statText, { color: colors.mutedForeground }]}>{formatCount(post.comments_count)}</Text>
        </View>
        <View style={PC.statItem}>
          <Feather name="eye" size={14} color={colors.mutedForeground} />
          <Text style={[PC.statText, { color: colors.mutedForeground }]}>{formatCount(post.views_count)}</Text>
        </View>
      </View>
    </View>
  );
}

const PC = StyleSheet.create({
  card: {
    marginHorizontal: 12, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  textCard: {},
  textAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, paddingBottom: 8 },
  cardTime: { fontSize: 12, marginTop: 2 },
  typePill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  typePillText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  caption: { paddingHorizontal: 12, paddingBottom: 10, fontSize: 14, lineHeight: 21 },
  textBody: {
    margin: 12, marginTop: 0, borderRadius: 12, padding: 14,
    borderWidth: 1,
  },
  textBodyText: { fontSize: 16, lineHeight: 24, fontWeight: "500" },
  mediaBox: { width: "100%", overflow: "hidden", backgroundColor: "#111" },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  playBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(124,58,237,0.85)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#7c3aed", shadowOpacity: 0.5, shadowRadius: 12,
  },
  videoDuration: {
    position: "absolute", bottom: 10, left: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  imageMore: {
    position: "absolute", top: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12, paddingVertical: 8, borderBottomLeftRadius: 12,
  },
  statsRow: {
    flexDirection: "row", alignItems: "center", gap: 18,
    padding: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { fontSize: 13, fontWeight: "500" },
});

// ─── Grid Item ────────────────────────────────────────────────────────────────

function GridItem({ post, router, colors, isOwn, userId, onDeleted }: {
  post: Post; router: any; colors: any; isOwn: boolean; userId: string; onDeleted?: (id: string) => void;
}) {
  const media = post.media_urls?.[0] ? resolveMediaUrl(post.media_urls[0]) : null;
  const isVideo = post.media_type === "video";
  const isText = !post.media_type && (!post.media_urls || post.media_urls.length === 0);

  const handleLongPress = () => {
    if (!isOwn) return;
    Alert.alert("Post Options", undefined, [
      {
        text: "Change Visibility",
        onPress: () => {
          Alert.alert("Set Visibility", undefined, [
            { text: "Public", onPress: async () => { await updatePostVisibility(post.id, userId, "public"); } },
            { text: "Followers Only", onPress: async () => { await updatePostVisibility(post.id, userId, "followers"); } },
            { text: "Private", onPress: async () => { await updatePostVisibility(post.id, userId, "private"); } },
            { text: "Cancel", style: "cancel" },
          ]);
        }
      },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          Alert.alert("Delete Post?", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: async () => {
              await deletePost(post.id, userId);
              onDeleted?.(post.id);
            }},
          ]);
        }
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Pressable
      style={[GS.item, { width: GRID_SIZE, height: GRID_SIZE }]}
      onPress={() => router.push(`/post/${post.id}` as any)}
      onLongPress={handleLongPress}
    >
      {isText ? (
        <LinearGradient colors={["#1e1b4b", "#2d1b69"]} style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, padding: 8, justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 11, lineHeight: 16 }} numberOfLines={4}>{post.content}</Text>
          </View>
        </LinearGradient>
      ) : media ? (
        <Image source={{ uri: media }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }]}>
          <Feather name="file-text" size={20} color={colors.mutedForeground} />
        </View>
      )}

      {isVideo && (
        <View style={GS.videoBadge}>
          <Feather name="play" size={11} color="#fff" />
        </View>
      )}

      {post.media_urls && post.media_urls.length > 1 && (
        <View style={GS.multiImgBadge}>
          <Feather name="copy" size={10} color="#fff" />
        </View>
      )}

      <LinearGradient colors={["transparent", "rgba(0,0,0,0.55)"]} style={GS.overlay}>
        <AntDesign name="heart" size={10} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{formatCount(post.likes_count)}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const GS = StyleSheet.create({
  item: { position: "relative", overflow: "hidden", backgroundColor: "#111" },
  videoBadge: {
    position: "absolute", top: 5, right: 5,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, padding: 3,
  },
  multiImgBadge: {
    position: "absolute", top: 5, left: 5,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, padding: 3,
  },
  overlay: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 30,
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 5, paddingBottom: 4, gap: 3,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [postTab, setPostTab] = useState<"posts" | "reels">("posts");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [followLoading, setFollowLoading] = useState(false);
  const [postList, setPostList] = useState<Post[]>([]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["user-posts", userId, postTab],
    queryFn: () => fetchUserPosts(userId as string, postTab === "reels"),
    enabled: !!userId,
  });

  React.useEffect(() => {
    setPostList(posts as Post[]);
  }, [posts]);

  const { data: following = false, refetch: refetchFollow } = useQuery({
    queryKey: ["is-following", user?.id, userId],
    queryFn: () => isFollowing(user?.id ?? "", userId as string),
    enabled: !!user?.id && !!userId && user.id !== userId,
  });

  if (profileLoading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color="#7c3aed" /></View>;
  }
  if (!profile) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <Text style={{ color: colors.mutedForeground }}>User not found</Text>
    </View>;
  }

  const isOwnProfile = user?.id === userId;

  const handleFollow = async () => {
    if (!user?.id || isOwnProfile) return;
    setFollowLoading(true);
    try {
      if (following) await unfollowUser(user.id, userId as string);
      else await followUser(user.id, userId as string);
      refetchFollow();
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    } finally { setFollowLoading(false); }
  };

  const handleMessage = async () => {
    if (!user?.id) return;
    try {
      const convoId = await getOrCreateDM(user.id, userId as string);
      router.push({ pathname: `/chat/${convoId}`, params: { peerName: profile.display_name, peerId: userId } } as any);
    } catch { Alert.alert("Error", "Could not start conversation"); }
  };

  const handleBlock = () => {
    Alert.alert("Block User", `Block @${profile.username}? They won't be able to message you.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: async () => {
        if (!user?.id) return;
        await blockUser(user.id, userId as string);
        router.back();
      }},
    ]);
  };

  const handleReport = () => {
    Alert.alert("Report User", `Why are you reporting @${profile.username}?`, [
      { text: "Spam", onPress: () => submitReport("spam") },
      { text: "Harassment", onPress: () => submitReport("harassment") },
      { text: "Inappropriate content", onPress: () => submitReport("inappropriate") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const submitReport = async (reason: string) => {
    if (!user?.id) return;
    try {
      await supabase.from("notifications").insert({
        user_id: userId, actor_id: user.id, type: "report",
        post_id: null, comment_id: null, is_read: false,
      } as any);
    } catch {}
    Alert.alert("Reported", "Thank you. Our team will review this report.");
  };

  const handleDeleted = (id: string) => {
    setPostList(p => p.filter(x => x.id !== id));
  };

  const ListHeader = () => (
    <>
      {/* Cover */}
      <LinearGradient colors={["#1e1b4b", "#2d1b69", "#1e1b4b"]} style={[styles.cover, { backgroundColor: colors.secondary }]}>
        {profile.cover_url && <Image source={{ uri: resolveMediaUrl(profile.cover_url) }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View style={styles.avatarPosn}>
          <Avatar name={profile.display_name} size={88} avatarUrl={profile.avatar_url} />
        </View>
      </LinearGradient>

      {/* Info */}
      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.displayName, { color: colors.foreground }]}>{profile.display_name}</Text>
              {profile.is_admin && <Feather name="shield" size={16} color="#7c3aed" />}
            </View>
            <Text style={[styles.username, { color: colors.mutedForeground }]}>@{profile.username}</Text>
          </View>
        </View>

        {profile.bio && <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text>}

        <View style={[styles.statsRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(profile.posts_count)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Posts</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(profile.followers_count)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(profile.following_count)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
          </View>
        </View>

        {!isOwnProfile && (
          <View style={styles.actionBtns}>
            <Pressable onPress={handleFollow} disabled={followLoading}
              style={[styles.actionBtn, { backgroundColor: following ? colors.secondary : colors.primary, borderColor: colors.border, borderWidth: following ? 1.5 : 0, flex: 2 }]}>
              {followLoading ? <ActivityIndicator color={following ? colors.primary : "#fff"} size="small" /> : (
                <>
                  <Feather name={following ? "user-check" : "user-plus"} size={15} color={following ? colors.primary : "#fff"} />
                  <Text style={[styles.actionBtnText, { color: following ? colors.primary : "#fff" }]}>
                    {following ? "Following" : "Follow"}
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable onPress={handleMessage}
              style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1.5, flex: 1 }]}>
              <Feather name="message-circle" size={15} color={colors.foreground} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Message</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Tabs + View Mode Toggle */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", flex: 1 }}>
          {(["posts", "reels"] as const).map(tab => (
            <Pressable key={tab} onPress={() => setPostTab(tab)} style={styles.tab}>
              <Feather name={tab === "posts" ? "grid" : "film"} size={17}
                color={postTab === tab ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: postTab === tab ? colors.primary : colors.mutedForeground },
                postTab === tab && { fontWeight: "700" }]}>
                {tab === "posts" ? "Posts" : "Reels"}
              </Text>
              {postTab === tab && <View style={[styles.tabLine, { backgroundColor: colors.primary }]} />}
            </Pressable>
          ))}
        </View>
        {/* View Mode toggle */}
        <View style={{ flexDirection: "row", gap: 2, paddingRight: 12, alignItems: "center" }}>
          <Pressable
            onPress={() => setViewMode("grid")}
            style={[styles.viewModeBtn, viewMode === "grid" && { backgroundColor: colors.primary + "22" }]}
          >
            <Feather name="grid" size={16} color={viewMode === "grid" ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => setViewMode("list")}
            style={[styles.viewModeBtn, viewMode === "list" && { backgroundColor: colors.primary + "22" }]}
          >
            <Feather name="list" size={16} color={viewMode === "list" ? colors.primary : colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </>
  );

  const EmptyPosts = () => (
    <View style={{ alignItems: "center", paddingVertical: 56, gap: 12 }}>
      <LinearGradient colors={["#1e1b4b", "#2d1b69"]}
        style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" }}>
        <Feather name={postTab === "posts" ? "grid" : "film"} size={32} color="rgba(255,255,255,0.4)" />
      </LinearGradient>
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700" }}>No {postTab} yet</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
        {isOwnProfile ? "Share your first post!" : "Nothing posted yet."}
      </Text>
    </View>
  );

  if (viewMode === "list") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.topBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.topTitle, { color: colors.foreground }]}>{profile.username}</Text>
          {!isOwnProfile ? (
            <Pressable hitSlop={8} style={styles.topBtn}
              onPress={() => Alert.alert("Options", undefined, [
                { text: "Block", style: "destructive", onPress: handleBlock },
                { text: "Report", onPress: handleReport },
                { text: "Cancel", style: "cancel" },
              ])}>
              <Feather name="more-horizontal" size={22} color={colors.foreground} />
            </Pressable>
          ) : <View style={styles.topBtn} />}
        </View>

        <FlatList
          data={postList}
          keyExtractor={p => p.id}
          ListHeaderComponent={<ListHeader />}
          renderItem={({ item: p }) => (
            <View style={{ marginBottom: 10 }}>
              <ProfilePostCard
                post={p}
                isOwn={isOwnProfile}
                userId={user?.id ?? ""}
                colors={colors}
                onDeleted={handleDeleted}
              />
            </View>
          )}
          ListEmptyComponent={<EmptyPosts />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  // Grid view
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.topBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>{profile.username}</Text>
        {!isOwnProfile ? (
          <Pressable hitSlop={8} style={styles.topBtn}
            onPress={() => Alert.alert("Options", undefined, [
              { text: "Block", style: "destructive", onPress: handleBlock },
              { text: "Report", onPress: handleReport },
              { text: "Cancel", style: "cancel" },
            ])}>
            <Feather name="more-horizontal" size={22} color={colors.foreground} />
          </Pressable>
        ) : <View style={styles.topBtn} />}
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <ListHeader />
        {postList.length === 0 ? <EmptyPosts /> : (
          <View style={styles.grid}>
            {postList.map(p => (
              <GridItem
                key={p.id}
                post={p}
                router={router}
                colors={colors}
                isOwn={isOwnProfile}
                userId={user?.id ?? ""}
                onDeleted={handleDeleted}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, fontSize: 16, fontWeight: "700", textAlign: "center" },
  cover: { height: 150, position: "relative" },
  avatarPosn: { position: "absolute", bottom: -46, left: 18 },
  info: { paddingHorizontal: 18, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  nameRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  displayName: { fontSize: 22, fontWeight: "800" },
  username: { fontSize: 14, marginTop: 2 },
  bio: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  statsRow: { flexDirection: "row", alignItems: "center", marginVertical: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  statBlock: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.3 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  actionBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12 },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  tabRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingLeft: 18 },
  tabs: { flexDirection: "row", paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingRight: 20, position: "relative" },
  tabText: { fontSize: 14, fontWeight: "500" },
  tabLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 2 },
  viewModeBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP, padding: GRID_GAP },
  gridItem: { position: "relative", overflow: "hidden" },
  gridImg: { width: "100%", height: "100%" },
  gridOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: 35, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 6, paddingBottom: 5, gap: 3 },
});
