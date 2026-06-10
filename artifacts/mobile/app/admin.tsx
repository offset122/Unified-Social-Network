import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
  Switch,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import {
  useGetAdminStats,
  useGetAdminUsers,
  useUpdateAdminUser,
  getGetAdminUsersQueryKey,
  getGetAdminStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMyProfile } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  postsCount: number;
  followersCount: number;
  createdAt: string;
};

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function UserRow({ user, onToggleAdmin, onToggleBan }: {
  user: AdminUser;
  onToggleAdmin: (u: AdminUser) => void;
  onToggleBan: (u: AdminUser) => void;
}) {
  const colors = useColors();
  const initials = user.displayName.slice(0, 2).toUpperCase();
  return (
    <View style={[styles.userRow, { borderBottomColor: colors.border }]}>
      <View style={styles.userAvatar}>
        <Text style={styles.userInitials}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.userNameRow}>
          <Text style={[styles.userName, { color: colors.foreground }]}>{user.displayName}</Text>
          {user.isAdmin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
          {user.isBanned && (
            <View style={styles.bannedBadge}>
              <Text style={styles.bannedBadgeText}>Banned</Text>
            </View>
          )}
        </View>
        <Text style={[styles.userUsername, { color: colors.mutedForeground }]}>
          @{user.username} · {user.postsCount} posts
        </Text>
      </View>
      <View style={styles.userActions}>
        <Pressable
          onPress={() => onToggleAdmin(user)}
          style={[styles.actionChip, { backgroundColor: user.isAdmin ? "#7c3aed20" : colors.muted }]}
        >
          <Feather name="shield" size={13} color={user.isAdmin ? "#7c3aed" : colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={() => onToggleBan(user)}
          style={[styles.actionChip, { backgroundColor: user.isBanned ? "#ef444420" : colors.muted }]}
        >
          <Feather name={user.isBanned ? "user-check" : "user-x"} size={13} color={user.isBanned ? "#ef4444" : colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const qc = useQueryClient();

  const { data: myProfile } = useGetMyProfile();
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: users, isLoading: usersLoading } = useGetAdminUsers();
  const updateUser = useUpdateAdminUser();

  if (!myProfile?.isAdmin) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Feather name="shield-off" size={48} color={colors.mutedForeground} />
        <Text style={[styles.noAccessTitle, { color: colors.foreground }]}>Admin Access Required</Text>
        <Text style={[styles.noAccessDesc, { color: colors.mutedForeground }]}>
          You don't have permission to view this page.
        </Text>
        <Pressable onPress={() => router.back()} style={[styles.backHomeBtn, { backgroundColor: colors.primary }]}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const handleToggleAdmin = (user: AdminUser) => {
    Alert.alert(
      user.isAdmin ? "Remove Admin" : "Make Admin",
      `${user.isAdmin ? "Remove admin privileges from" : "Grant admin privileges to"} @${user.username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: user.isAdmin ? "Remove" : "Grant",
          style: user.isAdmin ? "destructive" : "default",
          onPress: () => {
            updateUser.mutate(
              { userId: user.id, data: { isAdmin: !user.isAdmin } },
              { onSuccess: () => qc.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() }) },
            );
          },
        },
      ],
    );
  };

  const handleToggleBan = (user: AdminUser) => {
    Alert.alert(
      user.isBanned ? "Unban User" : "Ban User",
      `${user.isBanned ? "Unban" : "Ban"} @${user.username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: user.isBanned ? "Unban" : "Ban",
          style: user.isBanned ? "default" : "destructive",
          onPress: () => {
            updateUser.mutate(
              { userId: user.id, data: { isBanned: !user.isBanned } },
              { onSuccess: () => qc.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() }) },
            );
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: isWeb ? 16 : insets.top + 4, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Admin Dashboard</Text>
        </View>
        <View style={styles.adminBadgeHeader}>
          <Feather name="shield" size={16} color="#7c3aed" />
        </View>
      </View>

      <ScrollView>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Platform Stats</Text>
        {statsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.statsGrid}>
            <StatCard label="Users" value={stats?.usersCount ?? 0} icon="users" color="#7c3aed" />
            <StatCard label="Posts" value={stats?.postsCount ?? 0} icon="file-text" color="#0ea5e9" />
            <StatCard label="Reels" value={stats?.reelsCount ?? 0} icon="film" color="#f59e0b" />
            <StatCard label="Stories" value={stats?.storiesCount ?? 0} icon="circle" color="#10b981" />
            <StatCard label="Chats" value={stats?.chatsCount ?? 0} icon="message-square" color="#ef4444" />
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>All Users ({users?.length ?? 0})</Text>
        {usersLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <View style={[styles.userList, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {(users as AdminUser[] ?? []).map((user) => (
              <UserRow key={user.id} user={user} onToggleAdmin={handleToggleAdmin} onToggleBan={handleToggleBan} />
            ))}
            {(users?.length ?? 0) === 0 && (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No users found.</Text>
            )}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  adminBadgeHeader: { width: 32, alignItems: "flex-end" },
  noAccessTitle: { fontSize: 20, fontWeight: "700", marginTop: 12 },
  noAccessDesc: { fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
  backHomeBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  sectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8 },
  statCard: {
    flex: 1, minWidth: 100, maxWidth: 160,
    padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center", gap: 6,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16, marginTop: 20 },
  userList: { marginHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  userAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
  userInitials: { color: "#fff", fontWeight: "700", fontSize: 14 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  userName: { fontSize: 15, fontWeight: "600" },
  userUsername: { fontSize: 12, marginTop: 2 },
  adminBadge: { backgroundColor: "#7c3aed20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminBadgeText: { color: "#7c3aed", fontSize: 10, fontWeight: "700" },
  bannedBadge: { backgroundColor: "#ef444420", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bannedBadgeText: { color: "#ef4444", fontSize: 10, fontWeight: "700" },
  userActions: { flexDirection: "row", gap: 6 },
  actionChip: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyText: { textAlign: "center", padding: 20, fontSize: 14 },
});
