import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function ChangePasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const domain = process.env.EXPO_PUBLIC_DOMAIN;

  const handleSave = async () => {
    if (!current.trim()) { Alert.alert("Error", "Enter your current password."); return; }
    if (next.length < 8) { Alert.alert("Error", "New password must be at least 8 characters."); return; }
    if (next !== confirm) { Alert.alert("Error", "New passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch(`https://${domain}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        Alert.alert("Success", "Password changed successfully.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Error", (err as { error?: string }).error ?? "Failed to change password.");
      }
    } catch {
      Alert.alert("Error", "Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Change Password" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CURRENT PASSWORD</Text>
          <View style={styles.field}>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
              placeholder="Current password"
              placeholderTextColor={colors.mutedForeground}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
            />
            <Pressable style={styles.eye} onPress={() => setShowCurrent(!showCurrent)}>
              <Feather name={showCurrent ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>NEW PASSWORD</Text>
          <View style={styles.field}>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
              placeholder="New password (min 8 characters)"
              placeholderTextColor={colors.mutedForeground}
              value={next}
              onChangeText={setNext}
              secureTextEntry={!showNext}
              autoCapitalize="none"
            />
            <Pressable style={styles.eye} onPress={() => setShowNext(!showNext)}>
              <Feather name={showNext ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={[styles.field, { marginTop: 8 }]}>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
              placeholder="Confirm new password"
              placeholderTextColor={colors.mutedForeground}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
            />
            <Pressable style={styles.eye} onPress={() => setShowConfirm(!showConfirm)}>
              <Feather name={showConfirm ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {next.length > 0 && (
          <View style={styles.strengthRow}>
            {["length", "upper", "number", "special"].map((check) => {
              const pass =
                check === "length" ? next.length >= 8 :
                check === "upper" ? /[A-Z]/.test(next) :
                check === "number" ? /[0-9]/.test(next) :
                /[^a-zA-Z0-9]/.test(next);
              const label =
                check === "length" ? "8+ chars" :
                check === "upper" ? "Uppercase" :
                check === "number" ? "Number" : "Symbol";
              return (
                <View key={check} style={styles.strengthChip}>
                  <Feather name={pass ? "check-circle" : "circle"} size={12} color={pass ? "#22c55e" : colors.mutedForeground} />
                  <Text style={[styles.strengthLabel, { color: pass ? "#22c55e" : colors.mutedForeground }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={handleSave}
          disabled={loading}
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Update Password</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 20 },
  section: { borderRadius: 14, overflow: "hidden" },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  field: { position: "relative" },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, paddingRight: 48, fontSize: 15, borderWidth: 1 },
  eye: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },
  strengthRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  strengthChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  strengthLabel: { fontSize: 12 },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  saveBtnText: { fontSize: 16, fontWeight: "700" },
});
