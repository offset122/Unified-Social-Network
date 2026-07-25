import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, Image, Modal, TextInput,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { fetchBlockedUsers, unblockUser, blockUser, searchUsers, resolveMediaUrl, type Profile } from "@/lib/db";
import { supabase } from "@/lib/supabase";

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

function BlockSearchResults({ query, onBlock, colors }: { query: string; onBlock?: (id: string) => void; colors: any }) {
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["block-search", query],
    queryFn: () => searchUsers(query),
    enabled: query.length >= 2,
  });

  if (!query || query.length < 2) return null;

  return (
    <FlatList
      data={results as Profile[]}
      keyExtractor={p => p.id}
      ListEmptyComponent={
        !isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground }}>Type at least 2 characters</Text>
          </View>
        ) : null
      }
      renderItem={({ item: u }) => (
        <Pressable onPress={() => onBlock?.(u.id)} style={[styles.searchRow, { borderBottomColor: colors.border }]}>
          <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.searchName, { color: colors.foreground }]}>{u.display_name}</Text>
            <Text style={[styles.searchHandle, { color: colors.mutedForeground }]}>@{u.username}</Text>
          </View>
          <Pressable onPress={() => onBlock?.(u.id)} style={styles.blockBtn}>
            <Text style={styles.blockBtnText}>Block</Text>
          </Pressable>
        </Pressable>
      )}
    />
  );
}

export default function BlockedUsersScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: blocked = [], isLoading } = useQuery({
    queryKey: ["blocked-users", user?.id],
    queryFn: () => fetchBlockedUsers(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockQuery, setBlockQuery] = useState("");

  const handleUnblock = (profile: Profile) => {
    Alert.alert(
      "Unblock",
      `Unblock @${profile.username}? They'll be able to see your profile and message you again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock", onPress: async () => {
            if (!user?.id) return;
            await unblockUser(user.id, profile.id);
            qc.invalidateQueries({ queryKey: ["blocked-users"] });
          },
        },
      ]
    );
  };

  const handleBlockUser = async (targetId: string) => {
    if (!user?.id) return;
    await blockUser(user.id, targetId);
    qc.invalidateQueries({ queryKey: ["blocked-users"] });
    setBlockModalOpen(false);
    setBlockQuery("");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Blocked Users</Text>
        <Pressable onPress={() => setBlockModalOpen(true)} hitSlop={8}>
          <Feather name="user-x" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (blocked as Profile[]).length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={[colors.primary + "22", colors.primary + "08"]}
            style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Feather name="user-x" size={36} color={colors.primary} />
          </LinearGradient>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No blocked users</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Users you block won't be able to contact you.
          </Text>
        </View>
      ) : (
        <FlatList
          data={blocked as Profile[]}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item: p }) => (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Avatar name={p.display_name} avatarUrl={p.avatar_url} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{p.display_name}</Text>
                <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{p.username}</Text>
              </View>
              <Pressable
                onPress={() => handleUnblock(p)}
                style={[styles.unblockBtn, { borderColor: colors.primary }]}
              >
                <Text style={[styles.unblockText, { color: colors.primary }]}>Unblock</Text>
              </Pressable>
            </View>
          )}
        />
      )}
      {/* Block someone modal */}
      <Modal visible={blockModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBlockModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: insets.top + 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setBlockModalOpen(false)} hitSlop={8}><Feather name="x" size={20} color={colors.foreground} /></Pressable>
            <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700" }}>Block Someone</Text>
            <View style={{ width: 20 }} />
          </View>
          <View style={{ padding: 16 }}>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, backgroundColor: colors.secondary }}
              placeholder="Search people..."
              placeholderTextColor={colors.mutedForeground}
              value={blockQuery}
              onChangeText={setBlockQuery}
              autoFocus
            />
            <BlockSearchResults query={blockQuery} onBlock={handleBlockUser} colors={colors} />
          </View>
        </View>
      </Modal>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: "700" },
  handle: { fontSize: 13, marginTop: 1 },
  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 18, borderWidth: 1.5,
  },
  unblockText: { fontSize: 13, fontWeight: "700" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchName: { fontSize: 15, fontWeight: "700" },
  searchHandle: { fontSize: 13, marginTop: 1 },
  blockBtn: { backgroundColor: "#ef4444", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  blockBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
