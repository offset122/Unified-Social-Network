import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, FlatList, Alert, Image, Modal } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fetchProfile, resolveMediaUrl, timeAgo, formatCount } from "@/lib/db";

type AdminView = "menu" | "users" | "moderation" | "analytics";

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) return <Image source={{ uri: resolveMediaUrl(avatarUrl) }} style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

function UserManagement({ colors }: { colors: any }) {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const toggleBan = async (userId: string, isBanned: boolean) => {
    await supabase.from("profiles").update({ is_banned: !isBanned }).eq("id", userId);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <FlatList
      data={users as any[]}
      keyExtractor={u => u.id}
      contentContainerStyle={{ paddingBottom: 40 }}
      renderItem={({ item: u }) => (
        <View style={[styles.adminRow, { borderBottomColor: colors.border }]}>
          <Avatar name={u.display_name ?? "U"} avatarUrl={u.avatar_url} size={40} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.adminRowName, { color: colors.foreground }]}>{u.display_name}</Text>
            <Text style={[styles.adminRowSub, { color: colors.mutedForeground }]}>@{u.username} · {timeAgo(u.created_at)}</Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
              {u.is_admin && <View style={[styles.badge, { backgroundColor: "#7c3aed22" }]}><Text style={{ color: "#7c3aed", fontSize: 10, fontWeight: "700" }}>ADMIN</Text></View>}
              {u.is_banned && <View style={[styles.badge, { backgroundColor: "#ef444422" }]}><Text style={{ color: "#ef4444", fontSize: 10, fontWeight: "700" }}>BANNED</Text></View>}
            </View>
          </View>
          <Pressable
            onPress={() => Alert.alert(u.is_banned ? "Unban User" : "Ban User", `${u.is_banned ? "Unban" : "Ban"} @${u.username}?`, [
              { text: "Cancel", style: "cancel" },
              { text: u.is_banned ? "Unban" : "Ban", style: u.is_banned ? "default" : "destructive", onPress: () => toggleBan(u.id, u.is_banned) },
            ])}
            style={[styles.adminActionBtn, { backgroundColor: u.is_banned ? "#22c55e22" : "#ef444422", borderColor: u.is_banned ? "#22c55e44" : "#ef444444" }]}
          >
            <Text style={{ color: u.is_banned ? "#22c55e" : "#ef4444", fontSize: 12, fontWeight: "700" }}>{u.is_banned ? "Unban" : "Ban"}</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

function ContentModeration({ colors }: { colors: any }) {
  const qc = useQueryClient();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*, actor:actor_id(display_name, avatar_url, username), posts(id, content, author_id)")
        .eq("type", "report")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const removePost = async (postId: string, notifId: string) => {
    await supabase.from("posts").delete().eq("id", postId);
    await supabase.from("notifications").update({ is_read: true }).eq("id", notifId);
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
  };

  const dismissReport = async (notifId: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notifId);
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
  };

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;
  if ((reports as any[]).length === 0) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Feather name="check-circle" size={48} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>No pending reports</Text>
    </View>
  );

  return (
    <FlatList
      data={reports as any[]}
      keyExtractor={r => r.id}
      contentContainerStyle={{ paddingBottom: 40 }}
      renderItem={({ item: r }) => {
        const post = (r as any).posts;
        const actor = (r as any).actor;
        return (
          <View style={[styles.adminRow, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar name={actor?.display_name ?? "U"} avatarUrl={actor?.avatar_url} size={36} />
              <View>
                <Text style={[styles.adminRowName, { color: colors.foreground }]}>Reported by @{actor?.username ?? "user"}</Text>
                <Text style={[styles.adminRowSub, { color: colors.mutedForeground }]}>{timeAgo(r.created_at)}</Text>
              </View>
            </View>
            {post?.content && (
              <View style={{ borderRadius: 10, padding: 10, borderWidth: StyleSheet.hairlineWidth, backgroundColor: colors.secondary, borderColor: colors.border, width: "100%" }}>
                <Text style={{ color: colors.foreground, fontSize: 13 }} numberOfLines={3}>{post.content}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {post?.id && (
                <Pressable
                  onPress={() => Alert.alert("Remove Post", "Permanently delete this post?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => removePost(post.id, r.id) },
                  ])}
                  style={[styles.adminActionBtn, { backgroundColor: "#ef444422", borderColor: "#ef444444" }]}
                >
                  <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "700" }}>Remove Post</Text>
                </Pressable>
              )}
              <Pressable onPress={() => dismissReport(r.id)} style={[styles.adminActionBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700" }}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

function Analytics({ colors }: { colors: any }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const [users, posts, stories] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("posts").select("id", { count: "exact", head: true }),
        supabase.from("stories").select("id", { count: "exact", head: true }),
      ]);
      const { data: recentUsers } = await supabase.from("profiles").select("id").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      const { data: recentPosts } = await supabase.from("posts").select("id").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      return {
        totalUsers: users.count ?? 0,
        totalPosts: posts.count ?? 0,
        totalStories: stories.count ?? 0,
        newUsersWeek: recentUsers?.length ?? 0,
        newPostsWeek: recentPosts?.length ?? 0,
      };
    },
  });

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;

  const cards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: "users" as const, color: "#7c3aed" },
    { label: "Total Posts", value: stats?.totalPosts ?? 0, icon: "grid" as const, color: "#3b82f6" },
    { label: "Total Stories", value: stats?.totalStories ?? 0, icon: "camera" as const, color: "#f97316" },
    { label: "New Users (7d)", value: stats?.newUsersWeek ?? 0, icon: "user-plus" as const, color: "#22c55e" },
    { label: "New Posts (7d)", value: stats?.newPostsWeek ?? 0, icon: "edit-3" as const, color: "#ec4899" },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {cards.map(c => (
        <View key={c.label} style={[styles.analyticsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.analyticsIcon, { backgroundColor: c.color + "22" }]}>
            <Feather name={c.icon} size={20} color={c.color} />
          </View>
          <View>
            <Text style={[styles.analyticsValue, { color: colors.foreground }]}>{formatCount(c.value)}</Text>
            <Text style={[styles.analyticsLabel, { color: colors.mutedForeground }]}>{c.label}</Text>
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

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color="#7c3aed" /></View>;
  if (!profile?.is_admin) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Feather name="shield-off" size={48} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 16 }}>Admin access required</Text>
    </View>
  );

  const viewTitles: Record<AdminView, string> = {
    menu: "Admin Panel", users: "User Management",
    moderation: "Content Moderation", analytics: "Analytics",
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => view === "menu" ? router.back() : setView("menu")} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <View style={[styles.adminBadge, { backgroundColor: "#7c3aed22" }]}>
            <Feather name="shield" size={12} color="#7c3aed" />
            <Text style={{ color: "#7c3aed", fontSize: 10, fontWeight: "800" }}>ADMIN</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{viewTitles[view]}</Text>
        </View>
        <View style={{ width: 30 }} />
      </View>

      {view === "menu" && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          {[
            { label: "User Management", icon: "users" as const, view: "users" as AdminView, desc: "Ban, unban, and manage users" },
            { label: "Content Moderation", icon: "shield" as const, view: "moderation" as AdminView, desc: "Review and remove reported posts" },
            { label: "Analytics", icon: "bar-chart-2" as const, view: "analytics" as AdminView, desc: "Platform stats and growth metrics" },
            { label: "Reports", icon: "flag" as const, view: "moderation" as AdminView, desc: "All user-submitted reports" },
          ].map(item => (
            <Pressable key={item.label} onPress={() => setView(item.view)}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.cardIcon, { backgroundColor: "#7c3aed22" }]}>
                <Feather name={item.icon} size={22} color="#7c3aed" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {view === "users" && <UserManagement colors={colors} />}
      {(view === "moderation") && <ContentModeration colors={colors} />}
      {view === "analytics" && <Analytics colors={colors} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { fontSize: 17, fontWeight: "700" },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  cardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardLabel: { fontSize: 15, fontWeight: "700" },
  cardDesc: { fontSize: 12, marginTop: 2 },
  adminRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  adminRowName: { fontSize: 14, fontWeight: "700" },
  adminRowSub: { fontSize: 12, marginTop: 1 },
  adminActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  analyticsCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  analyticsIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  analyticsValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  analyticsLabel: { fontSize: 13, marginTop: 2 },
});
