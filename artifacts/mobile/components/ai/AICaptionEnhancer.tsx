import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { enhanceAICaption } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

interface Props {
  caption: string;
  onApply: (enhanced: string) => void;
}

export default function AICaptionEnhancer({ caption, onApply }: Props) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const enhance = async () => {
    if (!caption.trim()) return;
    setLoading(true);
    try {
      const result = await enhanceAICaption(caption);
      setPreview(result);
    } finally {
      setLoading(false);
    }
  };

  if (caption.length < 10) return null;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={enhance} disabled={loading} style={styles.btn}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Feather name="trending-up" size={22} color={colors.primary} />
        )}
        <Text style={[styles.btnText, { color: colors.primary }]}>
          {loading ? "Enhancing…" : "Enhance"}
        </Text>
      </Pressable>

      {preview && (
        <View style={[styles.preview, { backgroundColor: colors.secondary, borderColor: colors.primary + "44" }]}>
          <View style={styles.previewHeader}>
            <Feather name="zap" size={13} color={colors.primary} />
            <Text style={[styles.previewLabel, { color: colors.primary }]}>Enhanced version</Text>
          </View>
          <Text style={[styles.previewText, { color: colors.foreground }]}>{preview}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => { onApply(preview); setPreview(null); }}
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="check" size={13} color="#fff" />
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
            <Pressable onPress={enhance} disabled={loading} style={[styles.retryBtn, { borderColor: colors.border }]}>
              <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={() => setPreview(null)} style={[styles.retryBtn, { borderColor: colors.border }]}>
              <Feather name="x" size={13} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6 },
  btnText: { fontSize: 13, fontWeight: "600" },
  preview: { marginHorizontal: 16, borderRadius: 14, padding: 12, borderWidth: 1.5, gap: 8 },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
  previewLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  previewText: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 8 },
  applyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14 },
  applyText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  retryBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
