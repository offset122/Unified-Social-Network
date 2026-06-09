import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { useGetMyProfile } from "@workspace/api-client-react";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { data: profile } = useGetMyProfile();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
      {profile && (
        <View style={styles.info}>
          <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "bold" }}>{profile.displayName}</Text>
          <Text style={{ color: colors.mutedForeground }}>@{profile.username}</Text>
          <Text style={{ color: colors.foreground, marginTop: 12 }}>{profile.bio}</Text>
        </View>
      )}
      <Pressable onPress={logout} style={[styles.btn, { backgroundColor: colors.secondary }]}>
        <Text style={{ color: colors.secondaryForeground }}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: "bold", marginVertical: 16 },
  info: { marginVertical: 24 },
  btn: { padding: 16, borderRadius: 8, alignItems: "center" }
});
