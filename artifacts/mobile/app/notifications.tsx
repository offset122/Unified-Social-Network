import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Image,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetNotifications,
  useMarkAllNotificationsRead,
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const apiPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
  return `${BASE_URL}${apiPath}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

type NotifType = "follow" | "like" | "comment" | "reply" | "message" | "mention" | "channel_post";

function notifIcon(type: NotifType): { name: React.ComponentProps<typeof Feather>["name"]; color: string } {
  switch (type) {
    case "follow": return { name: "user-plus", color: "#7c3aed" };
    case "like": return { name: "heart", color: "#ef4444" };
    case "comment": return { name: "message-circle", color: "#0ea5e9" };
    case "reply": return { name: "corner-down-right", color: "#0ea5e9" };
    case "message": return { name: "mail", color: "#10b981" };
    case "mention": return { name: "at-sign", color: "#f59e0b" };
    case "channel_post": return { name: "radio", color: "#8b5cf6" };
    default: return { name: "bell", color: "#6b7280" };
  }
}

function notifText(type: NotifType, actorName: string): string {
  switch (type) {
    case "follow": return `${actorName} started following you`;
    case "like": return `${actorName} liked your post`;
    case "comment": return `${actorName} commented on your post`;
    case "reply": return `${actorName} replied to your comment`;
    case "message": return `${actorName} sent you a message`;
    case "mention": return `${actorName} mentioned you in a post`;
    case "channel_post": return `${actorName} posted in a channel you follow`;
    default: return `${actorName} interacted with you`;
  }
}

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = React.useState(false);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return (
      <Image
        source={{ uri: resolveMediaUrl(avatarUrl) }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,58%)`,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: page, isLoading, refetch } = useGetNotifications();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = page?.items ?? [];

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      },
    });
  };

  const handlePress = (item: typeof notifications[0]) => {
    if (item.postId) {
      router.push(`/post/${item.postId}`);
    } else if (item.actor) {
      router.push(`/user/${item.actor.id}`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () =>
            notifications.some((n) => !n.isRead) ? (
              <Pressable
                onPress={handleMarkAllRead}
                style={{ marginRight: 16 }}
                disabled={markAllRead.isPending}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>
                  Mark all read
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="bell" size={32} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All caught up!</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            You'll see notifications when people interact with you
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          onRefresh={refetch}
          refreshing={isLoading}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const icon = notifIcon(item.type as NotifType);
            const actorName = item.actor?.displayName ?? "Someone";
            return (
              <Pressable
                onPress={() => handlePress(item)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: !item.isRead ? `${colors.primary}08` : colors.background,
                    borderBottomColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                {/* Unread indicator */}
                <View style={[styles.unreadDot, { backgroundColor: !item.isRead ? colors.primary : "transparent" }]} />

                {/* Avatar with icon badge */}
                <View style={{ position: "relative" }}>
                  <Avatar name={actorName} avatarUrl={item.actor?.avatarUrl} size={46} />
                  <View style={[styles.iconBadge, { backgroundColor: icon.color }]}>
                    <Feather name={icon.name} size={10} color="#fff" />
                  </View>
                </View>

                {/* Content */}
                <View style={styles.notifBody}>
                  <Text style={[styles.notifText, { color: colors.foreground }]}>
                    {notifText(item.type as NotifType, actorName)}
                  </Text>
                  <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>

                {/* Chevron */}
                {(item.postId || item.actor) ? (
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                ) : null}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unreadDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  iconBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  notifBody: { flex: 1 },
  notifText: { fontSize: 14, lineHeight: 20 },
  notifTime: { fontSize: 12, marginTop: 3 },
});
