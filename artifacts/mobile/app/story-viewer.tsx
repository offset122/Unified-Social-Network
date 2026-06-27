import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions, Image, ActivityIndicator,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchStories, resolveMediaUrl } from "@/lib/db";
import { supabase } from "@/lib/supabase";

const { width: W, height: H } = Dimensions.get("window");
const STORY_DURATION = 5000;

export default function StoryViewerScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ storyGroupIndex?: string }>();
  const groupIndex = parseInt(params.storyGroupIndex ?? "0", 10);

  const { data: allStories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: () => fetchStories(user?.id ?? ""),
    enabled: !!user?.id,
  });

  // Group by author
  const grouped = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const s of allStories as any[]) {
      if (!map.has(s.author_id)) map.set(s.author_id, { user: s.profiles, stories: [] });
      map.get(s.author_id).stories.push(s);
    }
    return Array.from(map.values());
  }, [allStories]);

  const group = grouped[groupIndex];
  const [storyIdx, setStoryIdx] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  const currentStory = group?.stories[storyIdx];

  useEffect(() => {
    if (!currentStory) return;
    progress.setValue(0);
    anim.current = Animated.timing(progress, { toValue: 1, duration: STORY_DURATION, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      if (finished) goNext();
    });
    // Mark as viewed
    if (user?.id) supabase.from("story_views").upsert({ story_id: currentStory.id, viewer_id: user.id }).then(() => {});
    return () => { anim.current?.stop(); };
  }, [storyIdx, currentStory?.id]);

  const goNext = () => {
    if (!group) return;
    if (storyIdx < group.stories.length - 1) setStoryIdx(i => i + 1);
    else if (groupIndex < grouped.length - 1) router.replace({ pathname: "/story-viewer", params: { storyGroupIndex: String(groupIndex + 1) } } as any);
    else router.back();
  };

  const goPrev = () => {
    if (storyIdx > 0) { setStoryIdx(i => i - 1); }
    else if (groupIndex > 0) router.replace({ pathname: "/story-viewer", params: { storyGroupIndex: String(groupIndex - 1) } } as any);
  };

  if (!group || !currentStory) return (
    <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator color="#fff" />
    </View>
  );

  const isVideo = currentStory.media_type === "video";
  const mediaUri = resolveMediaUrl(currentStory.media_url);
  const authorName = group.user?.display_name ?? "User";

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ headerShown: false }} />
      {isVideo ? (
        <Video source={{ uri: mediaUri }} style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER} shouldPlay isLooping={false} isMuted={false} />
      ) : (
        <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent"]} style={[styles.topGrad, { paddingTop: insets.top + 8 }]}>
        {/* Progress bars */}
        <View style={styles.progressRow}>
          {group.stories.map((_: any, i: number) => (
            <View key={i} style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, {
                width: i < storyIdx ? "100%" : i === storyIdx
                  ? progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })
                  : "0%",
              }]} />
            </View>
          ))}
        </View>
        {/* Header */}
        <View style={styles.storyHeader}>
          <View style={{ width: 36, height: 36, borderRadius: 18, overflow: "hidden", borderWidth: 2, borderColor: "#fff" }}>
            {group.user?.avatar_url ? (
              <Image source={{ uri: resolveMediaUrl(group.user.avatar_url) }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{authorName[0]}</Text>
              </LinearGradient>
            )}
          </View>
          <Text style={styles.storyAuthor}>{authorName}</Text>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>
      {/* Tap zones */}
      <View style={[styles.tapZones, { pointerEvents: "box-none" } as any]}>
        <Pressable style={styles.tapLeft} onPress={goPrev} />
        <Pressable style={styles.tapRight} onPress={goNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topGrad: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: 16, zIndex: 10 },
  progressRow: { flexDirection: "row", gap: 4, marginBottom: 10 },
  progressTrack: { flex: 1, height: 2.5, backgroundColor: "rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  storyHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  storyAuthor: { color: "#fff", fontWeight: "700", fontSize: 14, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: "row", zIndex: 5 },
  tapLeft: { flex: 1 },
  tapRight: { flex: 1 },
});
