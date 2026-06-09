import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useGetNotifications } from "@workspace/api-client-react";

export default function NotificationsScreen() {
  const colors = useColors();
  
  const { data: notificationsPage, isLoading } = useGetNotifications();

  if (isLoading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Notifications" }} />
      <FlatList
        data={notificationsPage?.items || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.card, { borderBottomColor: colors.border }]}>
            <Text style={{ color: colors.foreground }}>
              <Text style={{ fontWeight: "bold" }}>{item.actor?.displayName}</Text> {item.type}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth }
});
