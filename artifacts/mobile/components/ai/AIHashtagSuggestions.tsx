import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { generateAIHashtags } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

interface Props {
  content: string;
  onApply: (tags: string) => void;
}

export default function AIHashtagSuggestions({ content, onApply }: Props) {
  const colors = useColors();
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const result = await generateAIHashtags(content);
      setTags(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Pressable onPress={fetch} disabled={loading || !content.trim()} style={styles.btn}>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Feather name="hash" size={22} color={colors.primary} />
        )}
        <Text style={[styles.btnText, { color: colors.primary }]}>
          {loading ? "Generating…" : "# Tags"}
        </Text>
      </Pressable>

      {tags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {tags.map((tag, i) => (
            <Pressable
              key={i}
              onPress={() => {
                onApply(tag);
                setTags(prev => prev.filter((_, j) => j !== i));
              }}
              style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            >
              <Text style={[styles.chipText, { color: colors.primary }]}>{tag}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setTags([])} style={[styles.chip, { paddingHorizontal: 10, backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="x" size={13} color={colors.mutedForeground} />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 6 },
  btnText: { fontSize: 13, fontWeight: "600" },
  chips: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "700" },
});
