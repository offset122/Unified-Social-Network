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
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !user?.id) return;
    setCreating(true);
    try {
      const { data: ch, error } = await supabase.from("conversations").insert({
        type: "group", name: name.trim(), created_by: user.id,
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
});
