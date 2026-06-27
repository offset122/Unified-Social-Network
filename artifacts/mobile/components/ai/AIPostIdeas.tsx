import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { generatePostIdea } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

interface Props {
  trendingTags: string[];
  onApply: (idea: string) => void;
}

export default function AIPostIdeas({ trendingTags, onApply }: Props) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [idea, setIdea] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const result = await generatePostIdea(trendingTags);
      setIdea(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Feather name="zap" size={16} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.foreground }]}>Need inspiration?</Text>
      </View>

      {idea ? (
        <View style={styles.ideaBox}>
          <Text style={[styles.ideaText, { color: colors.foreground }]}>{idea}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => { onApply(idea); setIdea(null); }}
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="edit-2" size={13} color="#fff" />
              <Text style={styles.applyText}>Use idea</Text>
            </Pressable>
            <Pressable onPress={generate} disabled={loading} style={[styles.retryBtn, { borderColor: colors.border }]}>
              {loading ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />}
            </Pressable>
            <Pressable onPress={() => setIdea(null)} style={[styles.retryBtn, { borderColor: colors.border }]}>
              <Feather name="x" size={13} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={generate}
          disabled={loading}
          style={[styles.generateBtn, { backgroundColor: colors.primary }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="zap" size={15} color="#fff" />
          )}
          <Text style={styles.generateText}>{loading ? "Thinking…" : "Generate Idea ✨"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginVertical: 10, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heading: { fontSize: 14, fontWeight: "700" },
  ideaBox: { gap: 10 },
  ideaText: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 8 },
  applyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  applyText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  retryBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10, borderRadius: 14 },
  generateText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
