import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { AntDesign, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { ActionSheet, type ActionSheetItem } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { haptics } from "@/lib/motion";
import { clampMediaAspectRatio } from "@/lib/mediaUtils";
import { RADIUS } from "@/constants/colors";
import {
  blockUser,
  createReport,
  deletePost,
  fetchProfile,
  fetchUserPosts,
  followUser,
  formatCount,
  getOrCreateDM,
  isFollowing,
  resolveMediaUrl,
  timeAgo,
  unfollowUser,
  updatePostVisibility,
  type Post,
} from "@/lib/db";

function ProfilePostCard({
  post,
  isOwn,
  onOpenOptions,
}: {
  post: Post;
  isOwn: boolean;
  onOpenOptions: (post: Post) => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const mediaUrls = (post.media_urls ?? []).map(resolveMediaUrl).filter(Boolean);
  const isVideo = post.media_type === "video";
  const isImage = post.media_type === "image";
  const isText = !isVideo && !isImage;
  const aspectRatio = clampMediaAspectRatio(post.media_width, post.media_height);

  const metaParts = [
    timeAgo(post.created_at),
    isVideo ? "Video" : isImage && mediaUrls.length > 1 ? `${mediaUrls.length} Photos` : null,
    isOwn ? (post.visibility || "public") : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => router.push(`/post/${post.id}` as any)}
      style={[
        PC.card,
        {
          backgroundColor: colors.bgCanvas,
          borderBottomColor: colors.separator,
        },
      ]}
    >
      <View style={PC.cardHeader}>
        <Text style={[PC.cardMetaText, { color: colors.textSecondary }]}>
          {metaParts.join(" · ")}
        </Text>
        {isOwn && (
          <Pressable
            style={PC.moreBtn}
            onPress={() => onOpenOptions(post)}
            accessibilityRole="button"
            accessibilityLabel="Post options"
          >
            <Feather name="more-horizontal" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {!!post.content &&
        (isText ? (
          <View
            style={[
              PC.textBody,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            <Text style={[PC.textBodyText, { color: colors.textPrimary }]}>
              {post.content}
            </Text>
          </View>
        ) : (
          <Text
            style={[PC.caption, { color: colors.textPrimary }]}
            numberOfLines={3}
          >
            {post.content}
          </Text>
        ))}

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
            <Pressable
              style={PC.playOverlay}
              onPress={() => setVideoPlaying(true)}
            >
              <View style={PC.playBtn}>
                <Feather name="play" size={26} color="#FFFFFF" />
              </View>
            </Pressable>
          )}
        </View>
      )}

      {isImage && mediaUrls.length > 0 && (
        <View style={[PC.mediaBox, { aspectRatio }]}>
          <Image
            source={{ uri: mediaUrls[0] }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {mediaUrls.length > 1 && (
            <View style={PC.imageMore}>
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}>
                +{mediaUrls.length - 1}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={PC.statsRow}>
        <View style={PC.statItem}>
          <AntDesign
            name={"hearto" as any}
            size={14}
            color={colors.textSecondary}
          />
          <Text style={[PC.statText, { color: colors.textSecondary }]}>
            {formatCount(post.likes_count)}
          </Text>
        </View>
        <View style={PC.statItem}>
          <Feather name="message-circle" size={14} color={colors.textSecondary} />
          <Text style={[PC.statText, { color: colors.textSecondary }]}>
            {formatCount(post.comments_count)}
          </Text>
        </View>
        <View style={PC.statItem}>
          <Feather name="eye" size={14} color={colors.textSecondary} />
          <Text style={[PC.statText, { color: colors.textSecondary }]}>
            {formatCount(post.views_count)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const PC = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardMetaText: {
    fontSize: 12.5,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  moreBtn: {
    width: 44,
    height: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  caption: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  textBody: {
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  textBodyText: { fontSize: 16, lineHeight: 24, fontWeight: "500" },
  mediaBox: {
    width: "100%",
    borderRadius: RADIUS.md,
    overflow: "hidden",
    backgroundColor: "#111",
    marginBottom: 10,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  playBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(109,40,217,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageMore: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.68)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingTop: 4,
  },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: {
    fontSize: 13,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
});

function GridItem({
  post,
  gridSize,
  router,
  isOwn,
  onOpenOptions,
}: {
  post: Post;
  gridSize: number;
  router: any;
  isOwn: boolean;
  onOpenOptions: (post: Post) => void;
}) {
  const colors = useColors();
  const media = post.media_urls?.[0] ? resolveMediaUrl(post.media_urls[0]) : null;
  const isVideo = post.media_type === "video";
  const isText =
    !post.media_type && (!post.media_urls || post.media_urls.length === 0);

  return (
    <Pressable
      style={[
        GS.item,
        {
          width: gridSize,
          height: gridSize,
          backgroundColor: colors.bgElevated,
        },
      ]}
      onPress={() => router.push(`/post/${post.id}` as any)}
      onLongPress={() => {
        if (isOwn) {
          haptics.medium();
          onOpenOptions(post);
        }
      }}
    >
      {isText ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.bgElevated,
              padding: 10,
              justifyContent: "center",
            },
          ]}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: 12, lineHeight: 16 }}
            numberOfLines={4}
          >
            {post.content}
          </Text>
        </View>
      ) : media ? (
        <Image
          source={{ uri: media }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.bgElevated,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Feather name="file-text" size={20} color={colors.textTertiary} />
        </View>
      )}

      {isVideo && (
        <View style={GS.videoBadge}>
          <Feather name="play" size={11} color="#FFFFFF" />
        </View>
      )}

      {post.media_urls && post.media_urls.length > 1 && (
        <View style={GS.multiImgBadge}>
          <Feather name="copy" size={10} color="#FFFFFF" />
        </View>
      )}

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.58)"]}
        style={GS.overlay}
      >
        <AntDesign name="heart" size={10} color="#FFFFFF" />
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 10.5,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatCount(post.likes_count)}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const GS = StyleSheet.create({
  item: { position: "relative", overflow: "hidden" },
  videoBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    padding: 4,
  },
  multiImgBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    padding: 4,
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 6,
    paddingBottom: 5,
    gap: 4,
  },
});

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const colors = useColors();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();

  const [postTab, setPostTab] = useState<"posts" | "reels">("posts");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [followLoading, setFollowLoading] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [postOptionsTarget, setPostOptionsTarget] = useState<Post | null>(null);
  const [visibilityTarget, setVisibilityTarget] = useState<Post | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);

  const isTablet = width >= 768;
  const cols = isTablet ? 4 : 3;
  const colWidth = Math.min(width, 720);
  const gridGap = 2;
  const gridSize = Math.floor((colWidth - gridGap * (cols + 1)) / cols);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["user-posts", userId, postTab],
    queryFn: () =>
      fetchUserPosts(userId as string, user?.id, postTab === "reels"),
    enabled: !!userId,
  });

  const postList = (posts as Post[]).filter((p) => !deletedIds.has(p.id));

  const { data: following = false, refetch: refetchFollow } = useQuery({
    queryKey: ["is-following", user?.id, userId],
    queryFn: () => isFollowing(user?.id ?? "", userId as string),
    enabled: !!user?.id && !!userId && user.id !== userId,
  });

  if (profileLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bgCanvas,
        }}
      >
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }
  if (!profile) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bgCanvas,
        }}
      >
        <Text style={{ color: colors.textSecondary }}>User not found</Text>
      </View>
    );
  }

  const isOwnProfile = user?.id === userId;

  const handleFollow = async () => {
    if (!user?.id || isOwnProfile) return;
    setFollowLoading(true);
    try {
      if (following) await unfollowUser(user.id, userId as string);
      else await followUser(user.id, userId as string);
      haptics.selection();
      refetchFollow();
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!user?.id) return;
    try {
      const convoId = await getOrCreateDM(user.id, userId as string);
      router.push({
        pathname: `/chat/${convoId}`,
        params: {
          peerName: profile.display_name,
          peerAvatar: profile.avatar_url ?? "",
          peerId: userId,
        },
      } as any);
    } catch {
      showToast("Could not start conversation", "error");
    }
  };

  const submitReport = async (
    reason: "spam" | "harassment" | "inappropriate" | "other",
  ) => {
    if (!user?.id) return;
    try {
      await createReport(
        user.id,
        null,
        reason,
        `Reported user @${profile.username} (${userId})`,
      );
      showToast("Report submitted. Thank you.", "success");
    } catch {
      showToast("Could not submit report right now", "error");
    }
  };

  const handleChangeVisibility = async (
    post: Post,
    vis: "public" | "followers" | "private",
  ) => {
    if (!user?.id) return;
    try {
      await updatePostVisibility(post.id, user.id, vis);
      qc.invalidateQueries({ queryKey: ["user-posts"] });
      showToast(`Visibility set to ${vis}`, "success");
    } catch {
      showToast("Could not update visibility", "error");
    }
  };

  const handleDeletePost = async (post: Post) => {
    if (!user?.id) return;
    try {
      await deletePost(post.id, user.id);
      setDeletedIds((prev) => new Set([...prev, post.id]));
      qc.invalidateQueries({ queryKey: ["user-posts"] });
      showToast("Post deleted", "success");
    } catch {
      showToast("Could not delete post", "error");
    }
  };

  const ListHeader = () => (
    <>
      <LinearGradient
        colors={
          colors.isDark
            ? ["#1A103D", "#2E1065", "#121216"]
            : ["#EDE9FE", "#DDD6FE", "#C4B5FD"]
        }
        style={styles.cover}
      >
        {profile.cover_url && (
          <Image
            source={{ uri: resolveMediaUrl(profile.cover_url) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        )}
        {isOwnProfile && (
          <Pressable
            onPress={() => router.push("/edit-profile" as any)}
            style={styles.coverEditBtn}
            accessibilityRole="button"
            accessibilityLabel="Edit cover"
          >
            <Feather name="camera" size={16} color="#FFFFFF" />
          </Pressable>
        )}
        <View
          style={[
            styles.avatarPosn,
            { borderColor: colors.bgCanvas, backgroundColor: colors.bgCanvas },
          ]}
        >
          <Avatar
            name={profile.display_name}
            size={84}
            avatarUrl={profile.avatar_url}
            canvasColor={colors.bgCanvas}
          />
        </View>
      </LinearGradient>

      <View style={[styles.info, { borderBottomColor: colors.separator }]}>
        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.displayName, { color: colors.textPrimary }]}>
                {profile.display_name}
              </Text>
              {profile.is_admin && (
                <Feather name="shield" size={16} color={colors.accentPrimary} />
              )}
            </View>
            <Text style={[styles.username, { color: colors.textSecondary }]}>
              @{profile.username}
            </Text>
          </View>
        </View>

        {profile.bio && (
          <Text style={[styles.bio, { color: colors.textPrimary }]}>
            {profile.bio}
          </Text>
        )}

        <View
          style={[
            styles.statsRow,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
            },
          ]}
        >
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {formatCount(profile.posts_count)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Posts
            </Text>
          </View>
          <View
            style={[styles.statDivider, { backgroundColor: colors.separator }]}
          />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {formatCount(profile.followers_count)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Followers
            </Text>
          </View>
          <View
            style={[styles.statDivider, { backgroundColor: colors.separator }]}
          />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {formatCount(profile.following_count)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Following
            </Text>
          </View>
        </View>

        {!isOwnProfile && (
          <View style={styles.actionBtns}>
            <Pressable
              onPress={handleFollow}
              disabled={followLoading}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: following
                    ? colors.bgElevated
                    : colors.accentPrimary,
                  borderColor: colors.separator,
                  borderWidth: following ? StyleSheet.hairlineWidth : 0,
                  flex: 2,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={following ? "Unfollow" : "Follow"}
            >
              {followLoading ? (
                <ActivityIndicator
                  color={following ? colors.accentPrimary : "#FFFFFF"}
                  size="small"
                />
              ) : (
                <>
                  <Feather
                    name={following ? "user-check" : "user-plus"}
                    size={15}
                    color={following ? colors.accentPrimary : "#FFFFFF"}
                  />
                  <Text
                    style={[
                      styles.actionBtnText,
                      { color: following ? colors.accentPrimary : "#FFFFFF" },
                    ]}
                  >
                    {following ? "Following" : "Follow"}
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleMessage}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                  borderWidth: StyleSheet.hairlineWidth,
                  flex: 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Message user"
            >
              <Feather name="message-circle" size={15} color={colors.textPrimary} />
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>
                Message
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.separator }]}>
        <View style={{ flexDirection: "row", flex: 1 }}>
          {(["posts", "reels"] as const).map((tab) => {
            const active = postTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setPostTab(tab)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Feather
                  name={tab === "posts" ? "grid" : "film"}
                  size={16}
                  color={active ? colors.accentPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: active
                        ? colors.accentPrimary
                        : colors.textSecondary,
                      fontWeight: active ? "700" : "500",
                    },
                  ]}
                >
                  {tab === "posts" ? "Posts" : "Reels"}
                </Text>
                {active && (
                  <View
                    style={[
                      styles.tabLine,
                      { backgroundColor: colors.accentPrimary },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 4,
            paddingRight: 12,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => setViewMode("grid")}
            style={[
              styles.viewModeBtn,
              viewMode === "grid" && { backgroundColor: colors.accentTint },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Grid view"
          >
            <Feather
              name="grid"
              size={16}
              color={
                viewMode === "grid" ? colors.accentPrimary : colors.textSecondary
              }
            />
          </Pressable>
          <Pressable
            onPress={() => setViewMode("list")}
            style={[
              styles.viewModeBtn,
              viewMode === "list" && { backgroundColor: colors.accentTint },
            ]}
            accessibilityRole="button"
            accessibilityLabel="List view"
          >
            <Feather
              name="list"
              size={16}
              color={
                viewMode === "list" ? colors.accentPrimary : colors.textSecondary
              }
            />
          </Pressable>
        </View>
      </View>
    </>
  );

  const EmptyPosts = () => (
    <View style={{ alignItems: "center", paddingVertical: 56, gap: 10 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.accentTint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather
          name={postTab === "posts" ? "grid" : "film"}
          size={30}
          color={colors.accentPrimary}
        />
      </View>
      <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}>
        No {postTab} yet
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
        {isOwnProfile ? "Share your first post!" : "Nothing posted yet."}
      </Text>
    </View>
  );

  const topBar = (
    <GlassSurface
      style={[
        styles.topBarWrap,
        {
          paddingTop: Platform.OS === "web" ? 10 : insets.top + 4,
          borderBottomColor: colors.separator,
        },
      ]}
    >
      <View style={[styles.topBar, { maxWidth: 720 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.topBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>
          @{profile.username}
        </Text>
        {!isOwnProfile ? (
          <View style={{ flexDirection: "row" }}>
            <Pressable
              style={styles.topBtn}
              onPress={() =>
                Share.share({
                  message: `Check out ${profile.display_name} on Vibe! https://vibe.app/user/${profile.id}`,
                  title: profile.display_name,
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Share profile"
            >
              <Feather name="share" size={18} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              style={styles.topBtn}
              onPress={() => setProfileMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="User options"
            >
              <Feather
                name="more-horizontal"
                size={20}
                color={colors.textPrimary}
              />
            </Pressable>
          </View>
        ) : (
          <View style={styles.topBtn} />
        )}
      </View>
    </GlassSurface>
  );

  const sheets = (
    <>
      <ActionSheet
        visible={profileMenuOpen}
        title={`@${profile.username}`}
        onClose={() => setProfileMenuOpen(false)}
        items={[
          {
            id: "report",
            label: "Report User",
            icon: "flag",
            onPress: () => setReportSheetOpen(true),
          },
          {
            id: "block",
            label: `Block @${profile.username}`,
            icon: "slash",
            destructive: true,
            onPress: () => setBlockConfirmOpen(true),
          },
        ]}
      />

      <ActionSheet
        visible={blockConfirmOpen}
        title={`Block @${profile.username}?`}
        message="They won't be able to view your profile or message you."
        onClose={() => setBlockConfirmOpen(false)}
        items={[
          {
            id: "confirm-block",
            label: "Block User",
            icon: "slash",
            destructive: true,
            onPress: async () => {
              if (!user?.id) return;
              await blockUser(user.id, userId as string);
              showToast(`@${profile.username} blocked`, "success");
              router.back();
            },
          },
        ]}
      />

      <ActionSheet
        visible={reportSheetOpen}
        title={`Report @${profile.username}`}
        message="Choose the reason for this report."
        onClose={() => setReportSheetOpen(false)}
        items={[
          {
            id: "spam",
            label: "Spam",
            icon: "alert-circle",
            onPress: () => submitReport("spam"),
          },
          {
            id: "harassment",
            label: "Harassment",
            icon: "shield",
            onPress: () => submitReport("harassment"),
          },
          {
            id: "inappropriate",
            label: "Inappropriate Content",
            icon: "eye-off",
            onPress: () => submitReport("inappropriate"),
          },
        ]}
      />

      <ActionSheet
        visible={!!postOptionsTarget}
        title="Post Options"
        onClose={() => setPostOptionsTarget(null)}
        items={
          postOptionsTarget
            ? [
                {
                  id: "visibility",
                  label: "Change Visibility",
                  icon: "globe",
                  onPress: () => setVisibilityTarget(postOptionsTarget),
                },
                {
                  id: "delete",
                  label: "Delete Post",
                  icon: "trash-2",
                  destructive: true,
                  onPress: () => setDeleteTarget(postOptionsTarget),
                },
              ]
            : []
        }
      />

      <ActionSheet
        visible={!!visibilityTarget}
        title="Set Visibility"
        onClose={() => setVisibilityTarget(null)}
        items={
          visibilityTarget
            ? (
                [
                  { id: "public", label: "Public", icon: "globe" as const },
                  {
                    id: "followers",
                    label: "Followers Only",
                    icon: "users" as const,
                  },
                  { id: "private", label: "Private", icon: "lock" as const },
                ] as const
              ).map(
                (v): ActionSheetItem => ({
                  id: v.id,
                  label: v.label,
                  icon: v.icon,
                  selected: visibilityTarget.visibility === v.id,
                  onPress: () =>
                    handleChangeVisibility(visibilityTarget, v.id),
                }),
              )
            : []
        }
      />

      <ActionSheet
        visible={!!deleteTarget}
        title="Delete Post"
        message="This cannot be undone."
        onClose={() => setDeleteTarget(null)}
        items={
          deleteTarget
            ? [
                {
                  id: "confirm-delete-post",
                  label: "Delete Post",
                  icon: "trash-2",
                  destructive: true,
                  onPress: () => handleDeletePost(deleteTarget),
                },
              ]
            : []
        }
      />
    </>
  );

  if (viewMode === "list") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
        {topBar}
        <FlatList
          data={postList}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={<ListHeader />}
          renderItem={({ item: p }) => (
            <ProfilePostCard
              post={p}
              isOwn={isOwnProfile}
              onOpenOptions={(post) => setPostOptionsTarget(post)}
            />
          )}
          ListEmptyComponent={<EmptyPosts />}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 90,
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }}
          showsVerticalScrollIndicator={false}
        />
        {sheets}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
      {topBar}
      <ScrollView
        style={{ backgroundColor: colors.bgCanvas }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 90,
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <ListHeader />
        {postList.length === 0 ? (
          <EmptyPosts />
        ) : (
          <View style={[styles.grid, { gap: gridGap, padding: gridGap }]}>
            {postList.map((p) => (
              <GridItem
                key={p.id}
                post={p}
                gridSize={gridSize}
                router={router}
                isOwn={isOwnProfile}
                onOpenOptions={(post) => setPostOptionsTarget(post)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  topBarWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBar: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: "700", textAlign: "center" },
  cover: { height: 150, position: "relative" },
  coverEditBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPosn: {
    position: "absolute",
    bottom: -42,
    left: 16,
    borderRadius: 46,
    borderWidth: 4,
  },
  info: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  displayName: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  username: { fontSize: 14, marginTop: 2 },
  bio: { fontSize: 14.5, lineHeight: 20, marginBottom: 10 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  statBlock: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statValue: {
    fontSize: 19,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 11.5,
    marginTop: 2,
    fontWeight: "500",
  },
  statDivider: { width: StyleSheet.hairlineWidth, height: 34 },
  actionBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: RADIUS.md,
  },
  actionBtnText: { fontSize: 14, fontWeight: "600" },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 16,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 46,
    paddingRight: 20,
    position: "relative",
  },
  tabText: { fontSize: 14 },
  tabLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 16,
    height: 2,
    borderRadius: 2,
  },
  viewModeBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
});
