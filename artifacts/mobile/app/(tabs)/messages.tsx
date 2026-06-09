import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetChats } from "@workspace/api-client-react";

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: chats } = useGetChats();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
      <FlatList 
        data={chats || []}
        keyExtractor={c => c.id}
        renderItem={({ item }) => (
           <View style={styles.chatRow}>
             <Text style={{ color: colors.foreground }}>{item.participant.displayName}</Text>
           </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: "bold", marginVertical: 16 },
  chatRow: { paddingVertical: 16 }
});
