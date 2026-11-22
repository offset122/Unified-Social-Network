import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  fetchProfile,
  fetchReports,
  formatCount,
  resolveReport,
  timeAgo,
  type Report,
} from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { ActionSheet } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { RADIUS } from "@/constants/colors";

type AdminView = "menu" | "users" | "moderation" | "analytics";

function UserManagement() {
  const colors = useColors();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [banTarget, setBanTarget] = useState<any | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const toggleBan = async (userId: string, isBanned: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_banned: !isBanned })
      .eq("id", userId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    showToast(isBanned ? "User unbanned" : "User banned", "success");
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={users as any[]}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{
          paddingBottom: 40,
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
        renderItem={({ item: u }) => (
          <View
            style={[styles.adminRow, { borderBottomColor: colors.separator }]}
          >
            <Avatar
              name={u.display_name ?? "U"}
              avatarUrl={u.avatar_url}
              size={42}
              canvasColor={colors.bgCanvas}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={[styles.adminRowName, { color: colors.textPrimary }]}
              >
                {u.display_name}
              </Text>
              <Text
                style={[styles.adminRowSub, { color: colors.textSecondary }]}
              >
                @{u.username} · {timeAgo(u.created_at)}
                {u.is_admin ? " · Admin" : ""}
                {u.is_banned ? " · Banned" : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => setBanTarget(u)}
              style={[
                styles.adminActionBtn,
                {
                  backgroundColor: u.is_banned
                    ? "rgba(5,150,105,0.12)"
                    : "rgba(225,29,72,0.12)",
                  borderColor: u.is_banned
                    ? colors.semanticSuccess
                    : colors.semanticDanger,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={u.is_banned ? "Unban user" : "Ban user"}
            >
              <Text
                style={{
                  color: u.is_banned
                    ? colors.semanticSuccess
                    : colors.semanticDanger,
                  fontSize: 12.5,
                  fontWeight: "700",
                }}
              >
                {u.is_banned ? "Unban" : "Ban"}
              </Text>
            </Pressable>
          </View>
        )}
      />

      <ActionSheet
        visible={!!banTarget}
        title={banTarget?.is_banned ? "Unban User" : "Ban User"}
        message={
          banTarget
            ? `${banTarget.is_banned ? "Restore access for" : "Suspend"} @${banTarget.username}?`
            : undefined
        }
        onClose={() => setBanTarget(null)}
        items={
          banTarget
            ? [
                {
                  id: "toggle-ban",
                  label: banTarget.is_banned ? "Unban User" : "Ban User",
                  icon: banTarget.is_banned ? "user-check" : "slash",
                  destructive: !banTarget.is_banned,
                  onPress: () => toggleBan(banTarget.id, banTarget.is_banned),
                },
              ]
            : []
        }
      />
    </>
  );
}

function ContentModeration({ adminId }: { adminId: string }) {
  const colors = useColors();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [removeTarget, setRemoveTarget] = useState<{
    postId: string;
    reportId: string;
  } | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: fetchReports,
  });

  const removePost = async (postId: string, reportId: string) => {
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    try {
      await resolveReport(reportId, "resolved", adminId);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      showToast("Post removed & report resolved", "success");
    } catch (e: any) {
      showToast(e?.message ?? "Could not resolve report", "error");
    }
  };

  const dismissReport = async (reportId: string) => {
    try {
      await resolveReport(reportId, "dismissed", adminId);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      showToast("Report dismissed", "info");
    } catch (e: any) {
      showToast(e?.message ?? "Could not dismiss report", "error");
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }
  if ((reports as Report[]).length === 0) {
    return (
      <View style={styles.center}>
        <Feather name="check-circle" size={44} color={colors.textTertiary} />
        <Text style={{ color: colors.textSecondary, fontSize: 15.5, marginTop: 10 }}>
          No pending reports
        </Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={reports as Report[]}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingBottom: 40,
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
        renderItem={({ item: r }) => {
          const post = r.post;
          const actor = r.reporter;
          return (
            <View
              style={[
                styles.adminRow,
                {
                  borderBottomColor: colors.separator,
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 10,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar
                  name={actor?.display_name ?? "U"}
                  avatarUrl={actor?.avatar_url}
                  size={36}
                  canvasColor={colors.bgCanvas}
                />
                <View>
                  <Text
                    style={[styles.adminRowName, { color: colors.textPrimary }]}
                  >
                    Reported by @{actor?.username ?? "user"} · {r.reason}
                  </Text>
                  <Text
                    style={[styles.adminRowSub, { color: colors.textSecondary }]}
                  >
                    {timeAgo(r.created_at)}
                  </Text>
                </View>
              </View>
              {(post?.content || r.details) && (
                <View
                  style={{
                    borderRadius: RADIUS.sm,
                    padding: 12,
                    borderWidth: StyleSheet.hairlineWidth,
                    backgroundColor: colors.bgElevated,
                    borderColor: colors.separator,
                    width: "100%",
                  }}
                >
                  <Text
                    style={{ color: colors.textPrimary, fontSize: 13.5 }}
                    numberOfLines={3}
                  >
                    {post?.content ?? r.details}
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {post?.id && (
                  <Pressable
                    onPress={() =>
                      setRemoveTarget({ postId: post.id, reportId: r.id })
                    }
                    style={[
                      styles.adminActionBtn,
                      {
                        backgroundColor: "rgba(225,29,72,0.12)",
                        borderColor: colors.semanticDanger,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.semanticDanger,
                        fontSize: 12.5,
                        fontWeight: "700",
                      }}
                    >
                      Remove Post
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => dismissReport(r.id)}
                  style={[
                    styles.adminActionBtn,
                    {
                      backgroundColor: colors.bgElevated,
                      borderColor: colors.separator,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12.5,
                      fontWeight: "700",
                    }}
                  >
                    Dismiss
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <ActionSheet
        visible={!!removeTarget}
        title="Remove Reported Post"
        message="This permanently deletes the post and resolves the report."
        onClose={() => setRemoveTarget(null)}
        items={
          removeTarget
            ? [
                {
                  id: "remove-post",
                  label: "Remove Post",
                  icon: "trash-2",
                  destructive: true,
                  onPress: () =>
                    removePost(removeTarget.postId, removeTarget.reportId),
                },
              ]
            : []
        }
      />
    </>
  );
}

function Analytics() {
  const colors = useColors();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const [users, posts, stories] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("posts").select("id", { count: "exact", head: true }),
        supabase.from("stories").select("id", { count: "exact", head: true }),
      ]);
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recentUsers } = await supabase
        .from("profiles")
        .select("id")
        .gte("created_at", since);
      const { data: recentPosts } = await supabase
        .from("posts")
        .select("id")
        .gte("created_at", since);
      return {
        totalUsers: users.count ?? 0,
        totalPosts: posts.count ?? 0,
        totalStories: stories.count ?? 0,
        newUsersWeek: recentUsers?.length ?? 0,
        newPostsWeek: recentPosts?.length ?? 0,
      };
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  const cards = [
    {
      label: "Total Users",
      value: stats?.totalUsers ?? 0,
      icon: "users" as const,
      color: colors.accentPrimary,
    },
    {
      label: "Total Posts",
      value: stats?.totalPosts ?? 0,
      icon: "grid" as const,
      color: "#2563EB",
    },
    {
      label: "Total Stories",
      value: stats?.totalStories ?? 0,
      icon: "camera" as const,
      color: colors.semanticWarning,
    },
    {
      label: "New Users (7d)",
      value: stats?.newUsersWeek ?? 0,
      icon: "user-plus" as const,
      color: colors.semanticSuccess,
    },
    {
      label: "New Posts (7d)",
      value: stats?.newPostsWeek ?? 0,
      icon: "edit-3" as const,
      color: "#DB2777",
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        gap: 12,
        width: "100%",
        maxWidth: 720,
        alignSelf: "center",
      }}
    >
      {cards.map((c) => (
        <View
          key={c.label}
          style={[
            styles.analyticsCard,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
            },
          ]}
        >
          <View
            style={[styles.analyticsIcon, { backgroundColor: c.color + "18" }]}
          >
            <Feather name={c.icon} size={20} color={c.color} />
          </View>
          <View>
            <Text
              style={[styles.analyticsValue, { color: colors.textPrimary }]}
            >
              {formatCount(c.value)}
            </Text>
            <Text
              style={[styles.analyticsLabel, { color: colors.textSecondary }]}
            >
              {c.label}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export default function AdminScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [view, setView] = useState<AdminView>("menu");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(user?.id ?? ""),
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgCanvas }]}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  if (!profile?.is_admin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgCanvas }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Feather name="shield-off" size={46} color={colors.textTertiary} />
        <Text
          style={{ color: colors.textSecondary, marginTop: 12, fontSize: 16 }}
        >
          Admin access required
        </Text>
      </View>
    );
  }

  const viewTitles: Record<AdminView, string> = {
    menu: "Admin Panel",
    users: "User Management",
    moderation: "Content Moderation",
    analytics: "Analytics",
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCanvas }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassSurface
        style={[
          styles.headerWrap,
          {
            paddingTop: Platform.OS === "web" ? 12 : insets.top + 8,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={[styles.headerInner, { maxWidth: 720 }]}>
          <Pressable
            onPress={() => (view === "menu" ? router.back() : setView("menu"))}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {viewTitles[view]}
          </Text>
          <View style={styles.backBtn} />
        </View>
      </GlassSurface>

      {view === "menu" && (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 12,
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }}
        >
          {[
            {
              label: "User Management",
              icon: "users" as const,
              view: "users" as AdminView,
              desc: "Ban, unban, and review member accounts",
            },
            {
              label: "Content Moderation",
              icon: "shield" as const,
              view: "moderation" as AdminView,
              desc: "Review and resolve pending reports",
            },
            {
              label: "Analytics",
              icon: "bar-chart-2" as const,
              view: "analytics" as AdminView,
              desc: "Platform totals and 7-day activity",
            },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => setView(item.view)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.cardIcon,
                  { backgroundColor: colors.accentTint },
                ]}
              >
                <Feather
                  name={item.icon}
                  size={21}
                  color={colors.accentPrimary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>
                  {item.label}
                </Text>
                <Text
                  style={[styles.cardDesc, { color: colors.textSecondary }]}
                >
                  {item.desc}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {view === "users" && <UserManagement />}
      {view === "moderation" && (
        <ContentModeration adminId={user?.id ?? ""} />
      )}
      {view === "analytics" && <Analytics />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInner: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: { fontSize: 15.5, fontWeight: "700" },
  cardDesc: { fontSize: 12.5, marginTop: 2 },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  adminRowName: { fontSize: 14.5, fontWeight: "700" },
  adminRowSub: { fontSize: 12.5, marginTop: 2 },
  adminActionBtn: {
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  analyticsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  analyticsIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  analyticsLabel: { fontSize: 13, marginTop: 2 },
});
