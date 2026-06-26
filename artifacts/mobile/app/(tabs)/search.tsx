import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, FlatList, Pressable,
  ActivityIndicator, Platform, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Redirect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { searchUsers, resolveMediaUrl, formatCount, getOrCreateDM, type Profile } from "@/lib/db";

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setErr(true)} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function SearchScreen() {
  const { isAuthenticated, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const [query, setQuery] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchUsers(query),
    enabled: query.length >= 1,
  });

  const handleMessage = useCallback(async (otherId: string, otherName: string) => {
    if (!user?.id) return;
    try {
      const convoId = await getOrCreateDM(user.id, otherId);
      router.push({ pathname: `/chat/${convoId}`, params: { peerName: otherName } } as any);
    } catch {}
  }, [user?.id]);

  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Discover</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search people..." placeholderTextColor={colors.mutedForeground}
          value={query} onChangeText={setQuery}
          autoFocus={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {query.length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={[colors.primary + "22", colors.primary + "08"]}
            style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Feather name="search" size={36} color={colors.primary} />
          </LinearGradient>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Find people</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>Search by name or username to connect</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : users.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="user-x" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No users found</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>Try a different name</Text>
        </View>
      ) : (
        <FlatList
          data={users as Profile[]}
          keyExtractor={u => u.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 8 }}
          renderItem={({ item: u }) => (
            <Pressable
              onPress={() => router.push(`/user/${u.id}` as any)}
              style={({ pressed }) => [styles.userRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
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
                  style={[styles.followBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>View</Text>
                </Pressable>
                <Pressable onPress={() => handleMessage(u.id, u.display_name)}
                  style={[styles.followBtn, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }]}>
                  <Feather name="message-circle" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: "700" },
  userHandle: { fontSize: 13, marginTop: 1 },
  userBio: { fontSize: 12, marginTop: 3 },
  userStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  userStat: { fontSize: 12 },
  followBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
