import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function CreateChannelScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channelType, setChannelType] = useState<"public" | "private">("public");
  const [icon, setIcon] = useState("📢");
  const [creating, setCreating] = useState(false);

  const channelIcons = ["📢", "📰", "💬", "📣", "🔔", "📡", "🌐", "📡"];

  const handleCreate = async () => {
    if (!name.trim() || !user?.id) return;
    setCreating(true);
    try {
      const { data: ch, error } = await supabase.from("conversations").insert({
        type: "group", name: name.trim(), description: description.trim(), created_by: user.id,
        is_private: channelType === "private",
      }).select().single();
      if (error) throw error;
      await supabase.from("conversation_members").insert({ conversation_id: ch.id, user_id: user.id, is_admin: true });
      router.replace({ pathname: `/channel/${ch.id}` } as any);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setCreating(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>New Channel</Text>
        <Pressable onPress={handleCreate} disabled={!name.trim() || creating}
          style={[styles.btn, { backgroundColor: name.trim() ? colors.primary : colors.muted }]}>
          {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create</Text>}
        </Pressable>
      </View>
      <View style={{ padding: 20 }}>
        <TextInput style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
          placeholder="Channel name..." placeholderTextColor={colors.mutedForeground}
          value={name} onChangeText={setName} autoFocus />
        <TextInput style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border, marginTop: 12 }]}
          placeholder="Description (optional)" placeholderTextColor={colors.mutedForeground}
          value={description} onChangeText={setDescription} />
        <View style={[{ flexDirection: "row", gap: 10, marginTop: 12, borderWidth: 1.5, borderRadius: 14, padding: 4, backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Pressable onPress={() => setChannelType("public")} style={[{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" }, channelType === "public" && { backgroundColor: colors.primary }]}>
            <Text style={[{ fontSize: 14, fontWeight: "700", color: channelType === "public" ? "#fff" : colors.mutedForeground }]}>Public</Text>
          </Pressable>
          <Pressable onPress={() => setChannelType("private")} style={[{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" }, channelType === "private" && { backgroundColor: colors.primary }]}>
            <Text style={[{ fontSize: 14, fontWeight: "700", color: channelType === "private" ? "#fff" : colors.mutedForeground }]}>Private</Text>
          </Pressable>
        </View>
        <Text style={[{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: colors.mutedForeground, marginTop: 16, marginBottom: 8 }]}>Icon</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {channelIcons.map(emoji => (
            <Pressable key={emoji} onPress={() => setIcon(emoji)} style={[{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: icon === emoji ? colors.primary : colors.card, borderColor: colors.border }]}>
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  typeBtnText: { fontSize: 14, fontWeight: "700" },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 22 },
});
