import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
  useGetUserPosts,
  getGetUserPostsQueryKey,
} from "@workspace/api-client-react";

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: profile, isLoading: isProfileLoading } = useGetUserProfile(
    userId as string,
    { query: { enabled: !!userId, queryKey: getGetUserProfileQueryKey(userId as string) } },
  );
  const { data: postsPage } = useGetUserPosts(
    userId as string,
    undefined,
    { query: { enabled: !!userId, queryKey: getGetUserPostsQueryKey(userId as string) } },
  );

  if (isProfileLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>User not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: profile.displayName }} />
      <FlatList
        data={postsPage?.items ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.name, { color: colors.foreground }]}>{profile.displayName}</Text>
            <Text style={{ color: colors.mutedForeground }}>@{profile.username}</Text>
            {profile.bio ? (
              <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text>
            ) : null}
            <View style={styles.stats}>
              <Text style={{ color: colors.foreground }}>
                <Text style={{ fontWeight: "bold" }}>{profile.followersCount}</Text> Followers
              </Text>
              <Text style={{ color: colors.foreground }}>
                <Text style={{ fontWeight: "bold" }}>{profile.followingCount}</Text> Following
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.postCard, { borderBottomColor: colors.border }]}>
            <Text style={{ color: colors.foreground, marginTop: 8 }}>{item.content}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: 16 },
  name: { fontSize: 24, fontWeight: "bold" },
  bio: { marginTop: 12, fontSize: 16 },
  stats: { flexDirection: "row", gap: 16, marginTop: 16 },
  postCard: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
