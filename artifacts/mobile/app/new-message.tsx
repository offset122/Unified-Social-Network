import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, FlatList, Pressable,
  ActivityIndicator, Image,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { searchUsers, getOrCreateDM, resolveMediaUrl, formatCount, type Profile } from "@/lib/db";

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

export default function NewMessageScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search-dm", query],
    queryFn: () => searchUsers(query),
    enabled: query.length >= 1,
  });

  const handleOpen = useCallback(async (profile: Profile) => {
    if (!user?.id) return;
    setOpening(profile.id);
    try {
      const convoId = await getOrCreateDM(user.id, profile.id);
      router.replace({
        pathname: `/chat/${convoId}`,
        params: { peerName: profile.display_name, peerAvatar: profile.avatar_url ?? "" },
      } as any);
    } catch {
      setOpening(null);
    }
  }, [user?.id]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>New Message</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search people..."
          placeholderTextColor={colors.mutedForeground}
          value={query} onChangeText={setQuery}
          autoFocus autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {isFetching ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={results as Profile[]}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            query.length > 0 ? (
              <View style={styles.center}>
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>No users found</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Feather name="users" size={36} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 14, marginTop: 10 }}>
                  Search for someone to message
                </Text>
              </View>
            )
          }
          renderItem={({ item: p }) => (
            <Pressable
              onPress={() => handleOpen(p)}
              style={[styles.row, { borderBottomColor: colors.border, opacity: opening === p.id ? 0.6 : 1 }]}
            >
              <Avatar name={p.display_name} avatarUrl={p.avatar_url} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{p.display_name}</Text>
                <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{p.username}</Text>
              </View>
              {opening === p.id
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Feather name="chevron-right" size={18} color={colors.mutedForeground} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    margin: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: "700" },
  handle: { fontSize: 13, marginTop: 1 },
});
