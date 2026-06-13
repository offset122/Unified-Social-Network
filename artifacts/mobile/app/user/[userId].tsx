import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Image,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
  useGetUserPosts,
  getGetUserPostsQueryKey,
  useFollowUser,
  useUnfollowUser,
  useGetMyProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const apiPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
  return `${BASE_URL}${apiPath}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (avatarUrl && !err) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", borderWidth: 3, borderColor: "#fff" }}>
        <Image source={{ uri: resolveMediaUrl(avatarUrl) }} style={{ width: "100%", height: "100%" }} onError={() => setErr(true)} resizeMode="cover" />
      </View>
    );
  }
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <LinearGradient
      colors={[`hsl(${hue},60%,55%)`, `hsl(${(hue + 30) % 360},60%,42%)`]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff" }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "800" }}>{initials}</Text>
    </LinearGradient>
  );
}

function StatBlock({ value, label, colors }: { value: number; label: string; colors: any }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 }}>{formatNum(value)}</Text>
      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const [optimisticFollow, setOptimisticFollow] = useState<boolean | null>(null);

  const { data: profile, isLoading } = useGetUserProfile(
    userId as string,
    { query: { enabled: !!userId, queryKey: getGetUserProfileQueryKey(userId as string) } },
  );
  const { data: postsPage, isLoading: postsLoading } = useGetUserPosts(
    userId as string,
    undefined,
    { query: { enabled: !!userId, queryKey: getGetUserPostsQueryKey(userId as string) } },
  );
  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();

  const isFollowing = optimisticFollow !== null ? optimisticFollow : (profile?.isFollowing ?? false);
  const isMe = me?.id === userId;

  const handleFollow = () => {
    if (!profile) return;
    const next = !isFollowing;
    setOptimisticFollow(next);
    const mut = next ? followUser : unfollowUser;
    mut.mutate({ userId: userId as string }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(userId as string) });
        setOptimisticFollow(null);
      },
      onError: () => setOptimisticFollow(null),
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>User not found</Text>
      </View>
    );
  }

  const posts = postsPage?.items ?? [];

  const Header = (
    <View>
      {/* Cover gradient */}
      <LinearGradient
        colors={["#7c3aed", "#4f46e5", "#0ea5e9"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 130 }}
      />
      {/* Avatar + actions row */}
      <View style={{ paddingHorizontal: 16, marginTop: -44 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} size={88} />
          {isMe ? (
            <Pressable
              onPress={() => router.push("/edit-profile")}
              style={({ pressed }) => [styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>Edit Profile</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable
                onPress={() => router.push(`/chat/${userId}`)}
                style={({ pressed }) => [styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="mail" size={16} color={colors.foreground} />
              </Pressable>
              <Pressable
                onPress={handleFollow}
                style={({ pressed }) => [
                  styles.followBtn,
                  { backgroundColor: isFollowing ? colors.secondary : colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={{ color: isFollowing ? colors.foreground : "#fff", fontWeight: "700", fontSize: 14 }}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Name + bio */}
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, letterSpacing: -0.4 }}>{profile.displayName}</Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 2 }}>@{profile.username}</Text>
          {profile.bio ? <Text style={{ fontSize: 15, color: colors.foreground, marginTop: 10, lineHeight: 22 }}>{profile.bio}</Text> : null}
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          <StatBlock value={profile.postsCount ?? 0} label="Posts" colors={colors} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock value={profile.followersCount ?? 0} label="Followers" colors={colors} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock value={profile.followingCount ?? 0} label="Following" colors={colors} />
        </View>
      </View>

      {/* Posts header */}
      <View style={[styles.postsHeader, { borderBottomColor: colors.border, borderTopColor: colors.border }]}>
        <Feather name="grid" size={15} color={colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginLeft: 6 }}>Posts</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: profile.displayName, headerTransparent: false }} />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={Header}
        ListEmptyComponent={
          postsLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={{ padding: 40, alignItems: "center", gap: 8 }}>
              <Feather name="file-text" size={32} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>No posts yet</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/post/${item.id}`)}
            style={({ pressed }) => [
              styles.postCard,
              { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            {item.mediaUrls && item.mediaUrls.length > 0 && (
              <Image
                source={{ uri: resolveMediaUrl(item.mediaUrls[0]) }}
                style={styles.postImage}
                resizeMode="cover"
              />
            )}
            {item.content ? (
              <Text style={[styles.postContent, { color: colors.foreground }]} numberOfLines={3}>
                {item.content}
              </Text>
            ) : null}
            <View style={styles.postMeta}>
              <Text style={[styles.postTime, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={styles.postStat}>
                  <Feather name="heart" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.postStatNum, { color: colors.mutedForeground }]}>{formatNum(item.likesCount)}</Text>
                </View>
                <View style={styles.postStat}>
                  <Feather name="message-circle" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.postStatNum, { color: colors.mutedForeground }]}>{formatNum(item.commentsCount)}</Text>
                </View>
                {(item as any).viewsCount != null && (
                  <View style={styles.postStat}>
                    <Feather name="eye" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.postStatNum, { color: colors.mutedForeground }]}>{formatNum((item as any).viewsCount)}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  actionBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  followBtn: {
    paddingHorizontal: 24, paddingVertical: 8,
    borderRadius: 20,
  },
  statsRow: {
    flexDirection: "row", marginTop: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  postsHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  postCard: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  postImage: { width: "100%", height: 180, borderRadius: 10, marginBottom: 10 },
  postContent: { fontSize: 15, lineHeight: 22 },
  postMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  postTime: { fontSize: 12 },
  postStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatNum: { fontSize: 12 },
});
