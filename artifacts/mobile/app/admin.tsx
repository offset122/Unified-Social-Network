import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fetchProfile } from "@/lib/db";

export default function AdminScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(user?.id ?? ""),
    enabled: !!user?.id,
  });

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color="#7c3aed" /></View>;
  if (!profile?.is_admin) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Feather name="shield-off" size={48} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 16 }}>Admin access required</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Admin Panel</Text>
        <View style={{ width: 30 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        {[
          { label: "User Management", icon: "users" as const },
          { label: "Content Moderation", icon: "shield" as const },
          { label: "Analytics", icon: "bar-chart-2" as const },
          { label: "Reports", icon: "flag" as const },
        ].map(item => (
          <Pressable key={item.label} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name={item.icon} size={22} color={colors.primary} />
            <Text style={[styles.cardLabel, { color: colors.foreground }]}>{item.label}</Text>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  cardLabel: { fontSize: 15, fontWeight: "600" },
});
