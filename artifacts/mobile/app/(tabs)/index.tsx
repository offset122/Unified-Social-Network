import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Platform } from "react-native";
import { useColors } from "@/hooks/useColors";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetFeed, useGetStories } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Redirect, Link } from "expo-router";

export default function HomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  
  const { data: feedData, isLoading: isLoadingFeed } = useGetFeed();
  const { data: storiesData } = useGetStories();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const isWeb = Platform.OS === "web";
  const webTopInset = isWeb ? 67 : 0;
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, webTopInset) }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>SocialApp</Text>
        <Link href="/notifications" asChild>
          <Pressable>
            <Text style={{ color: colors.primary }}>Notifs</Text>
          </Pressable>
        </Link>
      </View>

      {isLoadingFeed ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={feedData?.items || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.postCard, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontWeight: "bold" }}>{item.author.displayName}</Text>
              <Text style={{ color: colors.foreground, marginTop: 8 }}>{item.content}</Text>
              <View style={styles.postStats}>
                <Text style={{ color: colors.mutedForeground }}>{item.likesCount} Likes</Text>
                <Text style={{ color: colors.mutedForeground }}>{item.commentsCount} Comments</Text>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    letterSpacing: -0.5,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  postCard: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  postStats: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
  }
});
