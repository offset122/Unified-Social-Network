import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { RADIUS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import {
  blockUser,
  fetchBlockedUsers,
  searchUsers,
  unblockUser,
  type Profile,
} from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { GlassSurface } from "@/components/GlassSurface";
import { ActionSheet } from "@/components/ActionSheet";
import { useToast } from "@/components/Toast";

function BlockSearchResults({
  query,
  viewerId,
  blockedIds,
  onBlock,
}: {
  query: string;
  viewerId?: string;
  blockedIds: Set<string>;
  onBlock: (profile: Profile) => void;
}) {
  const colors = useColors();
  const trimmed = query.trim();

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["block-search", trimmed, viewerId],
    queryFn: () => searchUsers(trimmed, viewerId),
    enabled: trimmed.length >= 2,
  });

  const filtered = useMemo(
    () =>
      (results as Profile[]).filter(
        (u) => u.id !== viewerId && !blockedIds.has(u.id),
      ),
    [results, viewerId, blockedIds],
  );

  if (trimmed.length < 2) {
    return (
      <View style={styles.emptySearch}>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
          Type at least 2 characters to search people
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.emptySearch}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <View style={styles.emptySearch}>
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}>
            No users found matching &quot;{trimmed}&quot;
          </Text>
        </View>
      }
      renderItem={({ item: u }) => (
        <View
          style={[
            styles.searchRow,
            { borderBottomColor: colors.separator },
          ]}
        >
          <Avatar
            name={u.display_name}
            avatarUrl={u.avatar_url}
            size={42}
            canvasColor={colors.bgCanvas}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.searchName, { color: colors.textPrimary }]}>
              {u.display_name}
            </Text>
            <Text style={[styles.searchHandle, { color: colors.textSecondary }]}>
              @{u.username}
            </Text>
          </View>
          <Pressable
            onPress={() => onBlock(u)}
            style={({ pressed }) => [
              styles.blockBtn,
              {
                backgroundColor: colors.semanticDanger,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Block @${u.username}`}
          >
            <Text style={styles.blockBtnText}>Block</Text>
          </Pressable>
        </View>
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
  const { showToast } = useToast();

  const { data: blocked = [], isLoading } = useQuery({
    queryKey: ["blocked-users", user?.id],
    queryFn: () => fetchBlockedUsers(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const blockedList = blocked as Profile[];
  const blockedIds = useMemo(
    () => new Set(blockedList.map((b) => b.id)),
    [blockedList],
  );

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockQuery, setBlockQuery] = useState("");
  const [unblockTarget, setUnblockTarget] = useState<Profile | null>(null);

  const confirmUnblock = async (profile: Profile) => {
    if (!user?.id) return;
    try {
      await unblockUser(user.id, profile.id);
      await qc.invalidateQueries({ queryKey: ["blocked-users"] });
      showToast(`Unblocked @${profile.username}`, "success");
    } catch (e: any) {
      showToast(e?.message ?? "Could not unblock user", "error");
    }
  };

  const handleBlockUser = async (profile: Profile) => {
    if (!user?.id) return;
    try {
      await blockUser(user.id, profile.id);
      await qc.invalidateQueries({ queryKey: ["blocked-users"] });
      setBlockModalOpen(false);
      setBlockQuery("");
      showToast(`Blocked @${profile.username}`, "info");
    } catch (e: any) {
      showToast(e?.message ?? "Could not block user", "error");
    }
  };

  const topPadding = Platform.OS === "web" ? 14 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCanvas }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <GlassSurface
        style={[
          styles.header,
          { paddingTop: topPadding, borderBottomColor: colors.separator },
        ]}
      >
        <View style={styles.headerInner}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Blocked Users
          </Text>
          <Pressable
            onPress={() => setBlockModalOpen(true)}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Block a user"
          >
            <Feather name="user-x" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </GlassSurface>

      <View style={styles.bodyCol}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accentPrimary} size="large" />
          </View>
        ) : blockedList.length === 0 ? (
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIconWrap,
                { backgroundColor: colors.accentTint },
              ]}
            >
              <Feather name="user-x" size={32} color={colors.accentPrimary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No blocked users
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              People you block cannot view your profile, reply to your posts, or
              message you.
            </Text>
            <Pressable
              onPress={() => setBlockModalOpen(true)}
              style={({ pressed }) => [
                styles.emptyCta,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Block someone"
            >
              <Feather name="plus" size={16} color={colors.textPrimary} />
              <Text style={[styles.emptyCtaText, { color: colors.textPrimary }]}>
                Block Someone
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={blockedList}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 24,
              paddingTop: 8,
            }}
            renderItem={({ item: p }) => (
              <View
                style={[styles.row, { borderBottomColor: colors.separator }]}
              >
                <Avatar
                  name={p.display_name}
                  avatarUrl={p.avatar_url}
                  size={46}
                  canvasColor={colors.bgCanvas}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>
                    {p.display_name}
                  </Text>
                  <Text style={[styles.handle, { color: colors.textSecondary }]}>
                    @{p.username}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setUnblockTarget(p)}
                  style={({ pressed }) => [
                    styles.unblockBtn,
                    {
                      borderColor: colors.accentPrimary,
                      backgroundColor: pressed
                        ? colors.accentTint
                        : "transparent",
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock @${p.username}`}
                >
                  <Text
                    style={[styles.unblockText, { color: colors.accentPrimary }]}
                  >
                    Unblock
                  </Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>

      <Modal
        visible={blockModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setBlockModalOpen(false)}
      >
        <View style={[styles.modalRoot, { backgroundColor: colors.bgCanvas }]}>
          <GlassSurface
            style={[
              styles.modalHeader,
              {
                paddingTop: Platform.OS === "web" ? 16 : insets.top + 12,
                borderBottomColor: colors.separator,
              },
            ]}
          >
            <View style={styles.modalHeaderInner}>
              <Pressable
                onPress={() => setBlockModalOpen(false)}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Close search"
              >
                <Feather name="x" size={20} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Block Someone
              </Text>
              <View style={{ width: 44 }} />
            </View>
          </GlassSurface>
          <View style={styles.modalBody}>
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.separator,
                },
              ]}
            >
              <Feather name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search by name or username..."
                placeholderTextColor={colors.textTertiary}
                value={blockQuery}
                onChangeText={setBlockQuery}
                autoFocus
                accessibilityLabel="Search people to block"
              />
              {blockQuery.length > 0 && (
                <Pressable
                  onPress={() => setBlockQuery("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Feather name="x-circle" size={16} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
            <BlockSearchResults
              query={blockQuery}
              viewerId={user?.id}
              blockedIds={blockedIds}
              onBlock={handleBlockUser}
            />
          </View>
        </View>
      </Modal>

      <ActionSheet
        visible={!!unblockTarget}
        title={unblockTarget ? `Unblock @${unblockTarget.username}?` : undefined}
        message="They will be able to view your profile, posts, and send you messages again."
        onClose={() => setUnblockTarget(null)}
        items={
          unblockTarget
            ? [
                {
                  id: "unblock",
                  label: `Unblock @${unblockTarget.username}`,
                  icon: "user-check",
                  destructive: true,
                  onPress: () => confirmUnblock(unblockTarget),
                },
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  headerInner: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  bodyCol: {
    flex: 1,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 36,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -0.2 },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  emptyCta: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyCtaText: { fontSize: 14, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: "600" },
  handle: { fontSize: 13, marginTop: 1 },
  unblockBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
  },
  unblockText: { fontSize: 13.5, fontWeight: "600" },
  modalRoot: { flex: 1 },
  modalHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  modalHeaderInner: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
  },
  modalBody: {
    flex: 1,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    padding: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    minHeight: 46,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  emptySearch: {
    paddingVertical: 40,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchName: { fontSize: 15, fontWeight: "600" },
  searchHandle: { fontSize: 13, marginTop: 1 },
  blockBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  blockBtnText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
});
