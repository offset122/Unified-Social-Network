import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Modal, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { generateProfileInsights } from "@/lib/db";
import { useColors } from "@/hooks/useColors";
import type { Post } from "@/lib/db";

interface Props {
  posts: Post[];
}

export default function AIProfileInsights({ posts }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);

  const open = async () => {
    setVisible(true);
    if (insights) return;
    setLoading(true);
    try {
      const stats = {
        totalPosts: posts.length,
        totalLikes: posts.reduce((s, p) => s + p.likes_count, 0),
        totalViews: posts.reduce((s, p) => s + p.views_count, 0),
        imagePosts: posts.filter(p => p.media_type === "image").length,
        videoPosts: posts.filter(p => p.media_type === "video").length,
        textPosts: posts.filter(p => !p.media_type).length,
      };
      const result = await generateProfileInsights(stats);
      setInsights(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={open}
        style={[styles.triggerBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "11" }]}
      >
        <Feather name="bar-chart-2" size={15} color={colors.primary} />
        <Text style={[styles.triggerText, { color: colors.primary }]}>AI Insights ✨</Text>
      </Pressable>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.headerIcon}>
              <Feather name="bar-chart-2" size={18} color="#fff" />
            </LinearGradient>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>AI Profile Insights</Text>
            <Pressable onPress={() => setVisible(false)} hitSlop={8}>
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {/* Stats summary */}
            <View style={[styles.statsGrid, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              {[
                { label: "Posts", value: posts.length },
                { label: "Total Likes", value: posts.reduce((s, p) => s + p.likes_count, 0) },
                { label: "Total Views", value: posts.reduce((s, p) => s + p.views_count, 0) },
              ].map(stat => (
                <View key={stat.label} style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value.toLocaleString()}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {/* AI insights */}
            <View style={[styles.insightsBox, { backgroundColor: colors.secondary, borderColor: colors.primary + "33" }]}>
              <View style={styles.insightsHeader}>
                <Feather name="zap" size={14} color={colors.primary} />
                <Text style={[styles.insightsLabel, { color: colors.primary }]}>AI Analysis</Text>
              </View>
              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Analyzing your content…</Text>
                </View>
              ) : (
                <Text style={[styles.insightsText, { color: colors.foreground }]}>
                  {insights ?? "No insights yet."}
                </Text>
              )}
            </View>

            {!loading && insights && (
              <Pressable
                onPress={() => { setInsights(null); open(); }}
                style={[styles.refreshBtn, { borderColor: colors.border }]}
              >
                <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
                <Text style={[styles.refreshText, { color: colors.mutedForeground }]}>Refresh insights</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  triggerText: { fontSize: 13, fontWeight: "700" },
  sheet: { flex: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: "700" },
  content: { padding: 16, gap: 14 },
  statsGrid: { flexDirection: "row", borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 14 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.3 },
  insightsBox: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 10 },
  insightsHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  insightsLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  loadingWrap: { alignItems: "center", paddingVertical: 20, gap: 10 },
  loadingText: { fontSize: 13 },
  insightsText: { fontSize: 15, lineHeight: 24 },
  refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  refreshText: { fontSize: 13, fontWeight: "600" },
});
