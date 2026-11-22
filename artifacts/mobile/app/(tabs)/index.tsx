import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  Modal,
  TextInput,
  ActivityIndicator,
  Share,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { Feather, AntDesign, Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import AuthPromptModal from "@/components/AuthPromptModal";
import { useColors } from "@/hooks/useColors";
import { RADIUS } from "@/constants/colors";
import { haptics, SPRING_HEART, useReducedMotion } from "@/lib/motion";
import { clampMediaAspectRatio } from "@/lib/mediaUtils";
import {
  fetchFeed,
  fetchStories,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  createComment,
  fetchComments,
  resolveMediaUrl,
  fetchUnreadNotificationCount,
  timeAgo,
  formatCount,
  fetchRankedFeed,
  incrementPostShares,
  deletePost,
  updatePostVisibility,
  followUser,
  unfollowUser,
  createReport,
  type Post,
  type Comment,
  type Profile,
} from "@/lib/db";
import AICommentSuggestions from "@/components/ai/AICommentSuggestions";
import { Avatar } from "@/components/Avatar";
import { ActionSheet, type ActionSheetItem } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import VibeLogo from "@/components/VibeLogo";

// ─── Story Bar ────────────────────────────────────────────────────────────────

function StoryBar({ userId }: { userId: string }) {
  const router = useRouter();
  const colors = useColors();

  const { data: stories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: () => fetchStories(userId),
  });

  const { data: viewedStoryIds } = useQuery({
    queryKey: ["story-views-me", userId],
    queryFn: async () => {
      if (!userId) return new Set<string>();
      const { data } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", userId);
      return new Set((data ?? []).map((v: any) => v.story_id));
    },
    enabled: !!userId,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of stories) {
      if (!map.has(s.author_id)) {
        map.set(s.author_id, { user: s.profiles, stories: [] });
      }
      map.get(s.author_id).stories.push(s);
    }
    return Array.from(map.values());
  }, [stories]);

  return (
    <View style={[styles.storyBar, { borderBottomColor: colors.separator }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storyScroll}
      >
        <Pressable
          style={styles.addStoryBtn}
          onPress={() => {
            haptics.light();
            router.push("/create-story" as any);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add to your story"
        >
          <LinearGradient
            colors={[colors.accentPrimary, "#A855F7"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addStoryCircle}
          >
            <Feather name="plus" size={22} color="#FFFFFF" />
          </LinearGradient>
          <Text
            style={[styles.storyName, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            Your Story
          </Text>
        </Pressable>

        {grouped.map((g, i) => {
          const viewedSet = viewedStoryIds ?? new Set<string>();
          const allViewed =
            g.stories.length > 0 &&
            g.stories.every((s: any) => viewedSet.has(s.id));
          const name = g.user?.display_name ?? g.user?.username ?? "User";
          return (
            <Pressable
              key={g.user?.id ?? i}
              style={styles.storyItem}
              onPress={() => {
                haptics.light();
                router.push({
                  pathname: "/story-viewer",
                  params: { storyGroupIndex: i },
                } as any);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${name}'s story`}
            >
              <Avatar
                name={name}
                avatarUrl={g.user?.avatar_url}
                size={66}
                ringColors={
                  allViewed ? undefined : ["#8B5CF6", "#EC4899", "#F59E0B"]
                }
                ringViewed={allViewed}
                canvasColor={colors.bgCanvas}
              />
              <Text
                style={[styles.storyName, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {g.user?.username ?? "user"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Comment Sheet ────────────────────────────────────────────────────────────

function CommentSheet({
  postId,
  visible,
  onClose,
  userId,
  onRequireAuth,
}: {
  postId: string;
  visible: boolean;
  onClose: () => void;
  userId: string;
  onRequireAuth?: () => void;
}) {
  const qc = useQueryClient();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => fetchComments(postId),
    enabled: visible && !!postId,
  });

  const handleSubmit = async () => {
    if (!text.trim()) return;
    if (!userId) {
      onRequireAuth?.();
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await createComment(postId, userId, text.trim());
      haptics.success();
      setText("");
      qc.invalidateQueries({ queryKey: ["comments", postId] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch (e: any) {
      haptics.error();
      setSubmitError(e?.message ?? "Could not post comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
        <View style={[styles.commentHeader, { borderBottomColor: colors.separator }]}>
          <Text style={[styles.commentTitle, { color: colors.textPrimary }]}>
            Comments
          </Text>
          <Pressable
            onPress={onClose}
            style={styles.hitTarget}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
          >
            <Feather name="x" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <FlatList
          data={comments as Comment[]}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          renderItem={({ item: c }) => (
            <View style={styles.commentRow}>
              <Avatar
                name={c.profiles?.display_name ?? "User"}
                avatarUrl={c.profiles?.avatar_url}
                size={34}
              />
              <View style={[styles.commentBubble, { backgroundColor: colors.bgElevated }]}>
                <View style={styles.commentMetaRow}>
                  <Text style={[styles.commentAuthor, { color: colors.accentPrimary }]}>
                    @{c.profiles?.username ?? "user"}
                  </Text>
                  <Text style={[styles.commentTime, { color: colors.textTertiary }]}>
                    {timeAgo(c.created_at)}
                  </Text>
                </View>
                <Text style={[styles.commentContent, { color: colors.textPrimary }]}>
                  {c.content}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: colors.textSecondary, marginTop: 48 }}>
              No comments yet. Start the conversation.
            </Text>
          }
        />

        <View
          style={[
            styles.commentComposer,
            {
              borderTopColor: colors.separator,
              backgroundColor: colors.bgCanvas,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {!!submitError && (
            <Text style={{ color: colors.semanticDanger, fontSize: 12.5, paddingBottom: 6 }}>
              {submitError}
            </Text>
          )}
          <AICommentSuggestions
            postContent={(comments as Comment[])[0]?.content ?? ""}
            onSelect={(t) => setText(t)}
          />
          <View style={styles.commentInputRow}>
            <TextInput
              style={[
                styles.commentTextInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.input,
                  borderColor: colors.separator,
                },
              ]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textTertiary}
              value={text}
              onChangeText={setText}
              multiline
              accessibilityLabel="Comment text"
            />
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !text.trim()}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: text.trim() ? colors.accentPrimary : colors.muted,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
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

// ─── Post Card ────────────────────────────────────────────────────────────────

const PostCard = React.memo(function PostCard({
  post,
  userId,
  mediaWidth,
  onRequireAuth,
  onDeleted,
  followUserId,
}: {
  post: Post;
  userId: string;
  mediaWidth: number;
  onRequireAuth?: () => void;
  onDeleted?: (id: string) => void;
  followUserId?: string;
}) {
  const qc = useQueryClient();
  const colors = useColors();
  const { showToast } = useToast();
  const reducedMotion = useReducedMotion();

  const [liked, setLiked] = useState(post.is_liked ?? false);
  const [likes, setLikes] = useState(post.likes_count);
  const [saved, setSaved] = useState(post.is_saved ?? false);
  const [shares, setShares] = useState(post.shares_count ?? 0);
  const [commentOpen, setCommentOpen] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [visibility, setVisibility] = useState(post.visibility ?? "public");
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [sheetMode, setSheetMode] = useState<
    null | "owner" | "visibility" | "delete" | "report"
  >(null);

  const likeScale = useRef(new Animated.Value(1)).current;

  const mediaUrls = (post.media_urls ?? []).map(resolveMediaUrl).filter(Boolean);
  const isVideo = post.media_type === "video";
  const isImage = post.media_type === "image";
  const isText = !isVideo && !isImage;
  const aspectRatio = clampMediaAspectRatio(
    post.media_width,
    post.media_height,
    isVideo ? 4 / 5 : 4 / 3,
  );
  const isOwn = userId === post.author_id;

  const profile = post.profiles as Profile | undefined;
  const displayName = profile?.display_name ?? "User";
  const username = profile?.username ?? "user";

  const handleLike = () => {
    if (!userId) {
      onRequireAuth?.();
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikes((l) => Math.max(0, l + (next ? 1 : -1)));
    if (next) {
      haptics.light();
      if (!reducedMotion) {
        Animated.sequence([
          Animated.spring(likeScale, {
            toValue: 1.24,
            ...SPRING_HEART,
            useNativeDriver: true,
          }),
          Animated.spring(likeScale, {
            toValue: 1,
            ...SPRING_HEART,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
    const fn = next ? likePost : unlikePost;
    fn(userId, post.id).catch(() => {
      setLiked(!next);
      setLikes((l) => Math.max(0, l + (next ? -1 : 1)));
      showToast("Couldn't update like.", "error");
    });
  };

  const handleSave = () => {
    if (!userId) {
      onRequireAuth?.();
      return;
    }
    const next = !saved;
    setSaved(next);
    haptics.selection();
    const fn = next ? savePost : unsavePost;
    fn(userId, post.id)
      .then(() => showToast(next ? "Saved to bookmarks" : "Removed from saved", "info"))
      .catch(() => {
        setSaved(!next);
        showToast("Couldn't update bookmark.", "error");
      });
  };

  const handleFollow = async () => {
    if (!userId || !followUserId) return;
    const next = !following;
    setFollowing(next);
    setFollowLoading(true);
    haptics.selection();
    try {
      if (next) await followUser(userId, followUserId);
      else await unfollowUser(userId, followUserId);
    } catch {
      setFollowing(!next);
      showToast("Couldn't update follow status.", "error");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleVisibilityUpdate = async (nextVis: "public" | "followers" | "private") => {
    const prev = visibility;
    setVisibility(nextVis);
    try {
      await updatePostVisibility(post.id, userId, nextVis);
      qc.invalidateQueries({ queryKey: ["feed"] });
      showToast(`Post set to ${nextVis}`, "success");
    } catch {
      setVisibility(prev);
      showToast("Could not update visibility.", "error");
    }
  };

  const handleDeletePost = async () => {
    try {
      await deletePost(post.id, userId);
      onDeleted?.(post.id);
      qc.invalidateQueries({ queryKey: ["feed"] });
      showToast("Post deleted", "success");
    } catch {
      showToast("Could not delete post.", "error");
    }
  };

  const submitReport = async (
    reason: "spam" | "inappropriate" | "harassment" | "other",
  ) => {
    if (!userId) {
      onRequireAuth?.();
      return;
    }
    try {
      await createReport(userId, post.id, reason);
      showToast("Report submitted. Thank you.", "success");
    } catch {
      showToast("Could not submit report.", "error");
    }
  };

  const sheetConfig: { title?: string; message?: string; items: ActionSheetItem[] } =
    useMemo(() => {
      if (sheetMode === "owner") {
        return {
          title: "Post Options",
          items: [
            {
              id: "visibility",
              label: "Change Visibility",
              subtitle: `Currently ${visibility}`,
              icon: "eye",
              onPress: () => setSheetMode("visibility"),
            },
            {
              id: "delete",
              label: "Delete Post",
              subtitle: "Permanently remove this post",
              icon: "trash-2",
              destructive: true,
              onPress: () => setSheetMode("delete"),
            },
          ],
        };
      }
      if (sheetMode === "visibility") {
        return {
          title: "Post Visibility",
          message: "Choose who can view this post.",
          items: [
            {
              id: "public",
              label: "Public",
              subtitle: "Visible to everyone on Vibe",
              icon: "globe",
              selected: visibility === "public",
              onPress: () => handleVisibilityUpdate("public"),
            },
            {
              id: "followers",
              label: "Followers Only",
              subtitle: "Visible only to people who follow you",
              icon: "users",
              selected: visibility === "followers",
              onPress: () => handleVisibilityUpdate("followers"),
            },
            {
              id: "private",
              label: "Private",
              subtitle: "Only visible to you",
              icon: "lock",
              selected: visibility === "private",
              onPress: () => handleVisibilityUpdate("private"),
            },
          ],
        };
      }
      if (sheetMode === "delete") {
        return {
          title: "Delete Post?",
          message: "This action cannot be undone.",
          items: [
            {
              id: "confirm-delete",
              label: "Delete Permanently",
              icon: "trash-2",
              destructive: true,
              onPress: handleDeletePost,
            },
          ],
        };
      }
      if (sheetMode === "report") {
        return {
          title: "Report Post",
          message: "Help us understand what is wrong with this post.",
          items: [
            {
              id: "spam",
              label: "Spam or misleading",
              icon: "alert-octagon",
              onPress: () => submitReport("spam"),
            },
            {
              id: "inappropriate",
              label: "Inappropriate content",
              icon: "slash",
              onPress: () => submitReport("inappropriate"),
            },
            {
              id: "harassment",
              label: "Harassment or abuse",
              icon: "shield",
              destructive: true,
              onPress: () => submitReport("harassment"),
            },
            {
              id: "other",
              label: "Something else",
              icon: "flag",
              onPress: () => submitReport("other"),
            },
          ],
        };
      }
      return { items: [] };
    }, [sheetMode, visibility]);

  const metaParts = [
    `@${username}`,
    timeAgo(post.created_at),
    isVideo ? "Video" : undefined,
    isOwn ? visibility.charAt(0).toUpperCase() + visibility.slice(1) : undefined,
  ].filter(Boolean);

  return (
    <View
      style={[
        styles.card,
        {
          borderBottomColor: colors.separator,
          backgroundColor: colors.bgCanvas,
        },
      ]}
    >
      {/* Author header */}
      <View style={styles.cardHeader}>
        <Link href={`/user/${post.author_id}` as any} asChild>
          <Pressable
            style={styles.authorRow}
            accessibilityRole="button"
            accessibilityLabel={`${displayName}, ${metaParts.join(", ")}`}
          >
            <Avatar name={displayName} avatarUrl={profile?.avatar_url} size={42} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text
                style={[styles.authorName, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text
                style={[styles.authorMeta, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {metaParts.join(" · ")}
              </Text>
            </View>
          </Pressable>
        </Link>

        {!isOwn && followUserId && (
          <Pressable
            onPress={handleFollow}
            disabled={followLoading}
            style={[
              styles.followBtnSmall,
              {
                backgroundColor: following ? colors.secondary : colors.accentPrimary,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={following ? `Unfollow ${displayName}` : `Follow ${displayName}`}
            accessibilityState={{ selected: following }}
          >
            <Text
              style={{
                color: following ? colors.textPrimary : "#FFFFFF",
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {following ? "Following" : "Follow"}
            </Text>
          </Pressable>
        )}

        <Pressable
          style={styles.hitTarget}
          onPress={() => {
            if (!userId) {
              onRequireAuth?.();
              return;
            }
            haptics.selection();
            setSheetMode(isOwn ? "owner" : "report");
          }}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${displayName}'s post`}
        >
          <Feather name="more-horizontal" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Post Copy */}
      {!!post.content && (
        <View style={isText ? [styles.textOnlyBlock, { backgroundColor: colors.bgElevated }] : styles.copyWrap}>
          <Text
            style={[
              isText ? styles.textOnlyText : styles.postContent,
              { color: colors.textPrimary },
            ]}
          >
            {post.content}
          </Text>
        </View>
      )}

      {/* Media Frame */}
      {mediaUrls.length > 0 && (
        <View style={[styles.mediaWrap, { aspectRatio, backgroundColor: colors.bgElevated }]}>
          {isVideo ? (
            <Video
              source={{ uri: mediaUrls[0] }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping
              useNativeControls
            />
          ) : (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setImgIdx(
                    Math.max(
                      0,
                      Math.round(e.nativeEvent.contentOffset.x / Math.max(1, mediaWidth)),
                    ),
                  )
                }
              >
                {mediaUrls.map((url, i) => (
                  <Image
                    key={i}
                    source={{ uri: url }}
                    style={{ width: mediaWidth, height: "100%" }}
                    resizeMode="cover"
                    accessibilityLabel={post.content ? post.content.slice(0, 80) : `Photo ${i + 1} by ${displayName}`}
                  />
                ))}
              </ScrollView>
              {mediaUrls.length > 1 && (
                <>
                  <View style={styles.dots}>
                    {mediaUrls.map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          i === imgIdx
                            ? { width: 16, backgroundColor: "#FFFFFF" }
                            : { width: 6, backgroundColor: "rgba(255,255,255,0.45)" },
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.imageCountBadge}>
                    <Text style={styles.imageCountText}>
                      {imgIdx + 1}/{mediaUrls.length}
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      )}

      {/* Actions Bar */}
      <View style={styles.actions}>
        <View style={styles.leftActions}>
          <Pressable
            onPress={handleLike}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={liked ? "Unlike post" : "Like post"}
            accessibilityState={{ selected: liked }}
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <AntDesign
                name={(liked ? "heart" : "hearto") as any}
                size={21}
                color={liked ? colors.semanticDanger : colors.textSecondary}
              />
            </Animated.View>
            <Text
              style={[
                styles.actionCount,
                { color: liked ? colors.semanticDanger : colors.textSecondary },
              ]}
            >
              {formatCount(likes)}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              haptics.light();
              setCommentOpen(true);
            }}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="Comments"
          >
            <Feather name="message-circle" size={21} color={colors.textSecondary} />
            <Text style={[styles.actionCount, { color: colors.textSecondary }]}>
              {formatCount(post.comments_count)}
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={async () => {
              if (!userId) {
                onRequireAuth?.();
                return;
              }
              try {
                setShares((s) => s + 1);
                const result = await Share.share({
                  message: post.content
                    ? `${post.content} — https://vibe.app/post/${post.id}`
                    : `Check this out on Vibe! https://vibe.app/post/${post.id}`,
                });
                if (result.action === Share.sharedAction) {
                  await incrementPostShares(post.id);
                } else {
                  setShares((s) => Math.max(0, s - 1));
                }
              } catch {
                setShares((s) => Math.max(0, s - 1));
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Share post"
          >
            <Feather name="share" size={20} color={colors.textSecondary} />
            {shares > 0 && (
              <Text style={[styles.actionCount, { color: colors.textSecondary }]}>
                {formatCount(shares)}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={handleSave}
          style={styles.hitTarget}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove bookmark" : "Bookmark post"}
          accessibilityState={{ selected: saved }}
        >
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={21}
            color={saved ? colors.accentPrimary : colors.textSecondary}
          />
        </Pressable>
      </View>

      <CommentSheet
        postId={post.id}
        visible={commentOpen}
        onClose={() => setCommentOpen(false)}
        userId={userId}
        onRequireAuth={onRequireAuth}
      />

      <ActionSheet
        visible={!!sheetMode}
        title={sheetConfig.title}
        message={sheetConfig.message}
        items={sheetConfig.items}
        onClose={() => setSheetMode(null)}
      />
    </View>
  );
});

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  const colors = useColors();
  const base = (w: string | number, h: number, r = 8) => ({
    width: w as any,
    height: h,
    borderRadius: r,
    backgroundColor: colors.muted,
    opacity: 0.45,
  });
  return (
    <View style={[styles.card, { borderBottomColor: colors.separator }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <View style={base(42, 42, 21)} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={base(130, 12, 6)} />
          <View style={base(90, 10, 5)} />
        </View>
      </View>
      <View style={{ gap: 6, marginBottom: 12 }}>
        <View style={base("88%", 12, 6)} />
        <View style={base("58%", 12, 6)} />
      </View>
      <View style={base("100%", 210, RADIUS.md)} />
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user, isAuthenticated, isGuest, isLoading: authLoading } = useAuth();
  const [authPromptVisible, setAuthPromptVisible] = useState(false);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktopWeb = isWeb && width >= 768;
  const columnWidth = isDesktopWeb
    ? Math.min(width - 280, 620)
    : Math.min(width, 620);
  const mediaWidth = Math.max(240, columnWidth - 32);

  const qc = useQueryClient();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [feedMode, setFeedMode] = useState<"latest" | "foryou">("latest");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, isError, refetch } = useQuery({
    queryKey: ["feed", feedMode],
    queryFn: () =>
      feedMode === "foryou"
        ? fetchRankedFeed(user?.id || null, undefined)
        : fetchFeed(user?.id ?? "", undefined),
    enabled: isAuthenticated || isGuest || true,
  });

  const { data: notifCount = 0 } = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => fetchUnreadNotificationCount(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (data) {
      setPosts(data);
      setHasMore(data.length >= 20);
      if (data.length) setCursor(data[data.length - 1].created_at);
    }
  }, [data]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`feed-updates-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        () => {
          qc.invalidateQueries({ queryKey: ["feed"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor || !hasMore) return;
    setLoadingMore(true);
    try {
      const more =
        feedMode === "foryou"
          ? await fetchRankedFeed(user?.id || null, cursor)
          : await fetchFeed(user?.id ?? "", cursor);
      if (more.length > 0) {
        setPosts((p) => {
          const existingIds = new Set(p.map((x) => x.id));
          const fresh = more.filter((x) => !existingIds.has(x.id));
          return [...p, ...fresh];
        });
        setCursor(more[more.length - 1].created_at);
        if (more.length < 20) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch {
      // Keep current posts intact on pagination failure
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, cursor, hasMore, user?.id, feedMode]);

  const handleDeleted = useCallback((id: string) => {
    setPosts((p) => p.filter((x) => x.id !== id));
  }, []);

  const handleRequireAuth = useCallback(() => setAuthPromptVisible(true), []);

  const renderItem = useCallback(
    ({ item }: { item: Post }) => {
      const showFollow = !!user?.id && user.id !== item.author_id;
      return (
        <View style={{ width: columnWidth, alignSelf: "center" }}>
          <PostCard
            post={item}
            userId={user?.id ?? ""}
            mediaWidth={mediaWidth}
            onRequireAuth={handleRequireAuth}
            onDeleted={handleDeleted}
            followUserId={showFollow ? item.author_id : undefined}
          />
        </View>
      );
    },
    [user?.id, columnWidth, mediaWidth, handleRequireAuth, handleDeleted],
  );

  if (authLoading) return null;
  if (!isAuthenticated && !isGuest) return <Redirect href="/login" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCanvas }]}>
      {/* Frosted Header */}
      <GlassSurface
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 10 : Math.max(insets.top + 4, 12),
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={[styles.headerInner, { maxWidth: isDesktopWeb ? 640 : undefined }]}>
          {!isDesktopWeb ? (
            <VibeLogo size={28} showText showTagline={false} />
          ) : (
            <Text style={[styles.desktopTitle, { color: colors.textPrimary }]}>
              Home
            </Text>
          )}

          {/* Following | For You Segmented Switcher */}
          <View
            style={[styles.segmentTrack, { backgroundColor: colors.secondary }]}
            accessibilityRole="tablist"
          >
            <Pressable
              onPress={() => {
                haptics.selection();
                setFeedMode("latest");
              }}
              style={[
                styles.segmentBtn,
                feedMode === "latest" && [
                  styles.segmentBtnActive,
                  { backgroundColor: colors.bgCanvas },
                ],
              ]}
              accessibilityRole="tab"
              accessibilityLabel="Following feed"
              accessibilityState={{ selected: feedMode === "latest" }}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  {
                    color:
                      feedMode === "latest"
                        ? colors.textPrimary
                        : colors.textSecondary,
                  },
                ]}
              >
                Following
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptics.selection();
                setFeedMode("foryou");
              }}
              style={[
                styles.segmentBtn,
                feedMode === "foryou" && [
                  styles.segmentBtnActive,
                  { backgroundColor: colors.bgCanvas },
                ],
              ]}
              accessibilityRole="tab"
              accessibilityLabel="For You feed"
              accessibilityState={{ selected: feedMode === "foryou" }}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  {
                    color:
                      feedMode === "foryou"
                        ? colors.textPrimary
                        : colors.textSecondary,
                  },
                ]}
              >
                For You
              </Text>
            </Pressable>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                haptics.light();
                router.push("/(tabs)/create" as any);
              }}
              style={styles.hitTarget}
              accessibilityRole="button"
              accessibilityLabel="Create post"
            >
              <Feather name="plus-square" size={21} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => {
                haptics.light();
                router.push("/notifications" as any);
              }}
              style={styles.hitTarget}
              accessibilityRole="button"
              accessibilityLabel={
                notifCount > 0
                  ? `Notifications, ${notifCount} unread`
                  : "Notifications"
              }
            >
              <Feather name="bell" size={21} color={colors.textPrimary} />
              {notifCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.semanticDanger }]}>
                  <Text style={styles.badgeText}>
                    {notifCount > 99 ? "99+" : notifCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || (isLoading && posts.length === 0)}
            onRefresh={async () => {
              setIsRefreshing(true);
              setHasMore(true);
              try {
                await refetch();
              } finally {
                setIsRefreshing(false);
              }
            }}
            tintColor={colors.accentPrimary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ width: columnWidth, alignSelf: "center" }}>
            <StoryBar userId={user?.id ?? ""} />
          </View>
        }
        renderItem={renderItem}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.accentPrimary} style={{ padding: 24 }} />
          ) : !hasMore && posts.length > 0 ? (
            <View style={[styles.endFeed, { width: columnWidth, alignSelf: "center" }]}>
              <Feather name="check-circle" size={16} color={colors.textTertiary} />
              <Text style={[styles.endFeedText, { color: colors.textTertiary }]}>
                You're all caught up
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            isError ? (
              <View style={[styles.empty, { width: columnWidth, alignSelf: "center" }]}>
                <Feather name="alert-circle" size={44} color={colors.semanticDanger} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  Couldn't load feed
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                  {(error as any)?.message ?? "Something went wrong. Please try again."}
                </Text>
                <Pressable
                  onPress={() => refetch()}
                  style={[styles.emptyBtn, { backgroundColor: colors.accentPrimary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading feed"
                >
                  <Feather name="refresh-cw" size={15} color="#FFFFFF" />
                  <Text style={styles.emptyBtnText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.empty, { width: columnWidth, alignSelf: "center" }]}>
                <Feather name="compass" size={44} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  Your feed is quiet
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                  Follow creators or explore trending topics to personalize your stream.
                </Text>
                <Pressable
                  onPress={() => router.push("/(tabs)/search" as any)}
                  style={[styles.emptyBtn, { backgroundColor: colors.accentPrimary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Explore creators"
                >
                  <Feather name="compass" size={15} color="#FFFFFF" />
                  <Text style={styles.emptyBtnText}>Explore Vibe</Text>
                </Pressable>
              </View>
            )
          ) : (
            <View style={{ width: columnWidth, alignSelf: "center" }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 92 }}
      />

      <AuthPromptModal
        visible={authPromptVisible}
        onDismiss={() => setAuthPromptVisible(false)}
        reason="Sign up to like, comment, and save posts."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    alignSelf: "center",
    gap: 10,
  },
  desktopTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  segmentTrack: {
    flexDirection: "row",
    padding: 3,
    borderRadius: RADIUS.sm,
    gap: 2,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentBtnActive: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  hitTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },

  storyBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  storyScroll: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  addStoryBtn: {
    alignItems: "center",
    gap: 6,
    width: 68,
  },
  addStoryCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
  },
  storyItem: {
    alignItems: "center",
    gap: 6,
    width: 68,
  },
  storyName: {
    fontSize: 11.5,
    fontWeight: "500",
    textAlign: "center",
  },

  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  authorMeta: {
    fontSize: 12.5,
    marginTop: 1,
  },
  followBtnSmall: {
    paddingHorizontal: 14,
    minHeight: 34,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },

  copyWrap: {
    marginBottom: 12,
  },
  postContent: {
    fontSize: 15.5,
    lineHeight: 22,
  },
  textOnlyBlock: {
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 8,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" as const } : {}),
  },
  textOnlyText: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "500",
    letterSpacing: -0.1,
  },

  mediaWrap: {
    width: "100%",
    borderRadius: RADIUS.md,
    overflow: "hidden",
    marginBottom: 8,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" as const } : {}),
  },
  imageCountBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  imageCountText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    alignItems: "center",
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 4,
    gap: 6,
  },
  actionCount: {
    fontSize: 13.5,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  commentBubble: {
    flex: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" as const } : {}),
  },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: "600",
  },
  commentContent: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  commentTime: {
    fontSize: 11.5,
  },
  commentComposer: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  commentTextInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  endFeed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 8,
  },
  endFeedText: {
    fontSize: 13,
    fontWeight: "500",
  },

  empty: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 72,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  emptyDesc: {
    fontSize: 14.5,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 320,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    minHeight: 44,
    borderRadius: RADIUS.pill,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14.5,
  },
});
