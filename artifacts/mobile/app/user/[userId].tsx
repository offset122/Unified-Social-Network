import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Platform, Image, Alert, ScrollView, Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  fetchProfile, fetchUserPosts, followUser, unfollowUser, isFollowing,
  blockUser, getOrCreateDM, resolveMediaUrl, formatCount, timeAgo,
  type Post, type Profile,
} from "@/lib/db";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_SIZE = (SCREEN_WIDTH - 4) / 3;

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

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [postTab, setPostTab] = useState<"posts" | "reels">("posts");
  const [followLoading, setFollowLoading] = useState(false);

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

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
      {/* Back + More header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.topBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>{profile.username}</Text>
        {!isOwnProfile && (
          <Pressable hitSlop={8} style={styles.topBtn}
            onPress={() => Alert.alert("Options", undefined, [
              { text: "Block", style: "destructive", onPress: handleBlock },
              { text: "Report", onPress: () => {} },
              { text: "Cancel", style: "cancel" },
            ])}>
            <Feather name="more-horizontal" size={22} color={colors.foreground} />
          </Pressable>
        )}
      </View>

      {/* Cover */}
      <LinearGradient
        colors={["#1e1b4b", "#2d1b69", "#1e1b4b"]}
        style={[styles.cover, { backgroundColor: colors.secondary }]}>
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

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
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

      {/* Grid */}
      {(posts as Post[]).length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
          <Feather name={postTab === "posts" ? "grid" : "film"} size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>No {postTab} yet</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {(posts as Post[]).map(p => {
            const media = p.media_urls?.[0] ? resolveMediaUrl(p.media_urls[0]) : null;
            return (
              <Pressable key={p.id} style={styles.gridItem}
                onPress={() => router.push(`/post/${p.id}` as any)}>
                {media ? (
                  <Image source={{ uri: media }} style={styles.gridImg} resizeMode="cover" />
                ) : (
                  <View style={[styles.gridImg, { backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }]}>
                    <Feather name="file-text" size={20} color={colors.mutedForeground} />
                  </View>
                )}
                {p.media_type === "video" && (
                  <View style={{ position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, padding: 3 }}>
                    <Feather name="play" size={11} color="#fff" />
                  </View>
                )}
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)"]} style={styles.gridOverlay}>
                  <Feather name="heart" size={11} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>{formatCount(p.likes_count)}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, fontSize: 16, fontWeight: "700", textAlign: "center" },
  cover: { height: 140, position: "relative" },
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
  tabs: { flexDirection: "row", paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingRight: 20, position: "relative" },
  tabText: { fontSize: 14, fontWeight: "500" },
  tabLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 2, padding: 2 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, position: "relative", overflow: "hidden" },
  gridImg: { width: "100%", height: "100%" },
  gridOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: 35, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 6, paddingBottom: 5, gap: 3 },
});
