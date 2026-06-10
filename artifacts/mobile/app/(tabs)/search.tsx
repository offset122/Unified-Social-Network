import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetExplorePosts,
  useSearch,
  useFollowUser,
  useUnfollowUser,
  getGetExplorePostsQueryKey,
  getSearchQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

type SearchUser = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isFollowing: boolean;
};

type ExplorePost = {
  id: string;
  content: string;
  author: { displayName: string };
  likesCount: number;
  commentsCount: number;
  createdAt: string;
};

function UserRow({ user }: { user: SearchUser }) {
  const colors = useColors();
  const qc = useQueryClient();
  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();
  const [following, setFollowing] = useState(user.isFollowing);

  const handleFollow = () => {
    const next = !following;
    setFollowing(next);
    const mutation = next ? followUser : unfollowUser;
    mutation.mutate({ userId: user.id }, {
      onError: () => setFollowing(!next),
    });
  };

  return (
    <Link href={`/user/${user.id}`} asChild>
      <Pressable style={[styles.userRow, { borderBottomColor: colors.border }]}>
        <Avatar name={user.displayName} size={44} />
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.foreground }]}>{user.displayName}</Text>
          <Text style={[styles.userHandle, { color: colors.mutedForeground }]}>@{user.username}</Text>
        </View>
        <Pressable
          onPress={(e) => { e.preventDefault?.(); handleFollow(); }}
          style={[
            styles.followBtn,
            following
              ? { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }
              : { backgroundColor: colors.primary },
          ]}
        >
          <Text style={[styles.followText, { color: following ? colors.foreground : "#fff" }]}>
            {following ? "Following" : "Follow"}
          </Text>
        </Pressable>
      </Pressable>
    </Link>
  );
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text.trim()), 400);
  }, []);

  const { data: explore, isLoading: exploreLoading } = useGetExplorePosts(
    undefined,
    { query: { enabled: !debouncedQuery, queryKey: getGetExplorePostsQueryKey() } },
  );

  const { data: searchResults, isLoading: searchLoading } = useSearch(
    { q: debouncedQuery },
    { query: { enabled: !!debouncedQuery, queryKey: getSearchQueryKey({ q: debouncedQuery }) } },
  );

  const explorePosts = (explore?.items ?? []) as ExplorePost[];
  const searchUsers = (searchResults?.users ?? []) as SearchUser[];
  const searchPosts = (searchResults?.posts ?? []) as ExplorePost[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Explore</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.secondary }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search people, posts..."
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={handleChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => { setQuery(""); setDebouncedQuery(""); }} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {!debouncedQuery ? (
        exploreLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={explorePosts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListHeaderComponent={
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Trending Posts</Text>
            }
            renderItem={({ item }) => (
              <Link href={`/post/${item.id}`} asChild>
                <Pressable style={[styles.exploreCard, { borderBottomColor: colors.border }]}>
                  <View style={styles.exploreCardHeader}>
                    <Avatar name={item.author.displayName} size={32} />
                    <Text style={[styles.exploreAuthor, { color: colors.foreground }]}>{item.author.displayName}</Text>
                  </View>
                  <Text style={[styles.exploreContent, { color: colors.foreground }]} numberOfLines={3}>
                    {item.content}
                  </Text>
                  <View style={styles.exploreStats}>
                    <Feather name="heart" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.statText, { color: colors.mutedForeground }]}>{item.likesCount}</Text>
                    <Feather name="message-circle" size={13} color={colors.mutedForeground} style={{ marginLeft: 10 }} />
                    <Text style={[styles.statText, { color: colors.mutedForeground }]}>{item.commentsCount}</Text>
                  </View>
                </Pressable>
              </Link>
            )}
            ListEmptyComponent={
              <View style={styles.center}>
                <Feather name="compass" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nothing to explore yet</Text>
              </View>
            }
          />
        )
      ) : searchLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={[
            ...(searchUsers.length > 0 ? [{ type: "header", label: "People" }] : []),
            ...searchUsers.map((u) => ({ type: "user", ...u })),
            ...(searchPosts.length > 0 ? [{ type: "header", label: "Posts" }] : []),
            ...searchPosts.map((p) => ({ type: "post", ...p })),
          ] as Array<{ type: string; [key: string]: unknown }>}
          keyExtractor={(item, i) => item.type + "_" + (item.id ?? i)}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="search" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No results for "{debouncedQuery}"</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === "header") {
              return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{item.label as string}</Text>;
            }
            if (item.type === "user") {
              return <UserRow user={item as unknown as SearchUser} />;
            }
            const post = item as unknown as ExplorePost;
            return (
              <Link href={`/post/${post.id}`} asChild>
                <Pressable style={[styles.exploreCard, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.exploreContent, { color: colors.foreground }]} numberOfLines={3}>{post.content}</Text>
                </Pressable>
              </Link>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "600", paddingHorizontal: 16, paddingVertical: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  userRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: { flex: 1, marginLeft: 12 },
  userName: { fontWeight: "600", fontSize: 15 },
  userHandle: { fontSize: 13, marginTop: 1 },
  followBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  followText: { fontSize: 13, fontWeight: "600" },
  exploreCard: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  exploreCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  exploreAuthor: { fontWeight: "600", fontSize: 14 },
  exploreContent: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  exploreStats: { flexDirection: "row", alignItems: "center" },
  statText: { fontSize: 13, marginLeft: 4 },
});
