import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Link, Redirect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetChats } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

type Chat = {
  id: string;
  participant: { id: string; displayName: string; username: string };
  lastMessage: { content: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  createdAt: string;
};

export default function MessagesScreen() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: chats, isLoading } = useGetChats();

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const list = (chats ?? []) as Chat[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
        <Pressable style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
          <Feather name="edit" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="message-square" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No conversations yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Search for friends to start chatting
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const isMe = item.lastMessage?.senderId === user?.id;
            return (
              <Link href={`/chat/${item.id}`} asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.chatRow,
                    { borderBottomColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent" },
                  ]}
                >
                  <Avatar name={item.participant.displayName} size={48} />
                  <View style={styles.chatInfo}>
                    <View style={styles.chatTop}>
                      <Text style={[styles.chatName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.participant.displayName}
                      </Text>
                      {item.lastMessage && (
                        <Text style={[styles.chatTime, { color: colors.mutedForeground }]}>
                          {timeAgo(item.lastMessage.createdAt)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.chatBottom}>
                      <Text
                        style={[
                          styles.chatPreview,
                          {
                            color: item.unreadCount > 0 ? colors.foreground : colors.mutedForeground,
                            fontWeight: item.unreadCount > 0 ? "600" : "400",
                            flex: 1,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.lastMessage
                          ? `${isMe ? "You: " : ""}${item.lastMessage.content}`
                          : "Start a conversation"}
                      </Text>
                      {item.unreadCount > 0 && (
                        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                          <Text style={styles.badgeText}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              </Link>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 12 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  chatRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chatInfo: { flex: 1, marginLeft: 12 },
  chatTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  chatName: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 8 },
  chatTime: { fontSize: 12 },
  chatBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatPreview: { fontSize: 14 },
  badge: { borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
