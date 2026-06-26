import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  TextInput,
  Animated,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import GuestScreen from "@/components/GuestScreen";
import { useColors } from "@/hooks/useColors";
import {
  fetchConversations,
  timeAgo,
  resolveMediaUrl,
  type Conversation,
  type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Image } from "react-native";

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  size,
  online,
  hasUnread,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
  online?: boolean;
  hasUnread?: boolean;
}) {
  const [err, setErr] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Generate a deterministic hue from the name for the fallback gradient
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const avatarColors: [string, string] = [
    `hsl(${hue}, 60%, 50%)`,
    `hsl(${(hue + 40) % 360}, 70%, 38%)`,
  ];

  // Subtle pulse ring when there are unread messages
  useEffect(() => {
    if (!hasUnread) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasUnread]);

  return (
    <View style={{ position: "relative" }}>
      {/* Unread pulse ring */}
      {hasUnread && (
        <Animated.View
          style={{
            position: "absolute",
            width: size + 8,
            height: size + 8,
            borderRadius: (size + 8) / 2,
            backgroundColor: "rgba(99,102,241,0.25)",
            top: -4,
            left: -4,
            transform: [{ scale: pulseAnim }],
          }}
        />
      )}

      {avatarUrl && !err ? (
        <Image
          source={{ uri: resolveMediaUrl(avatarUrl) }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: hasUnread ? 2 : 0,
            borderColor: "#6366F1",
          }}
          onError={() => setErr(true)}
        />
      ) : (
        <LinearGradient
          colors={avatarColors}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: hasUnread ? 2 : 0,
            borderColor: "#6366F1",
          }}
        >
          <Text
            style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700", letterSpacing: 0.5 }}
          >
            {initials}
          </Text>
        </LinearGradient>
      )}

      {/* Online dot */}
      {online && (
        <View
          style={{
            position: "absolute",
            bottom: 1,
            right: 1,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: "#22c55e",
            borderWidth: 2,
            borderColor: "#0F1117",
          }}
        />
      )}
    </View>
  );
}

// ─── ConversationRow ────────────────────────────────────────────────────────────

function ConversationRow({
  convo,
  onPress,
}: {
  convo: Conversation;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const other = convo.other_user as Profile | undefined;
  const isGroup = convo.type === "group";
  const name = isGroup
    ? convo.name ?? "Group"
    : other?.display_name ?? other?.username ?? "User";
  const avatar = isGroup ? convo.avatar_url : other?.avatar_url;
  const hasUnread = (convo.unread_count ?? 0) > 0;

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.rowOuter, { transform: [{ scale: scaleAnim }] }]}>
        {/* Left accent line for unread */}
        <View style={[styles.accentLine, { backgroundColor: hasUnread ? "#6366F1" : "transparent" }]} />

        <View style={styles.rowInner}>
          {/* Avatar */}
          <View style={{ position: "relative" }}>
            <Avatar
              name={name}
              avatarUrl={avatar}
              size={52}
              hasUnread={hasUnread}
            />
            {isGroup && (
              <View style={styles.groupBadge}>
                <Feather name="users" size={8} color="#fff" />
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.rowContent}>
            <View style={styles.rowTop}>
              <Text
                style={[styles.rowName, hasUnread && styles.rowNameBold]}
                numberOfLines={1}
              >
                {name}
              </Text>
              <Text style={[styles.rowTime, hasUnread && styles.rowTimeActive]}>
                {convo.last_message_at ? timeAgo(convo.last_message_at) : ""}
              </Text>
            </View>

            <View style={styles.rowBottom}>
              <Text
                style={[styles.rowPreview, hasUnread && styles.rowPreviewBold]}
                numberOfLines={1}
              >
                {convo.last_message ?? "Tap to start chatting"}
              </Text>
              {hasUnread && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {convo.unread_count! > 99 ? "99+" : convo.unread_count}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── MessagesScreen ────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { isAuthenticated, isLoading: authLoading, user, isGuest } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const searchRef = useRef<TextInput>(null);
  const headerOpacity = useRef(new Animated.Value(0)).current;

  // Fade in on mount
  useEffect(() => {
    Animated.timing(headerOpacity, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => fetchConversations(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  // Realtime: subscribe to new messages
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`messages-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => qc.invalidateQueries({ queryKey: ["conversations", user.id] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  if (authLoading) return null;
  if (isGuest)
    return (
      <GuestScreen
        icon="message-square"
        title="Message Anyone"
        subtitle="Send DMs, create groups, and make audio or video calls with your friends."
        perks={[
          "Direct messages with anyone",
          "Group conversations",
          "Audio & video calls",
          "Share posts in chat",
        ]}
      />
    );
  if (!isAuthenticated) return <Redirect href="/login" />;

  const totalUnread = (conversations as Conversation[]).reduce(
    (s, c) => s + (c.unread_count ?? 0),
    0
  );

  const filtered = search.trim()
    ? (conversations as Conversation[]).filter((c) => {
        const term = search.toLowerCase();
        const displayName = (c.other_user?.display_name ?? c.name ?? "").toLowerCase();
        const username = (c.other_user?.username ?? "").toLowerCase();
        return displayName.includes(term) || username.includes(term);
      })
    : (conversations as Conversation[]);

  const paddingTop = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.screen, { paddingTop }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={["#0F1117", "#13151F", "#0F1117"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <Animated.View style={{ flex: 1, opacity: headerOpacity }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSub}>
              {totalUnread > 0
                ? `${totalUnread} unread conversation${totalUnread > 1 ? "s" : ""}`
                : `${(conversations as Conversation[]).length} conversation${(conversations as Conversation[]).length !== 1 ? "s" : ""}`}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push("/create-group" as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Feather name="users" size={18} color="#A5B4FC" />
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/search" as any)}
              style={({ pressed }) => [styles.iconBtn, styles.iconBtnPrimary, pressed && { opacity: 0.75 }]}
            >
              <Feather name="edit-2" size={17} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* ── Search Bar ── */}
        <Pressable onPress={() => searchRef.current?.focus()}>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color="#6366F1" />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search conversations…"
              placeholderTextColor="#4B5168"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="never"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={10} style={styles.clearBtn}>
                <Feather name="x" size={13} color="#6B7280" />
              </Pressable>
            )}
          </View>
        </Pressable>

        {/* ── Section Label ── */}
        {!search && filtered.length > 0 && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>RECENT</Text>
            <View style={styles.sectionLine} />
          </View>
        )}

        {/* ── Content ── */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#6366F1" size="large" />
            <Text style={styles.loadingText}>Loading conversations…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <LinearGradient
              colors={["rgba(99,102,241,0.18)", "rgba(99,102,241,0.04)"]}
              style={styles.emptyIconWrap}
            >
              <Feather name="message-square" size={38} color="#6366F1" />
            </LinearGradient>
            <Text style={styles.emptyTitle}>
              {search ? "No results" : "Nothing here yet"}
            </Text>
            <Text style={styles.emptyDesc}>
              {search
                ? `No conversations matching "${search}"`
                : "Find friends and start your first conversation"}
            </Text>
            {!search && (
              <Pressable
                onPress={() => router.push("/(tabs)/search" as any)}
                style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.8 }]}
              >
                <LinearGradient
                  colors={["#6366F1", "#818CF8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.emptyBtnGrad}
                >
                  <Feather name="user-plus" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Find Friends</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item: convo }) => (
              <ConversationRow
                convo={convo}
                onPress={() =>
                  router.push({
                    pathname: `/chat/${convo.id}`,
                    params: {
                      peerName:
                        convo.type === "group"
                          ? convo.name ?? "Group"
                          : convo.other_user?.display_name ?? "User",
                    },
                  } as any)
                }
              />
            )}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0F1117",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#E2E8F0",
    letterSpacing: -0.8,
  },
  headerSub: {
    fontSize: 12,
    color: "#4B5168",
    marginTop: 2,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1A1D27",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#252836",
  },
  iconBtnPressed: {
    backgroundColor: "#252836",
  },
  iconBtnPrimary: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "#1A1D27",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#252836",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#E2E8F0",
    paddingVertical: 0,
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#252836",
    alignItems: "center",
    justifyContent: "center",
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 6,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4B5168",
    letterSpacing: 1.5,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1A1D27",
  },

  // Conversation row
  rowOuter: {
    flexDirection: "row",
    backgroundColor: "transparent",
  },
  accentLine: {
    width: 3,
    borderRadius: 2,
    marginVertical: 8,
    marginLeft: 4,
  },
  rowInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#C4C9D9",
    flex: 1,
    marginRight: 8,
  },
  rowNameBold: {
    fontWeight: "700",
    color: "#E2E8F0",
  },
  rowTime: {
    fontSize: 11,
    color: "#4B5168",
    fontWeight: "500",
  },
  rowTimeActive: {
    color: "#6366F1",
    fontWeight: "600",
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowPreview: {
    fontSize: 13,
    color: "#4B5168",
    flex: 1,
    marginRight: 8,
  },
  rowPreviewBold: {
    color: "#8B93A8",
    fontWeight: "500",
  },
  badge: {
    backgroundColor: "#6366F1",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  groupBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0F1117",
  },
  separator: {
    height: 1,
    backgroundColor: "#1A1D27",
    marginLeft: 83,
  },

  // States
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#4B5168",
    fontSize: 14,
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#E2E8F0",
    letterSpacing: -0.3,
  },
  emptyDesc: {
    fontSize: 14,
    color: "#4B5168",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 14,
    borderRadius: 24,
    overflow: "hidden",
  },
  emptyBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  emptyBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});