import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, FlatList, Pressable,
  ActivityIndicator, Platform, Image, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Redirect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  searchUsers, resolveMediaUrl, formatCount, getOrCreateDM,
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
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Discover</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
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

      {query.length >= 1 && (
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {(["people", "posts"] as SearchTab[]).map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={styles.tab}>
              <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground },
                tab === t && { fontWeight: "700" }]}>
                {t === "people" ? "People" : "Posts"}
              </Text>
              {tab === t && <View style={[styles.tabLine, { backgroundColor: colors.primary }]} />}
            </Pressable>
          ))}
        </View>
      )}

      {query.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
          {(hashtags as { tag: string; count: number }[]).length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trending</Text>
              <View style={styles.hashtagGrid}>
                {(hashtags as { tag: string; count: number }[]).map(({ tag, count }) => (
                  <Pressable key={tag} onPress={() => { setQuery(tag); setTab("posts"); }}
                    style={[styles.hashtagChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Text style={[styles.hashtagText, { color: colors.primary }]}>{tag}</Text>
                    <Text style={[styles.hashtagCount, { color: colors.mutedForeground }]}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {(suggested as Profile[]).length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Suggested People</Text>
              {(suggested as Profile[]).map(u => (
                <Pressable key={u.id} onPress={() => router.push(`/user/${u.id}` as any)}
                  style={[styles.userRow, { borderBottomColor: colors.border }]}>
                  <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={48} />
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: colors.foreground }]}>{u.display_name}</Text>
                    <Text style={[styles.userHandle, { color: colors.mutedForeground }]}>@{u.username}</Text>
                    <View style={styles.userStats}>
                      <Feather name="users" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.userStat, { color: colors.mutedForeground }]}>
                        {formatCount(u.followers_count)} followers
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => handleMessage(u.id, u.display_name)}
                    style={[styles.msgBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Feather name="message-circle" size={16} color={colors.foreground} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      ) : isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : !hasResults ? (
        <View style={styles.center}>
          <Feather name="search" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
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
              style={[styles.userRow, { borderBottomColor: colors.border }]}>
              <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={50} />
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{u.display_name}</Text>
                <Text style={[styles.userHandle, { color: colors.mutedForeground }]}>@{u.username}</Text>
                {u.bio && <Text style={[styles.userBio, { color: colors.mutedForeground }]} numberOfLines={1}>{u.bio}</Text>}
                <View style={styles.userStats}>
                  <Feather name="users" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.userStat, { color: colors.mutedForeground }]}>{formatCount(u.followers_count)} followers</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <Pressable onPress={() => router.push(`/user/${u.id}` as any)}
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>View</Text>
                </Pressable>
                <Pressable onPress={() => handleMessage(u.id, u.display_name)}
                  style={[styles.actionBtn, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }]}>
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
                style={[styles.postRow, { borderBottomColor: colors.border }]}>
                <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.postAuthor, { color: colors.primary }]}>@{profile?.username ?? "user"}</Text>
                  <Text style={[styles.postContent, { color: colors.foreground }]} numberOfLines={2}>{p.content}</Text>
                  <View style={styles.postMeta}>
                    <Feather name="heart" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.postMetaText, { color: colors.mutedForeground }]}>{formatCount(p.likes_count)}</Text>
                    <Feather name="message-circle" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.postMetaText, { color: colors.mutedForeground }]}>{formatCount(p.comments_count)}</Text>
                  </View>
                </View>
                {thumb && <Image source={{ uri: thumb }} style={styles.postThumb} resizeMode="cover" />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
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
