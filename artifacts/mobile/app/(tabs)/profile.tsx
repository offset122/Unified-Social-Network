import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Platform, Alert, Image, Modal, ScrollView, StatusBar, Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import GuestScreen from "@/components/GuestScreen";
import { useColors } from "@/hooks/useColors";
import { useColorScheme } from "react-native";
import {
  fetchProfile, fetchUserPosts, fetchSavedPosts, resolveMediaUrl,
  formatCount, timeAgo, deletePost, generateProfileInsights,
  type Post, type Profile,
} from "@/lib/db";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_SIZE = (SCREEN_WIDTH - 4) / 3;

function Avatar({ name, size, avatarUrl }: { name: string; size: number; avatarUrl?: string | null }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (avatarUrl && !err) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: "#fff", overflow: "hidden", elevation: 6 }}>
        <Image source={{ uri: resolveMediaUrl(avatarUrl) }} style={{ width: "100%", height: "100%" }} onError={() => setErr(true)} resizeMode="cover" />
      </View>
    );
  }
  return (
    <LinearGradient colors={["#7c3aed", "#4f46e5"]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff", elevation: 6 }}>
      <Text style={{ color: "#fff", fontSize: size * 0.35, fontWeight: "800", letterSpacing: 1 }}>{initials}</Text>
    </LinearGradient>
  );
}

function StatBlock({ value, label, onPress, colors }: { value: number; label: string; onPress?: () => void; colors: any }) {
  const display = value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return (
    <Pressable style={styles.statBlock} onPress={onPress}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{display}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

type ViewMode = "grid" | "list";
type PostTab = "posts" | "reels" | "saved";

function PostGrid({ posts, colors, viewMode, onDelete, isOwn }: { posts: Post[]; colors: any; viewMode: ViewMode; onDelete?: (id: string) => void; isOwn: boolean }) {
  const router = useRouter();
  if (viewMode === "grid") {
    return (
      <View style={styles.gridWrap}>
        {posts.map(p => {
          const media = p.media_urls?.[0] ? resolveMediaUrl(p.media_urls[0]) : null;
          const isVideo = p.media_type === "video";
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/post/${p.id}` as any)}
              onLongPress={() => {
                if (isOwn && onDelete) {
                  Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => onDelete(p.id) },
                  ]);
                }
              }}
              style={({ pressed }) => [styles.gridItem, { opacity: pressed ? 0.85 : 1 }]}
            >
              {media ? (
                <Image source={{ uri: media }} style={styles.gridImg} resizeMode="cover" />
              ) : (
                <View style={[styles.gridImg, { backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }]}>
                  <Feather name="file-text" size={22} color={colors.mutedForeground} />
                </View>
              )}
              {isVideo && (
                <View style={styles.gridVideoIcon}>
                  <Feather name="play" size={10} color="#fff" />
                </View>
              )}
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={styles.gridOverlay}>
                <View style={styles.gridStats}>
                  <Feather name="heart" size={10} color="#fff" />
                  <Text style={styles.gridStatText}>{formatCount(p.likes_count)}</Text>
                  {p.views_count > 0 && (
                    <>
                      <Feather name="eye" size={10} color="#fff" style={{ marginLeft: 6 }} />
                      <Text style={styles.gridStatText}>{formatCount(p.views_count)}</Text>
                    </>
                  )}
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      {posts.map(p => {
        const media = p.media_urls?.[0] ? resolveMediaUrl(p.media_urls[0]) : null;
        const aspectRatio = p.media_width && p.media_height ? p.media_width / p.media_height : null;
        return (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/post/${p.id}` as any)}
            onLongPress={() => {
              if (isOwn && onDelete) {
                Alert.alert("Delete Post", "Are you sure?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => onDelete(p.id) },
                ]);
              }
            }}
            style={[styles.listCard, { borderBottomColor: colors.border }]}
          >
            {media && aspectRatio && (
              <Image source={{ uri: media }}
                style={[styles.listCardImg, { aspectRatio: Math.min(Math.max(aspectRatio, 0.4), 2.5) }]}
                resizeMode="contain" />
            )}
            {media && !aspectRatio && <Image source={{ uri: media }} style={[styles.listCardImg, { aspectRatio: 1 }]} resizeMode="cover" />}
            {!!p.content && <Text style={[styles.listCardContent, { color: colors.foreground }]} numberOfLines={4}>{p.content}</Text>}
            <View style={styles.listCardMeta}>
              <Text style={[styles.listCardTime, { color: colors.mutedForeground }]}>{timeAgo(p.created_at)}</Text>
              <View style={styles.listCardStats}>
                <View style={styles.listStat}><Feather name="heart" size={12} color={colors.mutedForeground} /><Text style={[styles.listStatText, { color: colors.mutedForeground }]}>{formatCount(p.likes_count)}</Text></View>
                <View style={styles.listStat}><Feather name="message-circle" size={12} color={colors.mutedForeground} /><Text style={[styles.listStatText, { color: colors.mutedForeground }]}>{formatCount(p.comments_count)}</Text></View>
                <View style={styles.listStat}><Feather name="eye" size={12} color={colors.mutedForeground} /><Text style={[styles.listStatText, { color: colors.mutedForeground }]}>{formatCount(p.views_count)}</Text></View>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingsSheet({ visible, onClose, onLogout, onNavigateTab, colors, colorScheme }: {
  visible: boolean; onClose: () => void; onLogout: () => void;
  onNavigateTab: (tab: "posts" | "reels" | "saved") => void;
  colors: any; colorScheme: string | null | undefined;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const sections = [
    { title: "Account", items: [
      { icon: "user" as const, label: "Edit Profile", onPress: () => { onClose(); router.push("/edit-profile" as any); } },
      { icon: "lock" as const, label: "Change Password", onPress: () => { onClose(); router.push("/change-password" as any); } },
    ]},
    { title: "Privacy & Safety", items: [
      { icon: "eye-off" as const, label: "Blocked Users", onPress: () => { onClose(); router.push("/blocked-users" as any); } },
      { icon: "bell" as const, label: "Notifications", onPress: () => { onClose(); router.push("/notifications" as any); } },
    ]},
    { title: "Content", items: [
      { icon: "film" as const, label: "Your Reels", onPress: () => { onClose(); onNavigateTab("reels"); } },
      { icon: "bookmark" as const, label: "Saved Posts", onPress: () => { onClose(); onNavigateTab("saved"); } },
    ]},
    { title: "Support", items: [
      { icon: "help-circle" as const, label: "Help & FAQ", onPress: () => {} },
      { icon: "info" as const, label: "About", onPress: () => {}, detail: "v2.0.0" },
    ]},
  ];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.sheetHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={colors.foreground} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {sections.map(section => (
            <View key={section.title} style={styles.settingsSection}>
              <Text style={[styles.settingsSectionTitle, { color: colors.mutedForeground }]}>{section.title}</Text>
              <View style={[styles.settingsGroup, { backgroundColor: isDark ? "#1a1a2e" : "#f9f8ff", borderColor: colors.border }]}>
                {section.items.map((item, i) => (
                  <Pressable key={item.label} onPress={item.onPress}
                    style={({ pressed }) => [styles.settingsRow, i < section.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}>
                    <View style={styles.settingsIconWrap}><Feather name={item.icon} size={15} color="#7c3aed" /></View>
                    <Text style={[styles.settingsLabel, { color: colors.foreground }]}>{item.label}</Text>
                    {"detail" in item && item.detail ? <Text style={{ color: colors.mutedForeground, fontSize: 13, marginRight: 4 }}>{(item as any).detail}</Text> : null}
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <Pressable onPress={() => { onClose(); onLogout(); }}
            style={({ pressed }) => [styles.sheetLogout, { opacity: pressed ? 0.7 : 1 }]}>
            <Feather name="log-out" size={17} color="#ef4444" />
            <Text style={styles.sheetLogoutText}>Log Out</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ProfileScreen() {
  const { isAuthenticated, isLoading: authLoading, user, logout, isGuest } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isWeb = Platform.OS === "web";
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const qc = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [postTab, setPostTab] = useState<PostTab>("posts");
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["my-posts", user?.id, postTab],
    queryFn: () => {
      if (postTab === "saved") return fetchSavedPosts(user?.id ?? "");
      return fetchUserPosts(user?.id ?? "", postTab === "reels");
    },
    enabled: !!user?.id,
  });

  const handleDelete = async (postId: string) => {
    if (!user?.id) return;
    try {
      await deletePost(postId, user.id);
      qc.invalidateQueries({ queryKey: ["my-posts"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch { Alert.alert("Error", "Could not delete post"); }
  };

  const handleAIInsight = async () => {
    if (loadingInsight) return;
    if (aiInsight) { setAiInsight(null); return; }
    setLoadingInsight(true);
    try {
      const allPosts = (posts as Post[]);
      const insight = await generateProfileInsights({
        totalPosts: profile?.posts_count ?? 0,
        totalLikes: allPosts.reduce((s, p) => s + p.likes_count, 0),
        totalViews: allPosts.reduce((s, p) => s + p.views_count, 0),
        imagePosts: allPosts.filter(p => p.media_type === "image").length,
        videoPosts: allPosts.filter(p => p.media_type === "video").length,
        textPosts: allPosts.filter(p => !p.media_type).length,
      });
      setAiInsight(insight);
    } finally {
      setLoadingInsight(false);
    }
  };

  if (authLoading) return null;
  if (isGuest) return <GuestScreen icon="user" title="Your Profile" subtitle="Create an account to build your profile, share posts, and connect with others." perks={["Post photos, videos & reels", "Build your following", "Save posts you love", "See your view counts"]} />;
  if (!isAuthenticated) return <Redirect href="/login" />;
  if (profileLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color="#7c3aed" size="large" /></View>;

  const displayName = profile?.display_name ?? [user?.firstName, user?.lastName].filter(Boolean).join(" ") ?? "User";
  const avatarUrl = profile?.avatar_url ?? user?.profileImageUrl ?? null;

  const handleLogout = () => Alert.alert("Log Out", "Are you sure?", [
    { text: "Cancel", style: "cancel" },
    { text: "Log Out", style: "destructive", onPress: logout },
  ]);

  const tabs: { key: PostTab; icon: any; label: string }[] = [
    { key: "posts", icon: "grid", label: "Posts" },
    { key: "reels", icon: "film", label: "Reels" },
    { key: "saved", icon: "bookmark", label: "Saved" },
  ];

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} onNavigateTab={(tab) => setPostTab(tab)} colors={colors} colorScheme={colorScheme} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {/* Cover */}
        <View style={[styles.coverWrap, { paddingTop: isWeb ? 67 : insets.top }]}>
          <LinearGradient colors={isDark ? ["#1e1b4b", "#2d1b69", "#1e1b4b"] : ["#ede9fe", "#ddd6fe", "#c4b5fd"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {profile?.cover_url && <Image source={{ uri: resolveMediaUrl(profile.cover_url) }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
          <Pressable onPress={() => setSettingsOpen(true)} style={[styles.settingsBtn, { backgroundColor: isDark ? "#ffffff18" : "#00000012" }]} hitSlop={8}>
            <Feather name="settings" size={18} color={isDark ? "#e2d9f3" : "#4c1d95"} />
          </Pressable>
          <View style={styles.avatarRow}><Avatar name={displayName} size={92} avatarUrl={avatarUrl} /></View>
        </View>

        {/* Profile info */}
        <View style={[styles.profileInfo, { borderBottomColor: colors.border }]}>
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.displayName, { color: colors.foreground }]}>{displayName}</Text>
                {profile?.is_admin && <Feather name="shield" size={16} color="#7c3aed" />}
              </View>
              {profile?.username ? <Text style={[styles.username, { color: colors.mutedForeground }]}>@{profile.username}</Text> : null}
            </View>
            <Link href="/edit-profile" asChild>
              <Pressable style={({ pressed }) => [styles.editBtn, { borderColor: "#7c3aed", backgroundColor: pressed ? "#7c3aed18" : "transparent" }]}>
                <Feather name="edit-2" size={13} color="#7c3aed" />
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </Link>
          </View>
          {profile?.bio ? <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text> : null}

          {/* Stats */}
          <View style={[styles.statsRow, { backgroundColor: isDark ? "#ffffff08" : "#7c3aed08", borderColor: isDark ? "#ffffff12" : "#7c3aed18" }]}>
            <StatBlock value={profile?.posts_count ?? 0} label="Posts" colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatBlock value={profile?.followers_count ?? 0} label="Followers" colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatBlock value={profile?.following_count ?? 0} label="Following" colors={colors} />
          </View>

          {/* Quick actions */}
          <View style={styles.quickActions}>
            <Pressable onPress={() => router.push("/(tabs)/messages" as any)} style={[styles.quickBtn, { backgroundColor: colors.primary }]}>
              <Feather name="message-circle" size={15} color="#fff" />
              <Text style={styles.quickBtnText}>Message</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/live-sessions" as any)} style={[styles.quickBtn, { backgroundColor: "#ef4444" }]}>
              <Feather name="radio" size={15} color="#fff" />
              <Text style={styles.quickBtnText}>Go Live</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/ai-chat" as any)} style={[styles.quickBtn, { backgroundColor: "#7c3aed" }]}>
              <Feather name="zap" size={15} color="#fff" />
              <Text style={styles.quickBtnText}>AI</Text>
            </Pressable>
          </View>

          {/* AI Insights */}
          <Pressable
            onPress={handleAIInsight}
            style={[styles.insightBtn, { backgroundColor: isDark ? "#7c3aed18" : "#ede9fe", borderColor: "#7c3aed44" }]}
          >
            {loadingInsight
              ? <ActivityIndicator size="small" color="#7c3aed" />
              : <Feather name="zap" size={14} color="#7c3aed" />}
            <Text style={[styles.insightBtnText, { color: "#7c3aed" }]}>
              {loadingInsight ? "Analyzing your profile…" : aiInsight ? "Hide AI insights" : "Get AI growth insights ✨"}
            </Text>
          </Pressable>

          {aiInsight && (
            <View style={[styles.insightCard, { backgroundColor: isDark ? "#1a0533" : "#f5f3ff", borderColor: "#7c3aed33" }]}>
              <View style={styles.insightHeader}>
                <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.insightDot}>
                  <Feather name="zap" size={12} color="#fff" />
                </LinearGradient>
                <Text style={[styles.insightTitle, { color: "#7c3aed" }]}>AI Insights</Text>
              </View>
              <Text style={[styles.insightText, { color: colors.foreground }]}>{aiInsight}</Text>
            </View>
          )}
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {tabs.map(tab => (
            <Pressable key={tab.key} onPress={() => setPostTab(tab.key)} style={styles.tabBtn}>
              <Feather name={tab.icon} size={16} color={postTab === tab.key ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabLabel, { color: postTab === tab.key ? colors.primary : colors.mutedForeground }, postTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
              {postTab === tab.key && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <View style={styles.viewToggle}>
            <Pressable onPress={() => setViewMode("grid")} hitSlop={8} style={[styles.viewBtn, viewMode === "grid" && { backgroundColor: colors.primary + "22" }]}>
              <Feather name="grid" size={16} color={viewMode === "grid" ? colors.primary : colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={() => setViewMode("list")} hitSlop={8} style={[styles.viewBtn, viewMode === "list" && { backgroundColor: colors.primary + "22" }]}>
              <Feather name="list" size={16} color={viewMode === "list" ? colors.primary : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {postsLoading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color="#7c3aed" /></View>
        ) : posts.length === 0 ? (
          <View style={styles.emptyPosts}>
            <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? "#ffffff0a" : "#7c3aed0a" }]}>
              <Feather name={postTab === "saved" ? "bookmark" : postTab === "posts" ? "grid" : "film"} size={32} color="#7c3aed" />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {postTab === "saved" ? "No saved posts" : `No ${postTab} yet`}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              {postTab === "saved" ? "Posts you save will appear here" : `Share your first ${postTab === "posts" ? "post" : "reel"} to get started`}
            </Text>
            {postTab !== "saved" && (
              <Link href="/create" asChild>
                <Pressable style={styles.emptyAction}><Text style={styles.emptyActionText}>Create {postTab === "posts" ? "Post" : "Reel"}</Text></Pressable>
              </Link>
            )}
          </View>
        ) : (
          <PostGrid posts={posts as Post[]} colors={colors} viewMode={viewMode} onDelete={handleDelete} isOwn={true} />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  coverWrap: { height: 200, position: "relative" },
  settingsBtn: { position: "absolute", top: 16, right: 16, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarRow: { position: "absolute", bottom: -46, left: 18 },
  profileInfo: { paddingHorizontal: 18, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 6 },
  displayName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  username: { fontSize: 14, marginTop: 2 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  editBtnText: { fontSize: 13, fontWeight: "600", color: "#7c3aed" },
  bio: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  statsRow: { flexDirection: "row", alignItems: "center", marginVertical: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  statBlock: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.3 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  quickActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  quickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 12 },
  quickBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  insightBtn: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  insightBtnText: { fontSize: 14, fontWeight: "600", flex: 1 },
  insightCard: { marginTop: 10, borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  insightHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  insightDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  insightTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  insightText: { fontSize: 14, lineHeight: 21 },
  tabBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 12, paddingRight: 16, position: "relative" },
  tabLabel: { fontSize: 13, fontWeight: "500" },
  tabLabelActive: { fontWeight: "700" },
  tabIndicator: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 2 },
  viewToggle: { flexDirection: "row", gap: 4 },
  viewBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 2, padding: 2 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, position: "relative", overflow: "hidden" },
  gridImg: { width: "100%", height: "100%" },
  gridVideoIcon: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, padding: 3 },
  gridOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: 44, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 5, paddingBottom: 5 },
  gridStats: { flexDirection: "row", alignItems: "center", gap: 3 },
  gridStatText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  listCard: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  listCardImg: { width: "100%", borderRadius: 12, marginBottom: 10, backgroundColor: "#000" },
  listCardContent: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  listCardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listCardTime: { fontSize: 12 },
  listCardStats: { flexDirection: "row", gap: 12 },
  listStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  listStatText: { fontSize: 12 },
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
