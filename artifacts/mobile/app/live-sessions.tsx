import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  TextInput, Alert, Image, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { fetchLiveSessions, startLiveSession, endLiveSession, resolveMediaUrl, formatCount, type Profile } from "@/lib/db";
import { supabase } from "@/lib/supabase";

export default function LiveSessionsScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [liveTitle, setLiveTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [mySessionId, setMySessionId] = useState<string | null>(null);

  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ["live-sessions"],
    queryFn: fetchLiveSessions,
    refetchInterval: 10000,
  });

  const handleStartLive = async () => {
    if (!user?.id) return;
    const title = liveTitle.trim() || "Live";
    setStarting(true);
    try {
      const session = await startLiveSession(user.id, title);
      setMySessionId(session.id);
      setLiveTitle("");
      qc.invalidateQueries({ queryKey: ["live-sessions"] });
      Alert.alert("You're Live! 🔴", `"${title}" is now streaming. Tap End Session when done.`, [
        { text: "End Session", style: "destructive", onPress: () => handleEndLive(session.id) },
        { text: "Keep Streaming" },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setStarting(false); }
  };

  const handleEndLive = async (sessionId: string) => {
    await endLiveSession(sessionId);
    setMySessionId(null);
    qc.invalidateQueries({ queryKey: ["live-sessions"] });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Live Sessions</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Go Live section */}
      <View style={[styles.goLiveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <LinearGradient colors={["#ef4444", "#b91c1c"]} style={styles.liveDot}>
          <Feather name="radio" size={18} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.goLiveTitle, { color: colors.foreground }]}>
            {mySessionId ? "You are live 🔴" : "Go Live"}
          </Text>
          {!mySessionId ? (
            <TextInput
              style={[styles.titleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Give your stream a title..." placeholderTextColor={colors.mutedForeground}
              value={liveTitle} onChangeText={setLiveTitle}
            />
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Your session is active</Text>
          )}
        </View>
        {mySessionId ? (
          <Pressable onPress={() => handleEndLive(mySessionId)} style={[styles.liveBtn, { backgroundColor: "#ef4444" }]}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>End</Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleStartLive} disabled={starting}
            style={[styles.liveBtn, { backgroundColor: "#ef4444" }]}>
            {starting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Go Live</Text>}
          </Pressable>
        )}
      </View>

      {/* Active sessions */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LIVE NOW</Text>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : sessions.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Feather name="radio" size={48} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700" }}>No active streams</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center" }}>Be the first to go live!</Text>
        </View>
      ) : (
        <FlatList
          data={sessions as any[]}
          keyExtractor={s => s.id}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item: s }) => {
            const host = s.profiles as Profile | undefined;
            return (
              <Pressable style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDotSmall} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
                <LinearGradient colors={["#1a0533", "#2d1b69"]} style={styles.sessionThumb}>
                  <Feather name="radio" size={28} color="rgba(255,255,255,0.4)" />
                </LinearGradient>
                <View style={styles.sessionInfo}>
                  <Text style={[styles.sessionTitle, { color: colors.foreground }]} numberOfLines={1}>{s.title}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                    {host?.avatar_url ? (
                      <Image source={{ uri: resolveMediaUrl(host.avatar_url) }} style={{ width: 20, height: 20, borderRadius: 10 }} />
                    ) : (
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{(host?.display_name ?? "U")[0]}</Text>
                      </View>
                    )}
                    <Text style={[styles.hostName, { color: colors.mutedForeground }]}>{host?.display_name ?? "Unknown"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Feather name="eye" size={12} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{formatCount(s.viewers_count)} watching</Text>
                  </View>
                </View>
                <Pressable style={[styles.joinBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Join</Text>
                </Pressable>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  goLiveCard: { flexDirection: "row", alignItems: "center", gap: 12, margin: 16, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  liveDot: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  goLiveTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  titleInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
  liveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 20, marginBottom: 4 },
  sessionCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", padding: 12, position: "relative" },
  liveBadge: { position: "absolute", top: 10, left: 10, zIndex: 2, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ef4444", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  sessionThumb: { width: 72, height: 72, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sessionInfo: { flex: 1 },
  sessionTitle: { fontSize: 15, fontWeight: "700" },
  hostName: { fontSize: 13 },
  joinBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
});
