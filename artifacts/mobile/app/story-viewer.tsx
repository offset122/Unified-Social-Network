import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated,
  Dimensions, ActivityIndicator, Image,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetStories, getGetStoriesQueryKey, useViewStory } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";

const { width: SCREEN_W } = Dimensions.get("window");
const STORY_DURATION = 5000;

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (path.startsWith("/objects/")) return `https://${domain}/api/storage${path}`;
  return `https://${domain}${path}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const viewStory = useViewStory();

  const { data: storyGroups, isLoading } = useGetStories({
    query: { queryKey: getGetStoriesQueryKey() },
  });

  const group = storyGroups?.find((g) => g.user.id === userId);
  const stories = group?.stories ?? [];

  const [currentIdx, setCurrentIdx] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [paused, setPaused] = useState(false);
  const current = stories[currentIdx];

  const goNext = () => {
    if (currentIdx < stories.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      router.back();
    }
  };

  const goPrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx((i) => i - 1);
    }
  };

  useEffect(() => {
    if (!current || paused) return;
    progress.setValue(0);
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goNext();
    });
    viewStory.mutate({ storyId: current.id });
    return () => animRef.current?.stop();
  }, [currentIdx, current?.id]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!group || stories.length === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: "#fff" }}>No stories found.</Text>
      </View>
    );
  }

  const mediaUrl = current ? resolveMediaUrl(current.mediaUrl) : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {mediaUrl ? (
        <Image
          source={{ uri: mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
      )}

      <View style={[StyleSheet.absoluteFill, styles.overlay]} />

      {/* Progress bars */}
      <View style={[styles.progressRow, { top: insets.top + 8 }]}>
        {stories.map((_, idx) => (
          <View key={idx} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width:
                    idx < currentIdx ? "100%" :
                    idx === currentIdx
                      ? progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })
                      : "0%",
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={[styles.header, { top: insets.top + 24 }]}>
        <Avatar name={group.user.displayName} avatarUrl={group.user.avatarUrl} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.authorName}>{group.user.displayName}</Text>
          {current && <Text style={styles.timeText}>{timeAgo(current.createdAt)}</Text>}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Tap zones */}
      <Pressable
        style={styles.leftHalf}
        onPress={goPrev}
        onLongPress={() => { setPaused(true); animRef.current?.stop(); }}
        onPressOut={() => { if (paused) setPaused(false); }}
      />
      <Pressable
        style={styles.rightHalf}
        onPress={goNext}
        onLongPress={() => { setPaused(true); animRef.current?.stop(); }}
        onPressOut={() => { if (paused) setPaused(false); }}
      />

      {paused && (
        <View style={styles.pausedBadge}>
          <Feather name="pause" size={20} color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  overlay: { backgroundColor: "rgba(0,0,0,0.12)" },
  progressRow: {
    position: "absolute", left: 12, right: 12,
    flexDirection: "row", gap: 4, zIndex: 10,
  },
  progressTrack: {
    flex: 1, height: 2.5,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 2, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff" },
  header: {
    position: "absolute", left: 16, right: 16,
    flexDirection: "row", alignItems: "center", zIndex: 10,
  },
  authorName: { color: "#fff", fontWeight: "700", fontSize: 14 },
  timeText: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  leftHalf: { position: "absolute", left: 0, top: 0, bottom: 0, width: "40%", zIndex: 5 },
  rightHalf: { position: "absolute", right: 0, top: 0, bottom: 0, width: "60%", zIndex: 5 },
  pausedBadge: {
    position: "absolute", alignSelf: "center", top: "45%",
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 40, padding: 16, zIndex: 20,
  },
});
