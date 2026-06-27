import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, FlatList, Pressable,
  ActivityIndicator, Platform, Image, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Redirect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  searchUsers, resolveMediaUrl, formatCount, getOrCreateDM,
  generateSearchSuggestions,
  type Profile, type Post,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";

type SearchTab = "people" | "posts";

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

async function searchPosts(query: string): Promise<Post[]> {
  const { data } = await supabase
    .from("posts").select("*, profiles(*)")
    .eq("visibility", "public").ilike("content", `%${query}%`)
    .order("created_at", { ascending: false }).limit(20);
  return (data ?? []).map((p: any) => ({ ...p, media_urls: p.media_urls ?? [] })) as Post[];
}

async function fetchSuggestedUsers(): Promise<Profile[]> {
  const { data } = await supabase.from("profiles").select("*")
    .order("followers_count", { ascending: false }).limit(10);
  return (data ?? []) as Profile[];
}

async function fetchTrendingHashtags(): Promise<{ tag: string; count: number }[]> {
  const { data } = await supabase.from("posts").select("content")
    .eq("visibility", "public").order("created_at", { ascending: false }).limit(200);
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
    .sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));
}

// ─── AI Search Suggestions ────────────────────────────────────────────────────

function AISearchSuggestions({ query, onSelect }: { query: string; onSelect: (s: string) => void }) {
  const colors = useColors();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSuggestions([]);
    if (query.length < 2) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await generateSearchSuggestions(query);
        setSuggestions(results);
      } finally {
        setLoading(false);
      }
    }, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  if (!loading && suggestions.length === 0) return null;

  return (
    <View style={[SS.aiSuggestBar, { borderBottomColor: colors.border }]}>
      <View style={[SS.aiBadge, { backgroundColor: colors.primary + "18" }]}>
        <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={SS.aiDot}>
          <Feather name="zap" size={9} color="#fff" />
        </LinearGradient>
        <Text style={[SS.aiText, { color: colors.primary }]}>AI</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} />
      ) : (
        suggestions.map((s, i) => (
          <Pressable key={i} onPress={() => onSelect(s)}
            style={[SS.suggestChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="search" size={11} color={colors.mutedForeground} />
            <Text style={[SS.suggestText, { color: colors.foreground }]}>{s}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

// ─── Search Screen ─────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const { isAuthenticated, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("people");

  const { data: people = [], isLoading: loadingPeople } = useQuery({
    queryKey: ["search-people", query],
    queryFn: () => searchUsers(query),
    enabled: query.length >= 1 && tab === "people",
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery({
    queryKey: ["search-posts", query],
    queryFn: () => searchPosts(query),
    enabled: query.length >= 1 && tab === "posts",
  });

  const { data: suggested = [] } = useQuery({
    queryKey: ["suggested-users"],
    queryFn: fetchSuggestedUsers,
    enabled: query.length === 0,
  });

  const { data: hashtags = [] } = useQuery({
    queryKey: ["trending-hashtags"],
    queryFn: fetchTrendingHashtags,
    enabled: query.length === 0,
  });

  const handleMessage = useCallback(async (otherId: string, otherName: string) => {
    if (!user?.id) return;
    try {
      const convoId = await getOrCreateDM(user.id, otherId);
      router.push({ pathname: `/chat/${convoId}`, params: { peerName: otherName } } as any);
    } catch {}
  }, [user?.id]);

  if (!isAuthenticated) return <Redirect href="/login" />;

  const isLoading = tab === "people" ? loadingPeople : loadingPosts;
  const results = tab === "people" ? (people as Profile[]) : (posts as Post[]);
  const hasResults = results.length > 0;

  return (
    <View style={[S.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[S.header, { borderBottomColor: colors.border }]}>
        <Text style={[S.title, { color: colors.foreground }]}>Discover</Text>
        <Pressable onPress={() => router.push("/ai-chat" as any)}
          style={[S.aiChatBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
          <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={S.aiChatDot}>
            <Feather name="zap" size={12} color="#fff" />
          </LinearGradient>
          <Text style={[S.aiChatText, { color: colors.primary }]}>AI Chat</Text>
        </Pressable>
      </View>

      <View style={[S.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[S.searchInput, { color: colors.foreground }]}
          placeholder="Search people, posts, #hashtags..."
          placeholderTextColor={colors.mutedForeground}
          value={query} onChangeText={setQuery}
          autoCapitalize="none" returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* AI suggestions appear below search bar */}
      {query.length >= 2 && (
        <AISearchSuggestions query={query} onSelect={s => { setQuery(s); setTab("posts"); }} />
      )}

      {query.length >= 1 && (
        <View style={[S.tabs, { borderBottomColor: colors.border }]}>
          {(["people", "posts"] as SearchTab[]).map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={S.tab}>
              <Text style={[S.tabText, { color: tab === t ? colors.primary : colors.mutedForeground },
                tab === t && { fontWeight: "700" }]}>
                {t === "people" ? "People" : "Posts"}
              </Text>
              {tab === t && <View style={[S.tabLine, { backgroundColor: colors.primary }]} />}
            </Pressable>
          ))}
        </View>
      )}

      {query.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
          {(hashtags as { tag: string; count: number }[]).length > 0 && (
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: colors.foreground }]}>Trending</Text>
              <View style={S.hashtagGrid}>
                {(hashtags as { tag: string; count: number }[]).map(({ tag, count }) => (
                  <Pressable key={tag} onPress={() => { setQuery(tag); setTab("posts"); }}
                    style={[S.hashtagChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Text style={[S.hashtagText, { color: colors.primary }]}>{tag}</Text>
                    <Text style={[S.hashtagCount, { color: colors.mutedForeground }]}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {(suggested as Profile[]).length > 0 && (
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: colors.foreground }]}>Suggested People</Text>
              {(suggested as Profile[]).map(u => (
                <Pressable key={u.id} onPress={() => router.push(`/user/${u.id}` as any)}
                  style={[S.userRow, { borderBottomColor: colors.border }]}>
                  <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={48} />
                  <View style={S.userInfo}>
                    <Text style={[S.userName, { color: colors.foreground }]}>{u.display_name}</Text>
                    <Text style={[S.userHandle, { color: colors.mutedForeground }]}>@{u.username}</Text>
                    <View style={S.userStats}>
                      <Feather name="users" size={11} color={colors.mutedForeground} />
                      <Text style={[S.userStat, { color: colors.mutedForeground }]}>
                        {formatCount(u.followers_count)} followers
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => handleMessage(u.id, u.display_name)}
                    style={[S.msgBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Feather name="message-circle" size={16} color={colors.foreground} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      ) : isLoading ? (
        <View style={S.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : !hasResults ? (
        <View style={S.center}>
          <Feather name="search" size={40} color={colors.mutedForeground} />
          <Text style={[S.emptyTitle, { color: colors.foreground }]}>No results</Text>
          <Text style={[S.emptyDesc, { color: colors.mutedForeground }]}>
            Try a different {tab === "people" ? "name or username" : "keyword or #hashtag"}
          </Text>
        </View>
      ) : tab === "people" ? (
        <FlatList
          data={people as Profile[]}
          keyExtractor={u => u.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 8 }}
          renderItem={({ item: u }) => (
            <Pressable onPress={() => router.push(`/user/${u.id}` as any)}
              style={[S.userRow, { borderBottomColor: colors.border }]}>
              <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={50} />
              <View style={S.userInfo}>
                <Text style={[S.userName, { color: colors.foreground }]}>{u.display_name}</Text>
                <Text style={[S.userHandle, { color: colors.mutedForeground }]}>@{u.username}</Text>
                {u.bio && <Text style={[S.userBio, { color: colors.mutedForeground }]} numberOfLines={1}>{u.bio}</Text>}
                <View style={S.userStats}>
                  <Feather name="users" size={11} color={colors.mutedForeground} />
                  <Text style={[S.userStat, { color: colors.mutedForeground }]}>{formatCount(u.followers_count)} followers</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <Pressable onPress={() => router.push(`/user/${u.id}` as any)}
                  style={[S.actionBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>View</Text>
                </Pressable>
                <Pressable onPress={() => handleMessage(u.id, u.display_name)}
                  style={[S.actionBtn, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }]}>
                  <Feather name="message-circle" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={posts as Post[]}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 8 }}
          renderItem={({ item: p }) => {
            const profile = p.profiles as Profile | undefined;
            const thumb = p.media_urls?.[0] ? resolveMediaUrl(p.media_urls[0]) : null;
            return (
              <Pressable onPress={() => router.push(`/post/${p.id}` as any)}
                style={[S.postRow, { borderBottomColor: colors.border }]}>
                <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={[S.postAuthor, { color: colors.primary }]}>@{profile?.username ?? "user"}</Text>
                  <Text style={[S.postContent, { color: colors.foreground }]} numberOfLines={2}>{p.content}</Text>
                  <View style={S.postMeta}>
                    <Feather name="heart" size={11} color={colors.mutedForeground} />
                    <Text style={[S.postMetaText, { color: colors.mutedForeground }]}>{formatCount(p.likes_count)}</Text>
                    <Feather name="message-circle" size={11} color={colors.mutedForeground} />
                    <Text style={[S.postMetaText, { color: colors.mutedForeground }]}>{formatCount(p.comments_count)}</Text>
                  </View>
                </View>
                {thumb && <Image source={{ uri: thumb }} style={S.postThumb} resizeMode="cover" />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  aiChatBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  aiChatDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  aiChatText: { fontSize: 13, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 16 },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  tab: { paddingVertical: 11, paddingRight: 24, position: "relative" },
  tabText: { fontSize: 15 },
  tabLine: { position: "absolute", bottom: 0, left: 0, right: 16, height: 2, borderRadius: 2 },
  section: { paddingTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12 },
  hashtagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  hashtagChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  hashtagText: { fontSize: 14, fontWeight: "700" },
  hashtagCount: { fontSize: 11, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: "700" },
  userHandle: { fontSize: 13, marginTop: 1 },
  userBio: { fontSize: 12, marginTop: 3 },
  userStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  userStat: { fontSize: 12 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  msgBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  postRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  postAuthor: { fontSize: 13, fontWeight: "700", marginBottom: 3 },
  postContent: { fontSize: 14, lineHeight: 20 },
  postMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  postMetaText: { fontSize: 12, marginRight: 6 },
  postThumb: { width: 60, height: 60, borderRadius: 10 },
});

const SS = StyleSheet.create({
  aiSuggestBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  aiDot: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  aiText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  aiBadge: {},
  aiLabel: {},
  aiLabelText: {},
  aiChip: {},
  aiChipText: {},
  suggestChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  suggestText: { fontSize: 13 },
  aiBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: "transparent" },
});
