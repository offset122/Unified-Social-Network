import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  useGetLiveSessions,
  useStartLiveSession,
  useEndLiveSession,
  getGetLiveSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const apiPath = path.startsWith("/objects/") ? `/api/storage${path}` : path;
  return `${BASE_URL}${apiPath}`;
}

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
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

export default function LiveSessionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [showStartModal, setShowStartModal] = useState(false);
  const [liveTitle, setLiveTitle] = useState("");

  const { data: sessions, isLoading, refetch } = useGetLiveSessions();
  const startLive = useStartLiveSession();
  const endLive = useEndLiveSession();

  const handleStartLive = () => {
    startLive.mutate(
      { data: { title: liveTitle.trim() || "Live" } },
      {
        onSuccess: () => {
          setShowStartModal(false);
          setLiveTitle("");
          qc.invalidateQueries({ queryKey: getGetLiveSessionsQueryKey() });
          Alert.alert(
            "Live Started! 🔴",
            "You're now live! Share this with your followers.",
            [{ text: "OK" }],
          );
        },
        onError: () => Alert.alert("Error", "Failed to start live session."),
      },
    );
  };

  const handleEndLive = () => {
    Alert.alert("End Live", "Are you sure you want to end your live session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Live",
        style: "destructive",
        onPress: () => {
          endLive.mutate(undefined, {
            onSuccess: () => qc.invalidateQueries({ queryKey: getGetLiveSessionsQueryKey() }),
          });
        },
      },
    ]);
  };

  const liveSessions = Array.isArray(sessions) ? sessions : [];
  const mySession = liveSessions.find((s) => s.host.id === user?.id);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Live" }} />

      {/* Go Live / End Live button */}
      <View style={[styles.goLiveSection, { borderBottomColor: colors.border }]}>
        {mySession ? (
          <View style={{ gap: 10 }}>
            <View style={[styles.myLiveBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
              <View style={styles.liveDot} />
              <Text style={[styles.myLiveText, { color: colors.primary }]}>
                You're live — "{mySession.title}"
              </Text>
              <Text style={[styles.myLiveViewers, { color: colors.mutedForeground }]}>
                {mySession.viewersCount} watching
              </Text>
            </View>
            <Pressable
              onPress={handleEndLive}
              style={({ pressed }) => [styles.endBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="video-off" size={16} color="#fff" />
              <Text style={styles.endBtnText}>End Live</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowStartModal(true)}
            style={({ pressed }) => [styles.goLiveBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <LinearGradient
              colors={["#ef4444", "#dc2626"]}
              style={styles.goLiveGradient}
            >
              <Feather name="video" size={18} color="#fff" />
              <Text style={styles.goLiveBtnText}>Go Live</Text>
            </LinearGradient>
          </Pressable>
        )}
      </View>

      {/* Active sessions list */}
      <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Live Sessions</Text>
        <Pressable onPress={() => refetch()} hitSlop={10}>
          <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : liveSessions.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="video" size={30} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No live sessions</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Be the first to go live!
          </Text>
        </View>
      ) : (
        <FlatList
          data={liveSessions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.sessionCard,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={{ position: "relative" }}>
                <Avatar name={item.host.displayName} avatarUrl={item.host.avatarUrl} size={52} />
                <View style={styles.liveIndicator}>
                  <Text style={styles.liveIndicatorText}>LIVE</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sessionHost, { color: colors.foreground }]}>{item.host.displayName}</Text>
                <Text style={[styles.sessionTitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.viewersRow}>
                  <Feather name="eye" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.viewersText, { color: colors.mutedForeground }]}>
                    {item.viewersCount} watching
                  </Text>
                </View>
              </View>
              <Pressable
                style={[styles.watchBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Alert.alert("Watch Live", `Watch ${item.host.displayName}'s live stream?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Watch", onPress: () => {} },
                  ]);
                }}
              >
                <Text style={styles.watchBtnText}>Watch</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {/* Start Live Modal */}
      {showStartModal && (
        <View style={StyleSheet.absoluteFillObject}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.5)" }]}
            onPress={() => setShowStartModal(false)}
          />
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Start Live Session</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Give your live a title so viewers know what to expect
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
              placeholder="Live title (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={liveTitle}
              onChangeText={setLiveTitle}
              maxLength={60}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowStartModal(false)}
                style={[styles.modalBtn, { backgroundColor: colors.secondary }]}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleStartLive}
                disabled={startLive.isPending}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
              >
                {startLive.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Go Live 🔴</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  goLiveSection: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  goLiveBtn: { borderRadius: 14, overflow: "hidden" },
  goLiveGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  goLiveBtnText: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  myLiveBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  myLiveText: { flex: 1, fontSize: 14, fontWeight: "600" },
  myLiveViewers: { fontSize: 13 },
  endBtn: {
    backgroundColor: "#ef4444", borderRadius: 10, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12,
  },
  endBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptyDesc: { fontSize: 14, textAlign: "center" },
  sessionCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  liveIndicator: { position: "absolute", bottom: -2, left: "50%", transform: [{ translateX: -16 }], backgroundColor: "#ef4444", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  liveIndicatorText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  sessionHost: { fontSize: 15, fontWeight: "700" },
  sessionTitle: { fontSize: 13, marginTop: 2 },
  viewersRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  viewersText: { fontSize: 12 },
  watchBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  watchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  modalCard: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalDesc: { fontSize: 14, lineHeight: 20 },
  modalInput: {
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, marginTop: 4,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  modalBtnPrimary: { backgroundColor: "#ef4444" },
});
