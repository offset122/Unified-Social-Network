import React from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  Pressable, Image, Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { resolveMediaUrl, timeAgo } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";

type Notif = {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  profiles?: { display_name: string; avatar_url: string | null; username: string } | null;
  posts?: { media_urls: string[] } | null;
};

const NOTIF_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  follow:  { icon: "user-plus",      color: "#7c3aed", label: "followed you" },
  like:    { icon: "heart",          color: "#ef4444", label: "liked your post" },
  comment: { icon: "message-circle", color: "#3b82f6", label: "commented on your post" },
  reply:   { icon: "corner-up-right",color: "#06b6d4", label: "replied to your comment" },
  mention: { icon: "at-sign",        color: "#8b5cf6", label: "mentioned you" },
  message: { icon: "send",           color: "#10b981", label: "sent you a message" },
  live:    { icon: "radio",          color: "#ef4444", label: "went live" },
};

async function fetchNotifications(userId: string): Promise<Notif[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*, profiles:actor_id(display_name, avatar_url, username), posts(media_urls)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Notif[];
}

async function markAllRead(userId: string) {
  await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
}

function NotifAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const [err, setErr] = React.useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: 44, height: 44, borderRadius: 22 }}
      onError={() => setErr(true)} />;
  }
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: notifs = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => fetchNotifications(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const markAllMut = useMutation({
    mutationFn: () => markAllRead(user?.id ?? ""),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
    },
  });

  const unreadCount = (notifs as Notif[]).filter(n => !n.is_read).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable onPress={() => markAllMut.mutate()} hitSlop={8}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (notifs as Notif[]).length === 0 ? (
        <View style={styles.empty}>
          <LinearGradient colors={[colors.primary + "22", colors.primary + "08"]}
            style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Feather name="bell" size={36} color={colors.primary} />
          </LinearGradient>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All caught up!</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={notifs as Notif[]}
          keyExtractor={n => n.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          renderItem={({ item: n }) => {
            const meta = NOTIF_ICONS[n.type] ?? NOTIF_ICONS.like;
            const actor = n.profiles;
            const name = actor?.display_name ?? "Someone";
            const thumb = n.posts?.media_urls?.[0];
            return (
              <Pressable
                style={[styles.notifRow, { borderBottomColor: colors.border, backgroundColor: n.is_read ? "transparent" : colors.primary + "08" }]}
                onPress={async () => {
                  await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                  qc.invalidateQueries({ queryKey: ["notif-count"] });
                  // Navigate based on type
                  if (n.type === "follow" && n.profiles?.username) {
                    const { data: actor } = await supabase.from("profiles").select("id").eq("username", n.profiles.username).maybeSingle();
                    if (actor?.id) router.push(`/user/${actor.id}` as any);
                  } else if ((n.type === "like" || n.type === "comment" || n.type === "reply" || n.type === "mention") && (n as any).post_id) {
                    router.push(`/post/${(n as any).post_id}` as any);
                  } else if (n.type === "message") {
                    router.push("/(tabs)/messages" as any);
                  } else if (n.type === "live") {
                    router.push("/live-sessions" as any);
                  }
                }}
              >
                <View style={{ position: "relative" }}>
                  <NotifAvatar name={name} avatarUrl={actor?.avatar_url} />
                  <View style={[styles.notifIconBadge, { backgroundColor: meta.color }]}>
                    <Feather name={meta.icon} size={10} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifText, { color: colors.foreground }]}>
                    <Text style={{ fontWeight: "700" }}>{name}</Text>
                    {" "}{meta.label}
                  </Text>
                  <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{timeAgo(n.created_at)}</Text>
                </View>
                {thumb && (
                  <Image source={{ uri: resolveMediaUrl(thumb) }}
                    style={styles.notifThumb} resizeMode="cover" />
                )}
                {!n.is_read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14 },
  notifRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  notifIconBadge: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  notifText: { fontSize: 14, lineHeight: 20 },
  notifTime: { fontSize: 12, marginTop: 2 },
  notifThumb: { width: 44, height: 44, borderRadius: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
});
