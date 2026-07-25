import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Switch, Alert, Linking } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colorScheme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const isDark = colorScheme === "dark";

  const [pushLikes, setPushLikes] = useState(true);
  const [pushComments, setPushComments] = useState(true);
  const [pushFollows, setPushFollows] = useState(true);
  const [pushMessages, setPushMessages] = useState(true);
  const [privateAccount, setPrivateAccount] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "Type DELETE to confirm.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      if (user?.id) {
                        await supabase.from("profiles").delete().eq("id", user.id);
                        await supabase.auth.signOut();
                      }
                    } catch (e: any) {
                      Alert.alert("Error", e.message ?? "Failed to delete account");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Appearance */}
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

        {/* Account */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Account</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { icon: "user" as const, label: "Edit Profile", path: "/edit-profile" },
              { icon: "lock" as const, label: "Change Password", path: "/change-password" },
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

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Privacy</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Feather name="lock" size={17} color="#7c3aed" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Private Account</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 1 }}>Only approved followers can see your posts</Text>
              </View>
              <Switch value={privateAccount} onValueChange={setPrivateAccount} trackColor={{ true: "#7c3aed" }} />
            </View>
            <Pressable onPress={() => router.push("/blocked-users" as any)}
              style={styles.row}>
              <Feather name="eye-off" size={17} color="#7c3aed" />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Blocked Users</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
            </Pressable>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Notifications</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { label: "Likes", value: pushLikes, onChange: setPushLikes },
              { label: "Comments", value: pushComments, onChange: setPushComments },
              { label: "New Followers", value: pushFollows, onChange: setPushFollows },
              { label: "Messages", value: pushMessages, onChange: setPushMessages },
            ].map((item, i, arr) => (
              <View key={item.label} style={[styles.row, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Feather name="bell" size={17} color="#7c3aed" />
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Switch value={item.value} onValueChange={item.onChange} trackColor={{ true: "#7c3aed" }} />
              </View>
            ))}
          </View>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Support</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable onPress={() => Linking.openURL("https://vibe.example.com/help")}
              style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Feather name="help-circle" size={17} color="#7c3aed" />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Help & Support</Text>
              <Feather name="external-link" size={16} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
            </Pressable>
            <Pressable onPress={() => Alert.alert("Vibe", "Version 2.0.0\n\nBuilt with React Native & Expo.\n\nTerms: vibe.example.com/terms\nPrivacy: vibe.example.com/privacy")}
              style={styles.row}>
              <Feather name="info" size={17} color="#7c3aed" />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>About</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginLeft: "auto" }}>v2.0.0</Text>
            </Pressable>
          </View>
        </View>

        {/* Log Out */}
        <Pressable onPress={() => Alert.alert("Log Out", "Are you sure?", [
          { text: "Cancel", style: "cancel" },
          { text: "Log Out", style: "destructive", onPress: logout },
        ])} style={styles.logoutBtn}>
          <Feather name="log-out" size={17} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: "#ef4444" }]}>Danger Zone</Text>
          <View style={[styles.group, { backgroundColor: "#ef444408", borderColor: "#ef444430" }]}>
            <Pressable onPress={handleDeleteAccount} style={styles.row}>
              <Feather name="trash-2" size={17} color="#ef4444" />
              <Text style={[styles.rowLabel, { color: "#ef4444" }]}>Delete Account</Text>
              <Feather name="chevron-right" size={16} color="#ef4444" style={{ marginLeft: "auto" }} />
            </Pressable>
          </View>
        </View>
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
