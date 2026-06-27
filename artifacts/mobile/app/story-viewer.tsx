import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions, Image, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
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

const STORY_DURATION = 5000;

export default function StoryViewerScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ storyGroupIndex?: string }>();
  const groupIndex = parseInt(params.storyGroupIndex ?? "0", 10);
  const [replyText, setReplyText] = useState("");
  const [replySent, setReplySent] = useState(false);

  const { data: allStories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: () => fetchStories(user?.id ?? ""),
    enabled: !!user?.id,
  });

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
    anim.current.start(({ finished }) => { if (finished) goNext(); });
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
    if (storyIdx > 0) setStoryIdx(i => i - 1);
    else if (groupIndex > 0) router.replace({ pathname: "/story-viewer", params: { storyGroupIndex: String(groupIndex - 1) } } as any);
  };

  const handleReplySubmit = async () => {
    if (!replyText.trim() || !user?.id || !currentStory) return;
    try {
      const { data: existingConvos } = await supabase
        .from("conversation_members").select("conversation_id").eq("user_id", user.id);
      const myIds = (existingConvos ?? []).map((r: any) => r.conversation_id as string);
      let convoId: string | null = null;
      if (myIds.length) {
        const { data: shared } = await supabase
          .from("conversation_members").select("conversation_id")
          .eq("user_id", currentStory.author_id).in("conversation_id", myIds);
        if (shared?.length) {
          const { data: dm } = await supabase.from("conversations").select("id")
            .eq("type", "dm").in("id", shared.map((r: any) => r.conversation_id))
            .limit(1).maybeSingle();
          convoId = (dm as any)?.id ?? null;
        }
      }
      if (!convoId) {
        const { data: newConvo } = await supabase.from("conversations")
          .insert({ type: "dm", created_by: user.id }).select("id").single();
        convoId = (newConvo as any)?.id;
        if (convoId) {
          await supabase.from("conversation_members").insert([
            { conversation_id: convoId, user_id: user.id },
            { conversation_id: convoId, user_id: currentStory.author_id },
          ]);
        }
      }
      if (convoId) {
        await supabase.from("messages").insert({
          conversation_id: convoId, sender_id: user.id,
          content: `Replied to your story: ${replyText.trim()}`,
          is_deleted: false,
        });
      }
      setReplyText("");
      setReplySent(true);
      setTimeout(() => setReplySent(false), 2000);
    } catch {}
  };

  if (!group || !currentStory) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

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

      <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent"]}
        style={[styles.topGrad, { paddingTop: insets.top + 8 }]}>
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

      {/* Reply bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.replyBar, { paddingBottom: insets.bottom + 10 }]}
      >
        {replySent ? (
          <View style={styles.replySentRow}>
            <Feather name="check-circle" size={16} color="#22c55e" />
            <Text style={styles.replySentText}>Reply sent!</Text>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.replyInput}
              placeholder={`Reply to ${group.user?.display_name ?? "story"}…`}
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={replyText}
              onChangeText={setReplyText}
              onFocus={() => { anim.current?.stop(); }}
              onBlur={() => {
                if (!replyText.trim()) {
                  anim.current?.start(({ finished }) => { if (finished) goNext(); });
                }
              }}
              returnKeyType="send"
              onSubmitEditing={handleReplySubmit}
            />
            <Pressable
              onPress={handleReplySubmit}
              disabled={!replyText.trim()}
              style={[styles.replySendBtn, { opacity: replyText.trim() ? 1 : 0.4 }]}
            >
              <Feather name="send" size={18} color="#fff" />
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
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
  replyBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  replyInput: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 11,
    color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  replySendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(124,58,237,0.8)",
    alignItems: "center", justifyContent: "center",
  },
  replySentRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  replySentText: { color: "#22c55e", fontSize: 14, fontWeight: "700" },
});
