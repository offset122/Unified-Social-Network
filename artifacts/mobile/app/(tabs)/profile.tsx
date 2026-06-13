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
  Image,
  Modal,
  Switch,
  ScrollView,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import {
  useGetMyProfile,
  useGetUserPosts,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { useColorScheme } from "react-native";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Post = {
  id: string;
  content: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  mediaUrls: string[];   // ← server returns mediaUrls: string[]
  mediaType?: string | null;
  author: {
    avatarUrl: string | null;
    };
};

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size, avatarUrl }: { name: string; size: number; avatarUrl?: string | null }) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (avatarUrl && !imgError) {
    return (
      <View
        style={{
          width: size, height: size, borderRadius: size / 2,
          borderWidth: 3, borderColor: "#fff", overflow: "hidden",
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
        }}
      >
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: "100%", height: "100%" }}
          onError={() => setImgError(true)}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#7c3aed", "#4f46e5"]}
      style={{
        width: size, height: size, borderRadius: size / 2,
        alignItems: "center", justifyContent: "center",
        borderWidth: 3, borderColor: "#fff",
        shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.35, fontWeight: "800", letterSpacing: 1 }}>
        {initials}
      </Text>
    </LinearGradient>
  );
}

// ─── Stat Block ────────────────────────────────────────────────────────────────

function StatBlock({ value, label, colors }: {
  value: number;
  label: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const display = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{display}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PostCard({ item, colors }: { item: Post; colors: any }) {
  const [imgError, setImgError] = useState(false);
  // mediaUrls is an array — use the first entry as the preview image
  const previewImage = item.mediaUrls?.[0] ?? null;

  return (
    <Link href={`/post/${item.id}`} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.postCard,
          { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        {previewImage && !imgError && (
          <Image
            source={{ uri: previewImage }}
            style={styles.postImage}
            onError={() => setImgError(true)}
            resizeMode="cover"
          />
        )}
        {item.content ? (
          <Text style={[styles.postContent, { color: colors.foreground }]} numberOfLines={4}>
            {item.content}
          </Text>
        ) : null}
        <View style={styles.postMeta}>
          <Text style={[styles.postTime, { color: colors.mutedForeground }]}>
            {formatTimeAgo(new Date(item.createdAt))}
          </Text>
          <View style={styles.postStatsRow}>
            <View style={styles.postStatItem}>
              <Feather name="heart" size={13} color={colors.mutedForeground} />
              <Text style={[styles.postStatText, { color: colors.mutedForeground }]}>
                {item.likesCount}
              </Text>
            </View>
            <View style={styles.postStatItem}>
              <Feather name="message-circle" size={13} color={colors.mutedForeground} />
              <Text style={[styles.postStatText, { color: colors.mutedForeground }]}>
                {item.commentsCount}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

// ─── Settings Sheet ────────────────────────────────────────────────────────────

function SettingsSheet({
  visible, onClose, onLogout, colors, colorScheme,
}: {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  colors: any;
  colorScheme: string | null | undefined;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(true);
  const [privateAccount, setPrivateAccount] = useState(false);
  const isDark = colorScheme === "dark";

  const sections = [
    {
      title: "Account",
      items: [
        {
          icon: "user" as const,
          label: "Edit Profile",
          onPress: () => { onClose(); router.push("/edit-profile"); },
          chevron: true,
        },
        {
          icon: "lock" as const,
          label: "Change Password",
          onPress: () => { onClose(); router.push("/change-password"); },
          chevron: true,
        },
      ],
    },
    {
      title: "Privacy",
      items: [
        {
          icon: "eye-off" as const,
          label: "Private Account",
          toggle: true,
          value: privateAccount,
          onToggle: setPrivateAccount,
        },
        {
          icon: "bell" as const,
          label: "Push Notifications",
          toggle: true,
          value: notifications,
          onToggle: setNotifications,
        },
      ],
    },
    {
      title: "Support",
      items: [
        { icon: "help-circle" as const, label: "Help & FAQ", onPress: () => {}, chevron: true },
        { icon: "file-text" as const, label: "Privacy Policy", onPress: () => {}, chevron: true },
        { icon: "info" as const, label: "About", onPress: () => {}, chevron: true, detail: "v1.0.0" },
      ],
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.sheetHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {sections.map((section) => (
            <View key={section.title} style={styles.settingsSection}>
              <Text style={[styles.settingsSectionTitle, { color: colors.mutedForeground }]}>
                {section.title}
              </Text>
              <View style={[styles.settingsGroup, { backgroundColor: isDark ? "#1a1a2e" : "#f9f8ff", borderColor: colors.border }]}>
                {section.items.map((item, i) => (
                  <Pressable
                    key={item.label}
                    onPress={"onPress" in item ? item.onPress : undefined}
                    style={({ pressed }) => [
                      styles.settingsRow,
                      i < section.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      pressed && "onPress" in item && { opacity: 0.6 },
                    ]}
                  >
                    <View style={styles.settingsIconWrap}>
                      <Feather name={item.icon} size={15} color="#7c3aed" />
                    </View>
                    <Text style={[styles.settingsLabel, { color: colors.foreground }]}>{item.label}</Text>
                    {"detail" in item && item.detail
                      ? <Text style={[{ color: colors.mutedForeground, fontSize: 13, marginRight: 4 }]}>{item.detail}</Text>
                      : null}
                    {"toggle" in item && item.toggle
                      ? <Switch value={item.value} onValueChange={item.onToggle} trackColor={{ true: "#7c3aed", false: colors.border }} thumbColor="#fff" />
                      : "chevron" in item && item.chevron
                      ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      : null}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => { onClose(); onLogout(); }}
            style={({ pressed }) => [styles.sheetLogout, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="log-out" size={17} color="#ef4444" />
            <Text style={styles.sheetLogoutText}>Log Out</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isWeb = Platform.OS === "web";
  const isDark = colorScheme === "dark";
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  // useGetMyProfile → GET /users/me
  // Returns: { avatarUrl, displayName, username, bio, coverUrl, postsCount,
  //            followersCount, followingCount, isAdmin, ... }
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();

  // useGetUserPosts → GET /api/users/:userId/posts
  // Returns: { items: Post[], nextCursor }  where Post.mediaUrls is string[]
  const { data: postsPage, isLoading: postsLoading } = useGetUserPosts(
    user?.id ?? "",
    { limit: 20 },
    { query: { enabled: !!user?.id } },
  );

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const posts = (postsPage?.items ?? []) as Post[];

  // avatarUrl is the canonical field from buildUserProfile on the server
  const avatarUrl: string | null = profile?.avatarUrl ?? null;

  const displayName =
    profile?.displayName ??
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ??
    "User";

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout },
    ]);
  };

  if (profileLoading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.background }]}>
        <ActivityIndicator color="#7c3aed" size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={handleLogout}
        colors={colors}
        colorScheme={colorScheme}
      />

      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        data={posts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Cover gradient + settings button */}
            <LinearGradient
              colors={isDark ? ["#1e1b4b", "#2d1b69", "#1e1b4b"] : ["#ede9fe", "#ddd6fe", "#c4b5fd"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.coverGradient, { paddingTop: isWeb ? 67 : insets.top + 12 }]}
            >
              <Pressable
                onPress={() => setSettingsOpen(true)}
                style={[styles.settingsBtn, { backgroundColor: isDark ? "#ffffff18" : "#00000012" }]}
                hitSlop={8}
              >
                <Feather name="settings" size={18} color={isDark ? "#e2d9f3" : "#4c1d95"} />
              </Pressable>
              <View style={styles.avatarRow}>
                <Avatar name={displayName} size={88} avatarUrl={avatarUrl} />
              </View>
            </LinearGradient>

            {/* Profile info */}
            <View style={[styles.profileInfo, { borderBottomColor: colors.border }]}>
              <View style={styles.nameRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.displayName, { color: colors.foreground }]}>{displayName}</Text>
                  {profile?.username
                    ? <Text style={[styles.username, { color: colors.mutedForeground }]}>@{profile.username}</Text>
                    : null}
                </View>
                <Link href="/edit-profile" asChild>
                  <Pressable style={({ pressed }) => [styles.editBtn, { borderColor: "#7c3aed", backgroundColor: pressed ? "#7c3aed18" : "transparent" }]}>
                    <Feather name="edit-2" size={13} color="#7c3aed" />
                    <Text style={styles.editBtnText}>Edit</Text>
                  </Pressable>
                </Link>
              </View>

              {profile?.bio
                ? <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text>
                : null}

              {profile?.isAdmin && (
                <Link href="/admin" asChild>
                  <Pressable style={styles.adminBtn}>
                    <Feather name="shield" size={13} color="#7c3aed" />
                    <Text style={styles.adminBtnText}>Admin Dashboard</Text>
                  </Pressable>
                </Link>
              )}

              {/* Stats */}
              <View style={[styles.statsRow, { backgroundColor: isDark ? "#ffffff08" : "#7c3aed08", borderColor: isDark ? "#ffffff12" : "#7c3aed18" }]}>
                <StatBlock value={profile?.postsCount ?? 0} label="Posts" colors={colors} />
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <StatBlock value={profile?.followersCount ?? 0} label="Followers" colors={colors} />
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <StatBlock value={profile?.followingCount ?? 0} label="Following" colors={colors} />
              </View>
            </View>

            {/* Posts section header */}
            <View style={[styles.sectionHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Posts</Text>
              {postsLoading && <ActivityIndicator size="small" color="#7c3aed" />}
            </View>
          </View>
        }
        renderItem={({ item }) => <PostCard item={item as Post} colors={colors} />}
        ListEmptyComponent={
          !postsLoading ? (
            <View style={styles.emptyPosts}>
              <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? "#ffffff0a" : "#7c3aed0a" }]}>
                <Feather name="grid" size={32} color="#7c3aed" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No posts yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                Share your first post to get started
              </Text>
              <Link href="/create" asChild>
                <Pressable style={styles.emptyAction}>
                  <Text style={styles.emptyActionText}>Create Post</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <View style={[styles.center, { paddingVertical: 48 }]}>
              <ActivityIndicator color="#7c3aed" />
            </View>
          )
        }
      />
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },

  coverGradient: { paddingBottom: 0, position: "relative" },
  settingsBtn: {
    position: "absolute", top: 16, right: 16,
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
  },
  avatarRow: { paddingHorizontal: 18, paddingBottom: 0, marginBottom: -44 },

  profileInfo: { paddingHorizontal: 18, paddingTop: 54, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  displayName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  username: { fontSize: 14, marginTop: 2 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  editBtnText: { fontSize: 13, fontWeight: "600", color: "#7c3aed" },
  bio: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  adminBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: "#7c3aed", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start", marginBottom: 14 },
  adminBtnText: { fontSize: 13, fontWeight: "600", color: "#7c3aed" },

  statsRow: { flexDirection: "row", alignItems: "center", marginVertical: 14, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  statBlock: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.3 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },

  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },

  postCard: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  postImage: { width: "100%", height: 200, borderRadius: 10, marginBottom: 10 },
  postContent: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  postMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  postTime: { fontSize: 12 },
  postStatsRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  postStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatText: { fontSize: 13 },

  emptyPosts: { alignItems: "center", paddingVertical: 56, paddingHorizontal: 40, gap: 8 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 4 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyAction: { marginTop: 12, backgroundColor: "#7c3aed", paddingHorizontal: 24, paddingVertical: 11, borderRadius: 22 },
  emptyActionText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  settingsSection: { paddingHorizontal: 18, paddingTop: 24 },
  settingsSectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  settingsGroup: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  settingsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  settingsIconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#7c3aed22" },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  sheetLogout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 18, marginTop: 28, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: "#ef444444", backgroundColor: "#ef444410" },
  sheetLogoutText: { fontSize: 15, fontWeight: "700", color: "#ef4444" },
});