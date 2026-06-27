import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { generateAICommentSuggestions } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

interface Props {
  postContent: string;
  onSelect: (text: string) => void;
}

export default function AICommentSuggestions({ postContent, onSelect }: Props) {
  const colors = useColors();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    if (!postContent.trim()) return;
    setLoading(true);
    try {
      const result = await generateAICommentSuggestions(postContent);
      setSuggestions(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Pressable onPress={fetch} disabled={loading} hitSlop={8} style={styles.zapBtn}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Feather name="zap" size={18} color={colors.primary} />
        )}
      </Pressable>

      {suggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chips, { borderTopColor: colors.border }]}
        >
          <View style={[styles.aiLabel, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="zap" size={10} color={colors.primary} />
            <Text style={[styles.aiLabelText, { color: colors.primary }]}>AI</Text>
          </View>
          {suggestions.map((s, i) => (
            <Pressable
              key={i}
              onPress={() => { onSelect(s); setSuggestions([]); }}
              style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            >
              <Text style={[styles.chipText, { color: colors.foreground }]}>{s}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setSuggestions([])} style={[styles.chip, { paddingHorizontal: 10, backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="x" size={13} color={colors.mutedForeground} />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zapBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  chips: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  aiLabel: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16 },
  aiLabelText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13 },
});
