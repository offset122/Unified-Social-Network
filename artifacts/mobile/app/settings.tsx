import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Switch, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colorScheme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const isDark = colorScheme === "dark";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 30 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Appearance</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Feather name="moon" size={17} color="#7c3aed" />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Dark Mode</Text>
              <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: "#7c3aed" }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Account</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { icon: "user" as const, label: "Edit Profile", path: "/edit-profile" },
              { icon: "lock" as const, label: "Change Password", path: "/change-password" },
              { icon: "bell" as const, label: "Notifications", path: "/notifications" },
            ].map((item, i, arr) => (
              <Pressable key={item.label} onPress={() => router.push(item.path as any)}
                style={[styles.row, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Feather name={item.icon} size={17} color="#7c3aed" />
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={() => Alert.alert("Log Out", "Are you sure?", [
          { text: "Cancel", style: "cancel" },
          { text: "Log Out", style: "destructive", onPress: logout },
        ])} style={styles.logoutBtn}>
          <Feather name="log-out" size={17} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  section: { paddingHorizontal: 18, paddingTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  rowLabel: { fontSize: 15, fontWeight: "500", flex: 1 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 18, marginTop: 28, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: "#ef444444", backgroundColor: "#ef444410" },
  logoutText: { fontSize: 15, fontWeight: "700", color: "#ef4444" },
});
