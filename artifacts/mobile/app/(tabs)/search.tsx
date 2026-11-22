import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  Image,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Redirect, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { GlassSurface } from "@/components/GlassSurface";
import AuthPromptModal from "@/components/AuthPromptModal";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";
import {
  searchUsers,
  resolveMediaUrl,
  formatCount,
  generateAISemanticSearch,
  generateAITrendingInsights,
  followUser,
  unfollowUser,
  fetchFeed,
  type Profile,
  type Post,
} from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type SearchTab = "top" | "people" | "posts";

async function searchPosts(query: string): Promise<Post[]> {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabase
    .from("posts")
    .select("*, profiles(*)")
    .eq("visibility", "public")
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((p: any) => ({ ...p, media_urls: p.media_urls ?? [] })) as Post[];
}

async function fetchSuggestedUsers(): Promise<Profile[]> {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("followers_count", { ascending: false })
    .limit(10);
  return (data ?? []) as Profile[];
}

async function fetchTrendingHashtags(): Promise<{ tag: string; count: number }[]> {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabase
    .from("posts")
    .select("content")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(200);
  const map = new Map<string, number>();
  (data ?? []).forEach((p: any) => {
    (p.content ?? "").split(/\s+/).forEach((w: string) => {
      if (w.startsWith("#") && w.length > 1) {
        const tag = w.toLowerCase();
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    });
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));
}

function AISearchSuggestions({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (s: string) => void;
}) {
  const colors = useColors();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSuggestions([]);
    if (query.trim().length < 2) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await generateAISemanticSearch(query.trim());
        setSuggestions(results);
      } finally {
        setLoading(false);
      }
    }, 550);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  if (!loading && suggestions.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[S.aiSuggestBar, { borderBottomColor: colors.separator }]}
    >
      <View style={S.aiInlineLabel}>
        <Feather name="zap" size={12} color={colors.accentPrimary} />
        <Text style={[S.aiInlineText, { color: colors.accentPrimary }]}>Suggested</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.accentPrimary} style={{ marginLeft: 6 }} />
      ) : (
        suggestions.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => {
              haptics.selection();
              onSelect(s);
            }}
            style={[
              S.suggestBtn,
              { backgroundColor: colors.bgElevated, borderColor: colors.separator },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Search ${s}`}
          >
            <Feather name="search" size={12} color={colors.textSecondary} />
            <Text style={[S.suggestText, { color: colors.textPrimary }]} numberOfLines={1}>
              {s}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

export default function SearchScreen() {
  const { isAuthenticated, isGuest, user } = useAuth();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktopWeb = isWeb && width >= 768;
  const contentMaxWidth = isDesktopWeb ? Math.min(width - 280, 920) : 640;

  const [query, setQuery] = useState(typeof q === "string" ? q : "");
  const [tab, setTab] = useState<SearchTab>(typeof q === "string" && q ? "posts" : "top");
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [trendingInsights, setTrendingInsights] = useState<{ tag: string; insight: string } | null>(
    null,
  );
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);

  // Hydrate query when deep-linked from Reels hashtags (/search?q=...)
  useEffect(() => {
    if (typeof q === "string" && q.trim()) {
      setQuery(q);
      setTab("posts");
    }
  }, [q]);

  const toggleFollow = useCallback(
    async (targetId: string) => {
      if (!user?.id) {
        setAuthPrompt(true);
        return;
      }
      const isNowFollowing = followingIds.has(targetId);
      haptics.selection();
      setFollowingIds((prev) => {
        const next = new Set(prev);
        isNowFollowing ? next.delete(targetId) : next.add(targetId);
        return next;
      });
      try {
        if (isNowFollowing) await unfollowUser(user.id, targetId);
        else await followUser(user.id, targetId);
      } catch {
        setFollowingIds((prev) => {
          const next = new Set(prev);
          isNowFollowing ? next.add(targetId) : next.delete(targetId);
          return next;
        });
      }
    },
    [user?.id, followingIds],
  );

  const trimmed = query.trim();

  const { data: people = [], isLoading: loadingPeople } = useQuery({
    queryKey: ["search-people", trimmed, user?.id ?? ""],
    queryFn: () => searchUsers(trimmed, user?.id),
    enabled: trimmed.length >= 1 && (tab === "people" || tab === "top"),
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery({
    queryKey: ["search-posts", trimmed],
    queryFn: () => searchPosts(trimmed),
    enabled: trimmed.length >= 1 && (tab === "posts" || tab === "top"),
  });

  const { data: suggested = [] } = useQuery({
    queryKey: ["suggested-users"],
    queryFn: fetchSuggestedUsers,
    enabled: trimmed.length === 0,
  });

  const { data: hashtags = [] } = useQuery({
    queryKey: ["trending-hashtags"],
    queryFn: fetchTrendingHashtags,
    enabled: trimmed.length === 0,
  });

  const { data: exploreFeed = [] } = useQuery({
    queryKey: ["explore-mosaic", user?.id ?? ""],
    queryFn: () => fetchFeed(user?.id ?? "", undefined),
    enabled: trimmed.length === 0,
  });

  if (!isAuthenticated && !isGuest) return <Redirect href="/login" />;

  const visualPosts = (exploreFeed as Post[]).filter((p) => (p.media_urls ?? []).length > 0).slice(0, 9);
  const isLoading =
    tab === "people"
      ? loadingPeople
      : tab === "posts"
      ? loadingPosts
      : loadingPeople || loadingPosts;
  const hasAnyResults =
    tab === "people"
      ? people.length > 0
      : tab === "posts"
      ? posts.length > 0
      : people.length > 0 || posts.length > 0;

  return (
    <View style={[S.container, { backgroundColor: colors.bgCanvas }]}>
      <GlassSurface
        style={[
          S.headerWrap,
          {
            paddingTop: isWeb ? 14 : Math.max(insets.top + 6, 12),
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={[S.innerCol, { maxWidth: contentMaxWidth }]}>
          <View style={S.headerTop}>
            <Text style={[S.title, { color: colors.textPrimary }]}>Explore</Text>
            <Pressable
              onPress={() => {
                haptics.light();
                router.push("/live-sessions" as any);
              }}
              style={[
                S.aiLinkBtn,
                { backgroundColor: colors.accentTint, borderColor: colors.separator },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open Live Streams"
            >
              <Feather name="radio" size={14} color={colors.accentPrimary} />
              <Text style={[S.aiLinkText, { color: colors.accentPrimary }]}>Live</Text>
            </Pressable>
          </View>

          <View
            style={[
              S.searchBar,
              { backgroundColor: colors.bgElevated, borderColor: colors.separator },
            ]}
          >
            <Feather name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={[S.searchInput, { color: colors.textPrimary }]}
              placeholder="Search people, posts, or #hashtags"
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search input"
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => setQuery("")}
                style={S.clearBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>
      </GlassSurface>

      {trimmed.length >= 2 && (
        <View style={[S.innerCol, { maxWidth: contentMaxWidth }]}>
          <AISearchSuggestions
            query={trimmed}
            onSelect={(s) => {
              setQuery(s);
              setTab("posts");
            }}
          />
        </View>
      )}

      {trimmed.length >= 1 && (
        <View style={[S.innerCol, { maxWidth: contentMaxWidth }]}>
          <View
            style={[S.segmentWrap, { backgroundColor: colors.bgElevated }]}
            accessibilityRole="tablist"
          >
            {(["top", "people", "posts"] as SearchTab[]).map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    haptics.selection();
                    setTab(t);
                  }}
                  style={[
                    S.segmentBtn,
                    active && { backgroundColor: colors.bgCanvas },
                  ]}
                  accessibilityRole="tab"
                  accessibilityLabel={t === "top" ? "Top results" : t === "people" ? "People" : "Posts"}
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      S.segmentText,
                      { color: active ? colors.textPrimary : colors.textSecondary },
                    ]}
                  >
                    {t === "top" ? "Top" : t === "people" ? "People" : "Posts"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {trimmed.length === 0 ? (
        <ScrollView
          contentContainerStyle={[
            S.scrollBody,
            { paddingBottom: insets.bottom + 96, maxWidth: contentMaxWidth },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Trending Hashtags */}
          {(hashtags as { tag: string; count: number }[]).length > 0 && (
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: colors.textPrimary }]}>Trending Topics</Text>
              <View style={S.hashtagGrid}>
                {(hashtags as { tag: string; count: number }[]).map(({ tag, count }) => (
                  <Pressable
                    key={tag}
                    onPress={() => {
                      haptics.selection();
                      setQuery(tag);
                      setTab("posts");
                    }}
                    onLongPress={async () => {
                      setLoadingInsights(true);
                      setTrendingInsights(null);
                      try {
                        const insight = await generateAITrendingInsights(tag);
                        setTrendingInsights({ tag, insight });
                      } finally {
                        setLoadingInsights(false);
                      }
                    }}
                    style={[
                      S.hashtagBtn,
                      { backgroundColor: colors.bgElevated, borderColor: colors.separator },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${tag}, ${count} posts`}
                  >
                    <Text style={[S.hashtagText, { color: colors.accentPrimary }]}>{tag}</Text>
                    <Text style={[S.hashtagCount, { color: colors.textSecondary }]}>
                      · {formatCount(count)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {trendingInsights && (
                <View
                  style={[
                    S.insightCard,
                    { backgroundColor: colors.bgElevated, borderColor: colors.separator },
                  ]}
                >
                  <Text style={[S.insightTitle, { color: colors.accentPrimary }]}>
                    Why {trendingInsights.tag} is trending
                  </Text>
                  <Text style={[S.insightBody, { color: colors.textPrimary }]}>
                    {trendingInsights.insight}
                  </Text>
                </View>
              )}
              {loadingInsights && (
                <ActivityIndicator
                  size="small"
                  color={colors.accentPrimary}
                  style={{ marginTop: 12 }}
                />
              )}
            </View>
          )}

          {/* Visual Bento Discovery Mosaic */}
          {visualPosts.length > 0 && (
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: colors.textPrimary }]}>Featured Visuals</Text>
              <View style={S.mosaicGrid}>
                {visualPosts.map((p, idx) => {
                  const thumb = resolveMediaUrl(p.media_urls?.[0]);
                  const isFeatured = idx === 0 && isDesktopWeb;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => router.push(`/post/${p.id}` as any)}
                      style={[
                        S.mosaicTile,
                        isFeatured && S.mosaicTileFeatured,
                        { backgroundColor: colors.bgElevated },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={p.content || "Featured post"}
                    >
                      <Image
                        source={{ uri: thumb }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                      {p.is_reel && (
                        <View style={S.mosaicBadge}>
                          <Feather name="play" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Suggested Creators */}
          {(suggested as Profile[]).length > 0 && (
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: colors.textPrimary }]}>Creators to Follow</Text>
              {(suggested as Profile[]).map((u) => {
                const isFollow = followingIds.has(u.id);
                return (
                  <Pressable
                    key={u.id}
                    onPress={() => router.push(`/user/${u.id}` as any)}
                    style={[S.userRow, { borderBottomColor: colors.separator }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${u.display_name}, @${u.username}`}
                  >
                    <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={46} />
                    <View style={S.userInfo}>
                      <Text style={[S.userName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {u.display_name}
                      </Text>
                      <Text style={[S.userMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        @{u.username} · {formatCount(u.followers_count)} followers
                      </Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        (e as any).stopPropagation?.();
                        toggleFollow(u.id);
                      }}
                      style={[
                        S.followBtn,
                        {
                          backgroundColor: isFollow ? colors.secondary : colors.accentPrimary,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={isFollow ? `Unfollow ${u.display_name}` : `Follow ${u.display_name}`}
                      accessibilityState={{ selected: isFollow }}
                    >
                      <Text
                        style={{
                          color: isFollow ? colors.textPrimary : "#FFFFFF",
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {isFollow ? "Following" : "Follow"}
                      </Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          )}

          {(hashtags as any[]).length === 0 &&
            (suggested as any[]).length === 0 &&
            visualPosts.length === 0 && (
              <View style={S.emptyState}>
                <Feather name="compass" size={44} color={colors.textTertiary} />
                <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>
                  Explore Vibe
                </Text>
                <Text style={[S.emptyDesc, { color: colors.textSecondary }]}>
                  Search for creators, topics, or hashtags across the community.
                </Text>
              </View>
            )}
        </ScrollView>
      ) : isLoading ? (
        <View style={S.center}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
      ) : !hasAnyResults ? (
        <View style={S.center}>
          <Feather name="search" size={40} color={colors.textTertiary} />
          <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>No results for "{trimmed}"</Text>
          <Text style={[S.emptyDesc, { color: colors.textSecondary }]}>
            Try another name, @username, or #hashtag.
          </Text>
        </View>
      ) : (
        <FlatList
          data={
            tab === "people"
              ? (people as any[])
              : tab === "posts"
              ? (posts as any[])
              : [
                  ...(people as Profile[]).slice(0, 4).map((p) => ({ kind: "person", item: p })),
                  ...(posts as Post[]).map((p) => ({ kind: "post", item: p })),
                ]
          }
          keyExtractor={(entry: any, idx) => entry?.id ?? `${entry?.kind}-${entry?.item?.id ?? idx}`}
          contentContainerStyle={[
            S.scrollBody,
            { paddingBottom: insets.bottom + 90, paddingTop: 6, maxWidth: contentMaxWidth },
          ]}
          renderItem={({ item: raw }) => {
            const isPerson = tab === "people" || (tab === "top" && raw.kind === "person");
            if (isPerson) {
              const u: Profile = tab === "top" ? raw.item : raw;
              const isFollow = followingIds.has(u.id);
              return (
                <Pressable
                  onPress={() => router.push(`/user/${u.id}` as any)}
                  style={[S.userRow, { borderBottomColor: colors.separator }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${u.display_name}, @${u.username}`}
                >
                  <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={46} />
                  <View style={S.userInfo}>
                    <Text style={[S.userName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {u.display_name}
                    </Text>
                    <Text style={[S.userMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      @{u.username} · {formatCount(u.followers_count)} followers
                    </Text>
                    {!!u.bio && (
                      <Text style={[S.userBio, { color: colors.textTertiary }]} numberOfLines={1}>
                        {u.bio}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={(e) => {
                      (e as any).stopPropagation?.();
                      toggleFollow(u.id);
                    }}
                    style={[
                      S.followBtn,
                      { backgroundColor: isFollow ? colors.secondary : colors.accentPrimary },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={isFollow ? `Unfollow ${u.display_name}` : `Follow ${u.display_name}`}
                  >
                    <Text
                      style={{
                        color: isFollow ? colors.textPrimary : "#FFFFFF",
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {isFollow ? "Following" : "Follow"}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            }

            const p: Post = tab === "top" ? raw.item : raw;
            const profile = p.profiles as Profile | undefined;
            const thumb = p.media_urls?.[0] ? resolveMediaUrl(p.media_urls[0]) : null;
            return (
              <Pressable
                onPress={() => router.push(`/post/${p.id}` as any)}
                style={[S.postRow, { borderBottomColor: colors.separator }]}
                accessibilityRole="button"
                accessibilityLabel={p.content || "Post result"}
              >
                <Avatar
                  name={profile?.display_name ?? "U"}
                  avatarUrl={profile?.avatar_url}
                  size={38}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[S.postAuthor, { color: colors.accentPrimary }]}>
                    @{profile?.username ?? "user"}
                  </Text>
                  <Text style={[S.postContent, { color: colors.textPrimary }]} numberOfLines={2}>
                    {p.content}
                  </Text>
                  <Text style={[S.postMetaText, { color: colors.textSecondary }]}>
                    {formatCount(p.likes_count)} likes · {formatCount(p.comments_count)} comments
                  </Text>
                </View>
                {thumb && <Image source={{ uri: thumb }} style={S.postThumb} resizeMode="cover" />}
              </Pressable>
            );
          }}
        />
      )}

      <AuthPromptModal
        visible={authPrompt}
        onDismiss={() => setAuthPrompt(false)}
        reason="Sign up to follow creators and save favorites."
      />
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  innerCol: {
    width: "100%",
    alignSelf: "center",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  aiLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 38,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aiLinkText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 46,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15.5,
    paddingVertical: 10,
  },
  clearBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  aiSuggestBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aiInlineLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 4,
  },
  aiInlineText: {
    fontSize: 12,
    fontWeight: "600",
  },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestText: {
    fontSize: 13,
    fontWeight: "500",
  },
  segmentWrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 3,
    borderRadius: RADIUS.sm,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  scrollBody: {
    width: "100%",
    alignSelf: "center",
  },
  section: {
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  hashtagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  hashtagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hashtagText: {
    fontSize: 14,
    fontWeight: "600",
  },
  hashtagCount: {
    fontSize: 12.5,
    fontVariant: ["tabular-nums"],
  },
  insightCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  insightBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  mosaicGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mosaicTile: {
    width: "31.5%",
    aspectRatio: 1,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    position: "relative",
  },
  mosaicTileFeatured: {
    width: "48%",
    aspectRatio: 4 / 3,
  },
  mosaicBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: 15,
    fontWeight: "600",
  },
  userMeta: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  userBio: {
    fontSize: 12.5,
  },
  followBtn: {
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  postRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  postAuthor: {
    fontSize: 13.5,
    fontWeight: "600",
    marginBottom: 2,
  },
  postContent: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  postMetaText: {
    fontSize: 12.5,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  postThumb: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.sm,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyDesc: {
    fontSize: 14.5,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
});
