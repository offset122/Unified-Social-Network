import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { generateAIBio } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

interface Props {
  displayName: string;
  onApply: (bio: string) => void;
}

export default function AIBioWriter({ displayName, onApply }: Props) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const generate = async () => {
    if (!displayName.trim()) return;
    setLoading(true);
    try {
      const result = await generateAIBio(displayName);
      setPreview(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={generate}
        disabled={loading || !displayName.trim()}
        style={[styles.btn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "11" }]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Feather name="zap" size={14} color={colors.primary} />
        )}
        <Text style={[styles.btnText, { color: colors.primary }]}>
          {loading ? "Writing…" : "Write with AI ✨"}
        </Text>
      </Pressable>

      {preview && (
        <View style={[styles.preview, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.previewText, { color: colors.foreground }]}>{preview}</Text>
          <View style={styles.previewActions}>
            <Pressable
              onPress={() => { onApply(preview); setPreview(null); }}
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="check" size={13} color="#fff" />
              <Text style={styles.applyBtnText}>Use this</Text>
            </Pressable>
            <Pressable onPress={() => setPreview(null)} style={[styles.dismissBtn, { borderColor: colors.border }]}>
              <Text style={[styles.dismissText, { color: colors.mutedForeground }]}>Dismiss</Text>
            </Pressable>
            <Pressable onPress={generate} disabled={loading} style={[styles.dismissBtn, { borderColor: colors.border }]}>
              <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: "600" },
  preview: { borderRadius: 12, padding: 12, borderWidth: 1, gap: 10 },
  previewText: { fontSize: 14, lineHeight: 20 },
  previewActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  applyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },
  applyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  dismissBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  dismissText: { fontSize: 13 },
});
