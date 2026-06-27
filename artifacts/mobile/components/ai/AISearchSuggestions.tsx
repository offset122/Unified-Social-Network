import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { generateSearchSuggestions } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

interface Props {
  query: string;
  onSelect: (suggestion: string) => void;
}

export default function AISearchSuggestions({ query, onSelect }: Props) {
  const colors = useColors();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await generateSearchSuggestions(query);
        setSuggestions(result);
      } finally {
        setLoading(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [query]);

  if (!query.trim() || (!loading && suggestions.length === 0)) return null;

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Feather name="zap" size={12} color={colors.primary} />
        <Text style={[styles.label, { color: colors.primary }]}>AI Suggestions</Text>
        {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} />}
      </View>
      <View style={styles.chips}>
        {suggestions.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => onSelect(s)}
            style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          >
            <Feather name="search" size={11} color={colors.mutedForeground} />
            <Text style={[styles.chipText, { color: colors.foreground }]}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13 },
});
