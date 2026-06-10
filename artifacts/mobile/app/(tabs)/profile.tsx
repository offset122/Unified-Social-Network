import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect } from "expo-router";
import { useGetMyProfile, useGetUserPosts, getGetUserPostsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { useColorScheme } from "react-native";

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center",
      borderWidth: 3, borderColor: "#fff",
    }}>
      <Text style={{ color: "#fff", fontSize: size * 0.35, fontWeight: "800" }}>{initials}</Text>
    </View>
  );
}

function StatBlock({ value, label, colors }: { value: number; label: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

type Post = { id: string; content: string; likesCount: number; commentsCount: number; createdAt: string };

export default function ProfileScreen() {
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isWeb = Platform.OS === "web";

  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: postsPage, isLoading: postsLoading } = useGetUserPosts(
    user?.id ?? "",
    undefined,
    { query: { enabled: !!user?.id, queryKey: getGetUserPostsQueryKey(user?.id ?? "") } },
  );

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const posts = (postsPage?.items ?? []) as Post[];
  const displayName = profile?.displayName ?? [user?.firstName, user?.lastName].filter(Boolean).join(" ") ?? "User";

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout },
    ]);
  };

  if (profileLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, flex: 1 }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 100 }}
      data={posts}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <LinearGradient
            colors={colorScheme === "dark" ? ["#1e1b4b", "#312e81"] : ["#ede9fe", "#ddd6fe"]}
            style={[styles.coverGradient, { paddingTop: isWeb ? 67 : insets.top + 12 }]}
          >
            <View style={styles.avatarRow}>
              <Avatar name={displayName} size={80} />
            </View>
          </LinearGradient>

          <View style={[styles.profileInfo, { borderBottomColor: colors.border }]}>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.displayName, { color: colors.foreground }]}>{displayName}</Text>
                {profile?.username ? (
                  <Text style={[styles.username, { color: colors.mutedForeground }]}>@{profile.username}</Text>
                ) : null}
              </View>
              <Link href="/edit-profile" asChild>
                <Pressable style={[styles.editBtn, { borderColor: colors.border }]}>
                  <Text style={[styles.editBtnText, { color: colors.foreground }]}>Edit Profile</Text>
                </Pressable>
              </Link>
            </View>

            {profile?.bio ? (
              <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <StatBlock value={profile?.postsCount ?? 0} label="Posts" colors={colors} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatBlock value={profile?.followersCount ?? 0} label="Followers" colors={colors} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatBlock value={profile?.followingCount ?? 0} label="Following" colors={colors} />
            </View>
          </View>

          {posts.length > 0 && (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, borderBottomColor: colors.border }]}>
              Posts
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Link href={`/post/${item.id}`} asChild>
          <Pressable style={[styles.postCard, { borderBottomColor: colors.border }]}>
            <Text style={[styles.postContent, { color: colors.foreground }]} numberOfLines={4}>{item.content}</Text>
            <View style={styles.postStats}>
              <Feather name="heart" size={13} color={colors.mutedForeground} />
              <Text style={[styles.postStatText, { color: colors.mutedForeground }]}>{item.likesCount}</Text>
              <Feather name="message-circle" size={13} color={colors.mutedForeground} style={{ marginLeft: 12 }} />
              <Text style={[styles.postStatText, { color: colors.mutedForeground }]}>{item.commentsCount}</Text>
            </View>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={
        !postsLoading ? (
          <View style={[styles.emptyPosts]}>
            <Feather name="grid" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No posts yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Share your first post to get started
            </Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        <Pressable onPress={handleLogout} style={[styles.logoutBtn, { borderColor: colors.border }]}>
          <Feather name="log-out" size={17} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>Log Out</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  coverGradient: { paddingBottom: 0 },
  avatarRow: { paddingHorizontal: 16, paddingBottom: 0, marginBottom: -40 },
  profileInfo: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  displayName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  username: { fontSize: 14, marginTop: 2 },
  editBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, marginTop: 4 },
  editBtnText: { fontSize: 14, fontWeight: "600" },
  bio: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBlock: { flex: 1, alignItems: "center", paddingVertical: 8 },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 32 },
  sectionLabel: { fontSize: 13, fontWeight: "600", paddingHorizontal: 16, paddingVertical: 10, textTransform: "uppercase", letterSpacing: 0.5, borderBottomWidth: StyleSheet.hairlineWidth },
  postCard: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  postContent: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  postStats: { flexDirection: "row", alignItems: "center" },
  postStatText: { fontSize: 13, marginLeft: 4 },
  emptyPosts: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 8 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 24, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  logoutText: { fontSize: 15, fontWeight: "600" },
});
