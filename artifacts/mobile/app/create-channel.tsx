import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function CreateChannelScreen() {
  const colors = useColors();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Create Channel", presentation: "modal" }} />
      <Text style={{ color: colors.foreground }}>Create Channel Form</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 }
});
