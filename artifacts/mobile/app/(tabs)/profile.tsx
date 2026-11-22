import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import GuestScreen from "@/components/GuestScreen";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { ActionSheet } from "@/components/ActionSheet";
import { useToast } from "@/components/Toast";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";
import {
  deletePost,
  fetchProfile,
  fetchSavedPosts,
  fetchUserPosts,
  formatCount,
  generateAIBioRefresh,
  generateProfileInsights,
  resolveMediaUrl,
  timeAgo,
  type Post,
} from "@/lib/db";

type ViewMode = "grid" | "list";
type PostTab = "posts" | "reels" | "saved";

function StatBlock({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>
        {formatCount(value)}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function PostGrid({
  posts,
  viewMode,
  gridSize,
  onRequestDelete,
  isOwn,
}: {
  posts: Post[];
  viewMode: ViewMode;
  gridSize: number;
  onRequestDelete?: (post: Post) => void;
  isOwn: boolean;
}) {
  const router = useRouter();
  const colors = useColors();

  if (viewMode === "grid") {
    return (
      <View style={styles.gridWrap}>
        {posts.map((p) => {
          const media = p.media_urls?.[0] ? resolveMediaUrl(p.media_urls[0]) : null;
          const isVideo = p.media_type === "video";
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/post/${p.id}` as any)}
              onLongPress={() => {
                if (isOwn && onRequestDelete) {
                  haptics.medium();
                  onRequestDelete(p);
                }
              }}
              style={({ pressed }) => [
                styles.gridItem,
                {
                  width: gridSize,
                  height: gridSize,
                  backgroundColor: colors.bgElevated,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={p.content || "View post"}
            >
              {media ? (
                <Image
                  source={{ uri: media }}
                  style={styles.gridImg}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.gridImg,
                    {
                      backgroundColor: colors.bgElevated,
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 10,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      textAlign: "center",
                    }}
                    numberOfLines={3}
                  >
                    {p.content || "Post"}
                  </Text>
                </View>
              )}
              {isVideo && (
                <View style={styles.gridVideoIcon}>
                  <Feather name="play" size={10} color="#FFFFFF" />
                </View>
              )}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.58)"]}
                style={styles.gridOverlay}
              >
                <View style={styles.gridStats}>
                  <Feather name="heart" size={10} color="#FFFFFF" />
                  <Text style={styles.gridStatText}>
                    {formatCount(p.likes_count)}
                  </Text>
                  {p.views_count > 0 && (
                    <>
                      <Feather
                        name="eye"
                        size={10}
                        color="#FFFFFF"
                        style={{ marginLeft: 6 }}
                      />
                      <Text style={styles.gridStatText}>
                        {formatCount(p.views_count)}
                      </Text>
                    </>
                  )}
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      {posts.map((p) => {
        const media = p.media_urls?.[0] ? resolveMediaUrl(p.media_urls[0]) : null;
        const aspectRatio =
          p.media_width && p.media_height
            ? Math.min(Math.max(p.media_width / p.media_height, 0.56), 1.91)
            : 1;
        return (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/post/${p.id}` as any)}
            onLongPress={() => {
              if (isOwn && onRequestDelete) {
                haptics.medium();
                onRequestDelete(p);
              }
            }}
            style={[styles.listCard, { borderBottomColor: colors.separator }]}
          >
            {media && (
              <Image
                source={{ uri: media }}
                style={[styles.listCardImg, { aspectRatio }]}
                resizeMode="cover"
              />
            )}
            {!!p.content && (
              <Text
                style={[styles.listCardContent, { color: colors.textPrimary }]}
                numberOfLines={4}
              >
                {p.content}
              </Text>
            )}
            <View style={styles.listCardMeta}>
              <Text style={[styles.listCardTime, { color: colors.textSecondary }]}>
                {timeAgo(p.created_at)}
              </Text>
              <View style={styles.listCardStats}>
                <View style={styles.listStat}>
                  <Feather name="heart" size={13} color={colors.textSecondary} />
                  <Text
                    style={[styles.listStatText, { color: colors.textSecondary }]}
                  >
                    {formatCount(p.likes_count)}
                  </Text>
                </View>
                <View style={styles.listStat}>
                  <Feather
                    name="message-circle"
                    size={13}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[styles.listStatText, { color: colors.textSecondary }]}
                  >
                    {formatCount(p.comments_count)}
                  </Text>
                </View>
                <View style={styles.listStat}>
                  <Feather name="eye" size={13} color={colors.textSecondary} />
                  <Text
                    style={[styles.listStatText, { color: colors.textSecondary }]}
                  >
                    {formatCount(p.views_count)}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ProfileScreen() {
  const { isAuthenticated, isLoading: authLoading, user, isGuest } = useAuth();
  const colors = useColors();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const qc = useQueryClient();

  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && width >= 768;
  const contentWidth = Math.min(width - (isDesktopWeb ? 240 : 0), 720);
  const gridSize = Math.floor((contentWidth - 8) / 3);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [postTab, setPostTab] = useState<PostTab>("posts");
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [bioRefresh, setBioRefresh] = useState("");
  const [loadingBioRefresh, setLoadingBioRefresh] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["my-posts", user?.id, postTab],
    queryFn: () => {
      if (postTab === "saved") return fetchSavedPosts(user?.id ?? "");
      return fetchUserPosts(user?.id ?? "", user?.id, postTab === "reels");
    },
    enabled: !!user?.id,
  });

  const handleDelete = async (postId: string) => {
    if (!user?.id) return;
    try {
      await deletePost(postId, user.id);
      qc.invalidateQueries({ queryKey: ["my-posts"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      showToast("Post deleted", "success");
    } catch {
      showToast("Could not delete post", "error");
    }
  };

  const handleAIInsight = async () => {
    if (loadingInsight) return;
    if (aiInsight) {
      setAiInsight(null);
      return;
    }
    setLoadingInsight(true);
    try {
      const allPosts = posts as Post[];
      const insight = await generateProfileInsights({
        totalPosts: profile?.posts_count ?? 0,
        totalLikes: allPosts.reduce((s, p) => s + p.likes_count, 0),
        totalViews: allPosts.reduce((s, p) => s + p.views_count, 0),
        imagePosts: allPosts.filter((p) => p.media_type === "image").length,
        videoPosts: allPosts.filter((p) => p.media_type === "video").length,
        textPosts: allPosts.filter((p) => !p.media_type).length,
      });
      if (!insight) {
        showToast("AI insights unavailable right now", "info");
      } else {
        setAiInsight(insight);
      }
    } finally {
      setLoadingInsight(false);
    }
  };

  const handleBioRefresh = async () => {
    if (loadingBioRefresh) return;
    setLoadingBioRefresh(true);
    setBioRefresh("");
    try {
      const recentTopics = (posts as Post[])
        .slice(0, 10)
        .map((p) => p.content ?? "")
        .join(" ");
      const result = await generateAIBioRefresh(
        displayName,
        recentTopics
          .split(/\s+/)
          .filter((w) => w.length > 4)
          .slice(0, 10),
      );
      if (!result) {
        showToast("AI bio refresh unavailable right now", "info");
      } else {
        setBioRefresh(result);
      }
    } finally {
      setLoadingBioRefresh(false);
    }
  };

  if (authLoading) return null;
  if (isGuest) {
    return (
      <GuestScreen
        icon="user"
        title="Your Profile"
        subtitle="Create an account to build your profile, share posts, and connect with others."
        perks={[
          "Post photos, videos & reels",
          "Build your following",
          "Save posts you love",
          "See your view counts",
        ]}
      />
    );
  }
  if (!isAuthenticated) return <Redirect href="/login" />;
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
        <ActivityIndicator color={colors.accentPrimary} size="large" />
      </View>
    );
  }

  const displayName =
    profile?.display_name ??
    ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User");
  const avatarUrl = profile?.avatar_url ?? user?.profileImageUrl ?? null;

  const tabs: { key: PostTab; icon: keyof typeof Feather.glyphMap; label: string }[] = [
    { key: "posts", icon: "grid", label: "Posts" },
    { key: "reels", icon: "film", label: "Reels" },
    { key: "saved", icon: "bookmark", label: "Saved" },
  ];

  return (
    <>
      <StatusBar barStyle={colors.isDark ? "light-content" : "dark-content"} />
      <ScrollView
        style={{ backgroundColor: colors.bgCanvas }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      >
        <View style={[styles.columnWrap, { maxWidth: 720 }]}>
          {/* Cover */}
          <View
            style={[
              styles.coverWrap,
              { height: isWeb ? 176 : 196 + insets.top },
            ]}
          >
            <LinearGradient
              colors={
                colors.isDark
                  ? ["#1A103D", "#2E1065", "#121216"]
                  : ["#EDE9FE", "#DDD6FE", "#C4B5FD"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {profile?.cover_url && (
              <Image
                source={{ uri: resolveMediaUrl(profile.cover_url) }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            )}
            <Pressable
              onPress={() => {
                haptics.light();
                router.push("/settings" as any);
              }}
              style={[
                styles.coverIconBtn,
                {
                  top: isWeb ? 14 : insets.top + 10,
                  right: 14,
                  backgroundColor: colors.isDark
                    ? "rgba(0,0,0,0.48)"
                    : "rgba(255,255,255,0.82)",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Feather name="settings" size={18} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/edit-profile" as any)}
              style={[
                styles.coverIconBtn,
                {
                  bottom: 14,
                  right: 14,
                  backgroundColor: colors.isDark
                    ? "rgba(0,0,0,0.48)"
                    : "rgba(255,255,255,0.82)",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Edit cover or profile"
            >
              <Feather name="camera" size={17} color={colors.textPrimary} />
            </Pressable>

            <View
              style={[
                styles.avatarFrame,
                { borderColor: colors.bgCanvas, backgroundColor: colors.bgCanvas },
              ]}
            >
              <Avatar
                name={displayName}
                size={88}
                avatarUrl={avatarUrl}
                canvasColor={colors.bgCanvas}
              />
            </View>
          </View>

          {/* Profile Info */}
          <View
            style={[
              styles.profileInfo,
              { borderBottomColor: colors.separator },
            ]}
          >
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.displayName, { color: colors.textPrimary }]}>
                    {displayName}
                  </Text>
                  {profile?.is_admin && (
                    <Feather name="shield" size={16} color={colors.accentPrimary} />
                  )}
                </View>
                {profile?.username ? (
                  <Text style={[styles.username, { color: colors.textSecondary }]}>
                    @{profile.username}
                  </Text>
                ) : null}
              </View>
              <Link href="/edit-profile" asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.editBtn,
                    {
                      borderColor: colors.accentPrimary,
                      backgroundColor: pressed ? colors.accentTint : "transparent",
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Feather name="edit-2" size={14} color={colors.accentPrimary} />
                  <Text
                    style={[styles.editBtnText, { color: colors.accentPrimary }]}
                  >
                    Edit Profile
                  </Text>
                </Pressable>
              </Link>
            </View>

            {profile?.bio ? (
              <Text style={[styles.bio, { color: colors.textPrimary }]}>
                {profile.bio}
              </Text>
            ) : null}

            <Pressable
              onPress={handleBioRefresh}
              style={styles.bioRefreshBtn}
              accessibilityRole="button"
              accessibilityLabel="Suggest bio with AI"
            >
              <Feather name="refresh-cw" size={13} color={colors.accentPrimary} />
              <Text style={[styles.bioRefreshText, { color: colors.accentPrimary }]}>
                Suggest bio with AI
              </Text>
            </Pressable>

            {loadingBioRefresh && (
              <ActivityIndicator
                size="small"
                color={colors.accentPrimary}
                style={{ marginTop: 8, alignSelf: "flex-start" }}
              />
            )}
            {!!bioRefresh && (
              <View
                style={[
                  styles.aiBox,
                  {
                    backgroundColor: colors.accentTint,
                    borderColor: colors.separator,
                  },
                ]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 13.5, lineHeight: 19 }}>
                  {bioRefresh}
                </Text>
              </View>
            )}

            {/* Stats */}
            <View
              style={[
                styles.statsRow,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                },
              ]}
            >
              <StatBlock value={profile?.posts_count ?? 0} label="Posts" />
              <View
                style={[styles.statDivider, { backgroundColor: colors.separator }]}
              />
              <StatBlock value={profile?.followers_count ?? 0} label="Followers" />
              <View
                style={[styles.statDivider, { backgroundColor: colors.separator }]}
              />
              <StatBlock value={profile?.following_count ?? 0} label="Following" />
            </View>

            {/* Quick actions */}
            <View style={styles.quickActions}>
              <Pressable
                onPress={async () => {
                  await Share.share({
                    message: `Check out ${displayName}'s profile on Vibe! https://vibe.app/user/${user?.id}`,
                  });
                }}
                style={({ pressed }) => [
                  styles.quickBtn,
                  {
                    backgroundColor: colors.accentPrimary,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Share profile"
              >
                <Feather name="share-2" size={15} color="#FFFFFF" />
                <Text style={styles.quickBtnText}>Share</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/live-sessions" as any)}
                style={({ pressed }) => [
                  styles.quickBtn,
                  {
                    backgroundColor: colors.semanticDanger,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Go Live"
              >
                <Feather name="radio" size={15} color="#FFFFFF" />
                <Text style={styles.quickBtnText}>Go Live</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/ai-chat" as any)}
                style={({ pressed }) => [
                  styles.quickBtn,
                  {
                    backgroundColor: colors.bgElevated,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.separator,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open AI Assistant"
              >
                <Feather name="zap" size={15} color={colors.accentPrimary} />
                <Text style={[styles.quickBtnText, { color: colors.textPrimary }]}>
                  AI Studio
                </Text>
              </Pressable>
            </View>

            {/* AI Insights */}
            <Pressable
              onPress={handleAIInsight}
              style={({ pressed }) => [
                styles.insightBtn,
                {
                  backgroundColor: colors.accentTint,
                  borderColor: colors.separator,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Toggle AI growth insights"
            >
              {loadingInsight ? (
                <ActivityIndicator size="small" color={colors.accentPrimary} />
              ) : (
                <Feather name="trending-up" size={15} color={colors.accentPrimary} />
              )}
              <Text
                style={[styles.insightBtnText, { color: colors.accentPrimary }]}
              >
                {loadingInsight
                  ? "Analyzing your profile…"
                  : aiInsight
                  ? "Hide AI insights"
                  : "View AI growth insights"}
              </Text>
            </Pressable>

            {aiInsight && (
              <View
                style={[
                  styles.insightCard,
                  {
                    backgroundColor: colors.bgElevated,
                    borderColor: colors.separator,
                  },
                ]}
              >
                <View style={styles.insightHeader}>
                  <View
                    style={[
                      styles.insightDot,
                      { backgroundColor: colors.accentPrimary },
                    ]}
                  >
                    <Feather name="zap" size={12} color="#FFFFFF" />
                  </View>
                  <Text
                    style={[styles.insightTitle, { color: colors.accentPrimary }]}
                  >
                    Growth Insights
                  </Text>
                </View>
                <Text style={[styles.insightText, { color: colors.textPrimary }]}>
                  {aiInsight}
                </Text>
              </View>
            )}
          </View>

          {/* Tab bar */}
          <View style={[styles.tabBar, { borderBottomColor: colors.separator }]}>
            {tabs.map((tab) => {
              const active = postTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    haptics.selection();
                    setPostTab(tab.key);
                  }}
                  style={styles.tabBtn}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tab.label}
                >
                  <Feather
                    name={tab.icon}
                    size={16}
                    color={active ? colors.accentPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: active ? colors.accentPrimary : colors.textSecondary,
                      },
                      active && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {active && (
                    <View
                      style={[
                        styles.tabIndicator,
                        { backgroundColor: colors.accentPrimary },
                      ]}
                    />
                  )}
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <View style={styles.viewToggle}>
              <Pressable
                onPress={() => setViewMode("grid")}
                style={[
                  styles.viewBtn,
                  viewMode === "grid" && { backgroundColor: colors.accentTint },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Grid view"
              >
                <Feather
                  name="grid"
                  size={16}
                  color={
                    viewMode === "grid"
                      ? colors.accentPrimary
                      : colors.textSecondary
                  }
                />
              </Pressable>
              <Pressable
                onPress={() => setViewMode("list")}
                style={[
                  styles.viewBtn,
                  viewMode === "list" && { backgroundColor: colors.accentTint },
                ]}
                accessibilityRole="button"
                accessibilityLabel="List view"
              >
                <Feather
                  name="list"
                  size={16}
                  color={
                    viewMode === "list"
                      ? colors.accentPrimary
                      : colors.textSecondary
                  }
                />
              </Pressable>
            </View>
          </View>

          {postsLoading ? (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <ActivityIndicator color={colors.accentPrimary} />
            </View>
          ) : posts.length === 0 ? (
            <View style={styles.emptyPosts}>
              <View
                style={[
                  styles.emptyIconWrap,
                  { backgroundColor: colors.accentTint },
                ]}
              >
                <Feather
                  name={
                    postTab === "saved"
                      ? "bookmark"
                      : postTab === "posts"
                      ? "grid"
                      : "film"
                  }
                  size={30}
                  color={colors.accentPrimary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {postTab === "saved" ? "No saved posts" : `No ${postTab} yet`}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                {postTab === "saved"
                  ? "Posts you save will appear here."
                  : `Share your first ${postTab === "posts" ? "post" : "reel"} to get started.`}
              </Text>
              {postTab !== "saved" && (
                <Link href="/create" asChild>
                  <Pressable
                    style={[
                      styles.emptyAction,
                      { backgroundColor: colors.accentPrimary },
                    ]}
                  >
                    <Text style={styles.emptyActionText}>
                      Create {postTab === "posts" ? "Post" : "Reel"}
                    </Text>
                  </Pressable>
                </Link>
              )}
            </View>
          ) : (
            <PostGrid
              posts={posts as Post[]}
              viewMode={viewMode}
              gridSize={gridSize}
              onRequestDelete={(p) => setDeleteTarget(p)}
              isOwn
            />
          )}
        </View>
      </ScrollView>

      <ActionSheet
        visible={!!deleteTarget}
        title="Delete Post"
        message="This will permanently remove your post."
        onClose={() => setDeleteTarget(null)}
        items={
          deleteTarget
            ? [
                {
                  id: "delete",
                  label: "Delete Post",
                  icon: "trash-2",
                  destructive: true,
                  onPress: () => handleDelete(deleteTarget.id),
                },
              ]
            : []
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  columnWrap: {
    width: "100%",
    alignSelf: "center",
  },
  coverWrap: {
    position: "relative",
  },
  coverIconBtn: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFrame: {
    position: "absolute",
    bottom: -44,
    left: 16,
    borderRadius: 48,
    borderWidth: 4,
  },
  profileInfo: {
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  displayName: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  username: {
    fontSize: 14,
    marginTop: 2,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    height: 40,
  },
  editBtnText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  bio: {
    fontSize: 14.5,
    lineHeight: 21,
    marginBottom: 8,
  },
  bioRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    alignSelf: "flex-start",
  },
  bioRefreshText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  aiBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  statBlock: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 11.5,
    marginTop: 2,
    fontWeight: "500",
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: RADIUS.md,
  },
  quickBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13.5,
  },
  insightBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  insightBtnText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  insightCard: {
    marginTop: 10,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  insightDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  insightText: {
    fontSize: 14,
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 48,
    paddingRight: 18,
    position: "relative",
  },
  tabLabel: {
    fontSize: 13.5,
    fontWeight: "500",
  },
  tabLabelActive: {
    fontWeight: "700",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 14,
    height: 2,
    borderRadius: 2,
  },
  viewToggle: {
    flexDirection: "row",
    gap: 4,
  },
  viewBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    padding: 2,
  },
  gridItem: {
    position: "relative",
    overflow: "hidden",
  },
  gridImg: {
    width: "100%",
    height: "100%",
  },
  gridVideoIcon: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    padding: 4,
  },
  gridOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  gridStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  gridStatText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  listCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listCardImg: {
    width: "100%",
    borderRadius: RADIUS.md,
    marginBottom: 10,
    backgroundColor: "#000",
  },
  listCardContent: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  listCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listCardTime: {
    fontSize: 12,
  },
  listCardStats: {
    flexDirection: "row",
    gap: 14,
  },
  listStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  listStatText: {
    fontSize: 12.5,
    fontVariant: ["tabular-nums"],
  },
  emptyPosts: {
    alignItems: "center",
    paddingVertical: 56,
    paddingHorizontal: 36,
    gap: 8,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 12,
    paddingHorizontal: 24,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "600",
  },
});
