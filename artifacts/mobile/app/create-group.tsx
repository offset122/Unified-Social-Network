import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  Alert, FlatList, Image,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { searchUsers, createGroupConversation, resolveMediaUrl, type Profile } from "@/lib/db";

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function CreateGroupScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<"members" | "name">("members");

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchUsers(query),
    enabled: query.length >= 1,
  });

  const toggle = useCallback((profile: Profile) => {
    setSelected(prev =>
      prev.find(p => p.id === profile.id)
        ? prev.filter(p => p.id !== profile.id)
        : [...prev, profile]
    );
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !user?.id) return;
    if (selected.length === 0) {
      Alert.alert("Add members", "Select at least one person to add to the group.");
      return;
    }
    setCreating(true);
    try {
      const convoId = await createGroupConversation(user.id, name.trim(), selected.map(p => p.id));
      router.replace({ pathname: `/chat/${convoId}`, params: { peerName: name.trim() } } as any);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setCreating(false);
    }
  };

  const filteredResults = (results as Profile[]).filter(
    p => p.id !== user?.id && !selected.find(s => s.id === p.id)
  );

  if (step === "name") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setStep("members")} hitSlop={8}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Group Name</Text>
          <Pressable
            onPress={handleCreate}
            disabled={!name.trim() || creating}
            style={[styles.actionBtn, { backgroundColor: name.trim() ? colors.primary : colors.muted }]}
          >
            {creating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: "#fff", fontWeight: "700" }}>Create</Text>}
          </Pressable>
        </View>

        {/* Selected members preview */}
        <View style={[styles.selectedBar, { borderBottomColor: colors.border }]}>
          {selected.map(p => (
            <View key={p.id} style={styles.chip}>
              <Avatar name={p.display_name} avatarUrl={p.avatar_url} size={22} />
              <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>
                {p.display_name}
              </Text>
              <Pressable onPress={() => toggle(p)} hitSlop={6}>
                <Feather name="x" size={12} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>

        <View style={{ padding: 20 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Group Name</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
            placeholder="Enter group name..."
            placeholderTextColor={colors.mutedForeground}
            value={name} onChangeText={setName} autoFocus
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Add Members</Text>
        <Pressable
          onPress={() => {
            if (selected.length === 0) {
              Alert.alert("Add members", "Select at least one person.");
              return;
            }
            setStep("name");
          }}
          style={[styles.actionBtn, { backgroundColor: selected.length > 0 ? colors.primary : colors.muted }]}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Next</Text>
        </Pressable>
      </View>

      {/* Selected chips */}
      {selected.length > 0 && (
        <View style={[styles.selectedBar, { borderBottomColor: colors.border }]}>
          {selected.map(p => (
            <View key={p.id} style={styles.chip}>
              <Avatar name={p.display_name} avatarUrl={p.avatar_url} size={22} />
              <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>
                {p.display_name}
              </Text>
              <Pressable onPress={() => toggle(p)} hitSlop={6}>
                <Feather name="x" size={12} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search people to add..."
          placeholderTextColor={colors.mutedForeground}
          value={query} onChangeText={setQuery}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {isFetching ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredResults}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            query.length > 0 ? (
              <View style={styles.center}>
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>No users found</Text>
              </View>
            ) : null
          }
          renderItem={({ item: p }) => (
            <Pressable
              onPress={() => toggle(p)}
              style={[styles.userRow, { borderBottomColor: colors.border }]}
            >
              <Avatar name={p.display_name} avatarUrl={p.avatar_url} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{p.display_name}</Text>
                <Text style={[styles.userHandle, { color: colors.mutedForeground }]}>@{p.username}</Text>
              </View>
              <View style={[
                styles.checkCircle,
                { borderColor: colors.primary, backgroundColor: "transparent" },
              ]}>
                <Feather name="check" size={14} color={colors.primary} style={{ opacity: 0.15 }} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, minWidth: 60, alignItems: "center" },
  selectedBar: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    padding: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: "rgba(124,58,237,0.12)",
  },
  chipText: { fontSize: 13, fontWeight: "600", maxWidth: 80 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    margin: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userName: { fontSize: 15, fontWeight: "700" },
  userHandle: { fontSize: 13, marginTop: 1 },
  checkCircle: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
});
