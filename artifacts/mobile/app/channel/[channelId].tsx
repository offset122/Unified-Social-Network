import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";
import {
  useGetChannel,
  getGetChannelQueryKey,
  useGetChannelPosts,
  getGetChannelPostsQueryKey,
} from "@workspace/api-client-react";

export default function ChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const colors = useColors();

  const { data: channel, isLoading: isChannelLoading } = useGetChannel(
    channelId as string,
    { query: { enabled: !!channelId, queryKey: getGetChannelQueryKey(channelId as string) } },
  );
  const { data: postsPage } = useGetChannelPosts(
    channelId as string,
    undefined,
    { query: { enabled: !!channelId, queryKey: getGetChannelPostsQueryKey(channelId as string) } },
  );

  if (isChannelLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!channel) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Channel not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: channel.name }} />
      <FlatList
        data={postsPage?.items ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            {channel.description ? (
              <Text style={[styles.description, { color: colors.foreground }]}>{channel.description}</Text>
            ) : null}
            <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>
              {channel.subscribersCount} Subscribers
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.postCard, { borderBottomColor: colors.border }]}>
            <Text style={{ color: colors.foreground }}>{item.content}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  description: { fontSize: 16 },
  postCard: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
});
