import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useGetReels, useLikePost, useUnlikePost, getGetReelsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const REEL_HEIGHT = Platform.OS === "web" ? 520 : SCREEN_HEIGHT - 100;

type ReelPost = {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaType: string | null;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  createdAt: string;
};

function ReelCard({ item, colors }: { item: ReelPost; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const qc = useQueryClient();
  const likePost = useLikePost();
  const unlikePost = useUnlikePost();

  const handleLike = () => {
    if (item.isLiked) {
      unlikePost.mutate({ postId: item.id }, {
        onSuccess: () => qc.invalidateQueries({ queryKey: getGetReelsQueryKey() }),
      });
    } else {
      likePost.mutate({ postId: item.id }, {
        onSuccess: () => qc.invalidateQueries({ queryKey: getGetReelsQueryKey() }),
      });
    }
  };

  return (
    <View style={[styles.reelCard, { width: SCREEN_WIDTH, height: REEL_HEIGHT }]}>
      <View style={styles.reelBg}>
        <LinearGradient
          colors={["#1a0533", "#2d1b69", "#0f0a1e"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.playIconWrap}>
          <Feather name="play-circle" size={64} color="rgba(255,255,255,0.35)" />
          <Text style={styles.videoLabel}>Video Reel</Text>
        </View>
      </View>

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={styles.overlay}
      >
        <View style={styles.authorRow}>
          <View style={styles.authorAvatar}>
            <Text style={styles.authorInitials}>
              {item.author.displayName.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.authorName}>{item.author.displayName}</Text>
            <Text style={styles.authorUsername}>@{item.author.username}</Text>
          </View>
        </View>
        {item.content ? (
          <Text style={styles.caption} numberOfLines={3}>{item.content}</Text>
        ) : null}
        <View style={styles.hashtagRow}>
          {item.content.split(/\s+/).filter((w) => w.startsWith("#")).slice(0, 4).map((tag, i) => (
            <Text key={i} style={styles.hashtag}>{tag}</Text>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.actions}>
        <Pressable onPress={handleLike} style={styles.actionBtn}>
          <Feather name="heart" size={28} color={item.isLiked ? "#ef4444" : "#fff"} />
          <Text style={styles.actionCount}>{item.likesCount}</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={() => router.push(`/post/${item.id}`)}
        >
          <Feather name="message-circle" size={28} color="#fff" />
          <Text style={styles.actionCount}>{item.commentsCount}</Text>
        </Pressable>
        <Pressable style={styles.actionBtn}>
          <Feather name="share-2" size={26} color="#fff" />
          <Text style={styles.actionCount}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ReelsScreen() {
  const { isAuthenticated } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data, isLoading, refetch } = useGetReels();
  const reels = (data?.items ?? []) as ReelPost[];

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 0 : 0 }]}>
      <View style={[styles.header, { paddingTop: isWeb ? 16 : insets.top + 4 }]}>
        <Text style={styles.headerTitle}>Reels</Text>
        <Pressable onPress={() => router.push("/create")} style={styles.createBtn}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7c3aed" size="large" />
        </View>
      ) : reels.length === 0 ? (
        <View style={styles.emptyWrap}>
          <LinearGradient colors={["#1a0533", "#0f0a1e"]} style={StyleSheet.absoluteFill} />
          <Feather name="film" size={56} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>No Reels Yet</Text>
          <Text style={styles.emptyDesc}>Be the first to share a reel!</Text>
          <Pressable
            onPress={() => router.push("/create")}
            style={styles.createFirstBtn}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.createFirstText}>Create Reel</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ReelCard item={item} colors={colors} />}
          snapToInterval={REEL_HEIGHT}
          decelerationRate="fast"
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          pagingEnabled={Platform.OS !== "web"}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0a1e" },
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 8,
  },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  createBtn: { backgroundColor: "#7c3aed", borderRadius: 20, padding: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  reelCard: { position: "relative", overflow: "hidden" },
  reelBg: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  playIconWrap: { alignItems: "center", gap: 8 },
  videoLabel: { color: "rgba(255,255,255,0.4)", fontSize: 13 },
  overlay: {
    position: "absolute", bottom: 0, left: 0, right: 80,
    paddingHorizontal: 16, paddingBottom: 32, paddingTop: 60,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  authorAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#7c3aed",
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff",
  },
  authorInitials: { color: "#fff", fontWeight: "700", fontSize: 14 },
  authorName: { color: "#fff", fontWeight: "700", fontSize: 15 },
  authorUsername: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  caption: { color: "#fff", fontSize: 14, lineHeight: 20, marginBottom: 8 },
  hashtagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hashtag: { color: "#a78bfa", fontSize: 13, fontWeight: "600" },
  actions: {
    position: "absolute", right: 12, bottom: 40,
    alignItems: "center", gap: 20,
  },
  actionBtn: { alignItems: "center", gap: 4 },
  actionCount: { color: "#fff", fontSize: 12, fontWeight: "600" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 12 },
  emptyDesc: { color: "rgba(255,255,255,0.5)", fontSize: 15, textAlign: "center" },
  createFirstBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7c3aed", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  createFirstText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
