import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Platform, TextInput,
} from "react-native";
import { Link, Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { fetchConversations, timeAgo, resolveMediaUrl, type Conversation, type Profile } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Image } from "react-native";

function Avatar({ name, avatarUrl, size, online }: { name: string; avatarUrl?: string | null; size: number; online?: boolean }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <View style={{ position: "relative" }}>
      {avatarUrl && !err ? (
        <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setErr(true)} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2,
          backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
        </View>
      )}
      {online && <View style={{ position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#fff" }} />}
    </View>
  );
}

export default function MessagesScreen() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => fetchConversations(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  // Realtime: subscribe to new messages
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel("messages-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const totalUnread = (conversations as Conversation[]).reduce((s, c) => s + (c.unread_count ?? 0), 0);
  const filtered = search
    ? (conversations as Conversation[]).filter(c =>
        (c.other_user?.display_name ?? c.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (c.other_user?.username ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : (conversations as Conversation[]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
          {totalUnread > 0 && (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{totalUnread} unread</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => router.push("/create-group" as any)}
            style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="users" size={17} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/search" as any)}
            style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="edit" size={17} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search messages..." placeholderTextColor={colors.mutedForeground}
          value={search} onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={[colors.primary + "22", colors.primary + "08"]}
            style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Feather name="message-square" size={36} color={colors.primary} />
          </LinearGradient>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {search ? "No results found" : "No conversations yet"}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            {search ? "Try a different search" : "Search for friends to start chatting"}
          </Text>
          {!search && (
            <Pressable onPress={() => router.push("/(tabs)/search" as any)}
              style={[styles.newChatBtn, { backgroundColor: colors.primary }]}>
              <Feather name="user-plus" size={16} color="#fff" />
              <Text style={styles.newChatBtnText}>Find Friends</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          renderItem={({ item: convo }) => {
            const other = convo.other_user as Profile | undefined;
            const name = convo.type === "group" ? (convo.name ?? "Group") : (other?.display_name ?? "User");
            const avatar = convo.type === "group" ? convo.avatar_url : other?.avatar_url;
            const hasUnread = (convo.unread_count ?? 0) > 0;

            return (
              <Pressable
                onPress={() => router.push({ pathname: `/chat/${convo.id}`, params: { peerName: name } } as any)}
                style={({ pressed }) => [styles.convoRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={{ position: "relative" }}>
                  <Avatar name={name} avatarUrl={avatar} size={52} />
                  {convo.type === "group" && (
                    <View style={[styles.groupBadge, { backgroundColor: colors.primary }]}>
                      <Feather name="users" size={9} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={styles.convoInfo}>
                  <View style={styles.convoTopRow}>
                    <Text style={[styles.convoName, { color: colors.foreground }, hasUnread && styles.convoNameBold]}
                      numberOfLines={1}>{name}</Text>
                    <Text style={[styles.convoTime, { color: hasUnread ? colors.primary : colors.mutedForeground }]}>
                      {convo.last_message_at ? timeAgo(convo.last_message_at) : ""}
                    </Text>
                  </View>
                  <View style={styles.convoBottomRow}>
                    <Text style={[styles.convoLast, { color: hasUnread ? colors.foreground : colors.mutedForeground },
                      hasUnread && { fontWeight: "600" }]}
                      numberOfLines={1}>{convo.last_message ?? "Start a conversation"}</Text>
                    {hasUnread && (
                      <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.unreadCount}>{convo.unread_count! > 99 ? "99+" : convo.unread_count}</Text>
                      </View>
                    )}
                  </View>
                </View>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  newChatBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 12 },
  newChatBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  convoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  groupBadge: { position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  convoInfo: { flex: 1, minWidth: 0 },
  convoTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
  convoName: { fontSize: 15, fontWeight: "500", flex: 1, marginRight: 8 },
  convoNameBold: { fontWeight: "700" },
  convoTime: { fontSize: 12 },
  convoBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convoLast: { fontSize: 13, flex: 1, marginRight: 8 },
  unreadBadge: { borderRadius: 12, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadCount: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
