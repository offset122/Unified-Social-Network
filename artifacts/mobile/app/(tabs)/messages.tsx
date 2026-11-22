import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import GuestScreen from "@/components/GuestScreen";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { GlassSurface } from "@/components/GlassSurface";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";
import {
  fetchConversations,
  timeAgo,
  type Conversation,
  type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";

type FilterTab = "all" | "unread" | "groups";

function ConversationRow({
  convo,
  onPress,
}: {
  convo: Conversation;
  onPress: () => void;
}) {
  const colors = useColors();
  const other = convo.other_user as Profile | undefined;
  const isGroup = convo.type === "group";
  const name = isGroup
    ? convo.name ?? "Group"
    : other?.display_name?.trim() || other?.username || "User";
  const avatar = isGroup ? convo.avatar_url : other?.avatar_url;
  const hasUnread = (convo.unread_count ?? 0) > 0;

  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.rowInner,
        pressed && { backgroundColor: colors.accentTint },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${name}${hasUnread ? `, ${convo.unread_count} unread` : ""}`}
    >
      <View style={{ position: "relative" }}>
        <Avatar
          name={name}
          avatarUrl={avatar}
          size={50}
          canvasColor={colors.bgCanvas}
        />
        {isGroup && (
          <View
            style={[
              styles.groupBadge,
              {
                backgroundColor: colors.accentPrimary,
                borderColor: colors.bgCanvas,
              },
            ]}
          >
            <Feather name="users" size={9} color="#FFFFFF" />
          </View>
        )}
      </View>

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowName,
              { color: colors.textPrimary },
              hasUnread && styles.rowNameBold,
            ]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={[
              styles.rowTime,
              {
                color: hasUnread ? colors.accentPrimary : colors.textTertiary,
                fontWeight: hasUnread ? "600" : "500",
              },
            ]}
          >
            {convo.last_message_at ? timeAgo(convo.last_message_at) : ""}
          </Text>
        </View>

        <View style={styles.rowBottom}>
          <Text
            style={[
              styles.rowPreview,
              {
                color: hasUnread ? colors.textPrimary : colors.textSecondary,
                fontWeight: hasUnread ? "500" : "400",
              },
            ]}
            numberOfLines={1}
          >
            {convo.last_message ?? "Tap to start chatting"}
          </Text>
          {hasUnread && (
            <View style={[styles.badge, { backgroundColor: colors.accentPrimary }]}>
              <Text style={styles.badgeText}>
                {convo.unread_count! > 99 ? "99+" : convo.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const { isAuthenticated, isLoading: authLoading, user, isGuest } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && width >= 768;

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const searchRef = useRef<TextInput>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => fetchConversations(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`messages-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => qc.invalidateQueries({ queryKey: ["conversations", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  if (authLoading) return null;
  if (isGuest) {
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
  }
  if (!isAuthenticated) return <Redirect href="/login" />;

  const list = conversations as Conversation[];
  const totalUnread = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  const tabFiltered = list.filter((c) => {
    if (filterTab === "unread") return (c.unread_count ?? 0) > 0;
    if (filterTab === "groups") return c.type === "group";
    return true;
  });

  const filtered = search.trim()
    ? tabFiltered.filter((c) => {
        const term = search.toLowerCase();
        const displayName = (c.other_user?.display_name ?? c.name ?? "").toLowerCase();
        const username = (c.other_user?.username ?? "").toLowerCase();
        return displayName.includes(term) || username.includes(term);
      })
    : tabFiltered;

  const topPad = isWeb ? 14 : insets.top + 8;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgCanvas }]}>
      <GlassSurface
        style={[
          styles.headerWrap,
          { paddingTop: topPad, borderBottomColor: colors.separator },
        ]}
      >
        <View style={[styles.columnWrap, { maxWidth: isDesktopWeb ? 680 : undefined }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                Messages
              </Text>
              <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                {totalUnread > 0
                  ? `${totalUnread} unread`
                  : `${list.length} conversation${list.length !== 1 ? "s" : ""}`}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push("/create-group" as any);
                }}
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    backgroundColor: colors.bgElevated,
                    borderColor: colors.separator,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create group conversation"
              >
                <Feather name="users" size={18} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push("/new-message" as any);
                }}
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    backgroundColor: colors.accentPrimary,
                    borderColor: colors.accentPrimary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="New message"
              >
                <Feather name="edit-2" size={17} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          {/* Search bar */}
          <Pressable
            onPress={() => searchRef.current?.focus()}
            style={[
              styles.searchBar,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            <Feather name="search" size={16} color={colors.textTertiary} />
            <TextInput
              ref={searchRef}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search conversations…"
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              accessibilityLabel="Search conversations"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch("")}
                hitSlop={10}
                style={[styles.clearBtn, { backgroundColor: colors.muted }]}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Feather name="x" size={13} color={colors.textPrimary} />
              </Pressable>
            )}
          </Pressable>

          {/* Segmented inbox filter */}
          <View
            style={[
              styles.segmentBar,
              { backgroundColor: colors.bgElevated, borderColor: colors.separator },
            ]}
          >
            {(
              [
                { key: "all", label: "All" },
                { key: "unread", label: "Unread" },
                { key: "groups", label: "Groups" },
              ] as { key: FilterTab; label: string }[]
            ).map((t) => {
              const active = filterTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    haptics.selection();
                    setFilterTab(t.key);
                  }}
                  style={[
                    styles.segmentBtn,
                    active && {
                      backgroundColor: colors.bgCanvas,
                      borderColor: colors.separator,
                    },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.label}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color: active ? colors.textPrimary : colors.textSecondary,
                        fontWeight: active ? "600" : "500",
                      },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </GlassSurface>

      {/* Content */}
      <View style={[styles.bodyWrap, { maxWidth: isDesktopWeb ? 680 : undefined }]}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accentPrimary} size="large" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading conversations…
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <View
              style={[styles.emptyIconWrap, { backgroundColor: colors.accentTint }]}
            >
              <Feather
                name="message-square"
                size={34}
                color={colors.accentPrimary}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {search
                ? "No matches"
                : filterTab === "unread"
                ? "All caught up"
                : filterTab === "groups"
                ? "No group chats yet"
                : "No conversations yet"}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              {search
                ? `No conversations matching "${search}".`
                : filterTab === "unread"
                ? "You have read every message in your inbox."
                : "Find friends or create a group to start messaging."}
            </Text>
            {!search && filterTab === "all" && (
              <Pressable
                onPress={() => {
                  haptics.light();
                  router.push("/new-message" as any);
                }}
                style={({ pressed }) => [
                  styles.emptyBtn,
                  {
                    backgroundColor: colors.accentPrimary,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Find friends"
              >
                <Feather name="user-plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyBtnText}>Start a Chat</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 96, paddingTop: 4 }}
            ItemSeparatorComponent={() => (
              <View
                style={[styles.separator, { backgroundColor: colors.separator }]}
              />
            )}
            renderItem={({ item: convo }) => (
              <ConversationRow
                convo={convo}
                onPress={() => {
                  const targetPath =
                    convo.type === "group"
                      ? `/group/${convo.id}`
                      : `/chat/${convo.id}`;
                  router.push({
                    pathname: targetPath,
                    params: {
                      peerName:
                        convo.type === "group"
                          ? convo.name ?? "Group"
                          : convo.other_user?.display_name?.trim() ||
                            convo.other_user?.username ||
                            "User",
                      peerAvatar: convo.other_user?.avatar_url ?? "",
                      peerId: convo.other_user?.id ?? "",
                    },
                  } as any);
                }}
              />
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
  },
  columnWrap: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  bodyWrap: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  headerSub: {
    fontSize: 12.5,
    marginTop: 2,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBar: {
    flexDirection: "row",
    borderRadius: RADIUS.sm + 2,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  segmentText: {
    fontSize: 13.5,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 74,
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
    fontSize: 15.5,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  rowNameBold: {
    fontWeight: "700",
  },
  rowTime: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowPreview: {
    fontSize: 13.5,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  groupBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 79,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 10,
  },
  emptyIconWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 12,
    borderRadius: RADIUS.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    height: 46,
  },
  emptyBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
});