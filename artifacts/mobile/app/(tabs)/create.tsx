import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  Platform, ScrollView, Alert, Image, Switch,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import GuestScreen from "@/components/GuestScreen";
import { useColors } from "@/hooks/useColors";
import { uploadMedia, generateAICaption } from "@/lib/db";
import { supabase as sb } from "@/lib/supabase";
import AIHashtagSuggestions from "@/components/ai/AIHashtagSuggestions";
import AICaptionEnhancer from "@/components/ai/AICaptionEnhancer";
import AIPostIdeas from "@/components/ai/AIPostIdeas";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
type PostMode = "post" | "reel";

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <LinearGradient colors={["#7c3aed", "#4f46e5"]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </LinearGradient>
  );
}

export default function CreateScreen() {
  const { user, isAuthenticated, isGuest } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const isWeb = Platform.OS === "web";

  const [mode, setMode] = useState<PostMode>("post");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [posting, setPosting] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");
  const [trendingTags] = useState<string[]>([]);

  if (isGuest) return <GuestScreen icon="plus-circle" title="Create & Share" subtitle="Sign up to share posts, reels, and stories with your followers." perks={["Post photos and videos", "Create short reels", "Control who sees your content", "AI-powered captions"]} />;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const pickMedia = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission required", "Allow media access to upload."); return; }

    const isReel = mode === "reel";
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isReel ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: !isReel,
      quality: 0.85,
      videoMaxDuration: isReel ? 60 : 30,
    });

    if (!result.canceled) {
      const assets = result.assets;
      for (const a of assets) {
        if (a.type === "video" && a.fileSize && a.fileSize > MAX_VIDEO_SIZE) {
          Alert.alert("File too large", `Videos must be under 100MB. Your file is ${(a.fileSize / 1024 / 1024).toFixed(1)}MB`);
          return;
        }
      }
      setMedia(isReel ? [assets[0]] : assets.slice(0, 4));
    }
  }, [mode]);

  const openCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission required", "Allow camera access to take a photo."); return; }
    const isReel = mode === "reel";
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: isReel ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      videoMaxDuration: isReel ? 60 : 30,
    });
    if (!result.canceled) setMedia([result.assets[0]]);
  }, [mode]);

  const handleAICaption = async () => {
    setGeneratingCaption(true);
    try {
      const context = mode === "reel" ? "a short video reel for social media" : content || "a photo post for social media";
      const caption = await generateAICaption(context);
      if (caption) setContent(prev => prev ? `${prev}\n${caption}` : caption);
    } catch {}
    finally { setGeneratingCaption(false); }
  };

  const handlePost = async () => {
    if (!content.trim() && media.length === 0) {
      Alert.alert("Empty post", "Add some text or media to share.");
      return;
    }
    if (!user?.id) return;
    setPosting(true);

    try {
      const mediaUrls: string[] = [];
      let mediaType: "image" | "video" | null = null;
      let mediaWidth: number | null = null;
      let mediaHeight: number | null = null;

      for (const asset of media) {
        const ext = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
        const mime = asset.type === "video" ? `video/${ext}` : `image/${ext}`;
        const url = await uploadMedia(asset.uri, `${Date.now()}.${ext}`, mime);
        mediaUrls.push(url);
        if (asset.type === "video") { mediaType = "video"; mediaWidth = asset.width ?? null; mediaHeight = asset.height ?? null; }
        else if (!mediaType) { mediaType = "image"; mediaWidth = asset.width ?? null; mediaHeight = asset.height ?? null; }
      }

      const { error } = await sb.from("posts").insert({
        author_id: user.id,
        content: content.trim(),
        media_urls: mediaUrls,
        media_type: mediaType,
        media_width: mediaWidth,
        media_height: mediaHeight,
        is_reel: mode === "reel",
        visibility,
      });

      if (error) throw new Error(error.message);

      // Increment posts count
      await sb.rpc("increment_posts_count" as any, { user_id: user.id });

      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["reels"] });
      qc.invalidateQueries({ queryKey: ["my-posts"] });

      setContent("");
      setMedia([]);
      Alert.alert("Posted!", `Your ${mode} is now live.`, [
        { text: "OK", onPress: () => router.replace(mode === "reel" ? "/(tabs)/reels" as any : "/(tabs)" as any) }
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to post. Try again.");
    } finally {
      setPosting(false);
    }
  };

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";
  const charLimit = mode === "reel" ? 150 : 500;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {mode === "reel" ? "New Reel" : "New Post"}
        </Text>
        <Pressable onPress={handlePost} disabled={posting || (!content.trim() && media.length === 0)}
          style={[styles.postBtn, { backgroundColor: (content.trim() || media.length > 0) && !posting ? colors.primary : colors.muted }]}>
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postBtnText}>Share</Text>}
        </Pressable>
      </View>

      {/* Mode tabs */}
      <View style={[styles.modeTabs, { borderBottomColor: colors.border }]}>
        {(["post", "reel"] as PostMode[]).map(m => (
          <Pressable key={m} onPress={() => { setMode(m); setMedia([]); }}
            style={[styles.modeTab, { borderBottomColor: m === mode ? colors.primary : "transparent" }]}>
            <Feather name={m === "post" ? "image" : "film"} size={16} color={m === mode ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.modeTabText, { color: m === mode ? colors.primary : colors.mutedForeground }, m === mode && { fontWeight: "700" }]}>
              {m === "post" ? "Post" : "Reel"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Composer */}
        <View style={styles.composer}>
          <Avatar name={displayName} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.composerName, { color: colors.foreground }]}>{displayName}</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground }]}
              placeholder={mode === "reel" ? "Describe your reel (optional)..." : "What's on your mind?"}
              placeholderTextColor={colors.mutedForeground}
              value={content} onChangeText={setContent}
              multiline maxLength={charLimit}
              autoFocus
            />
          </View>
        </View>

        {/* Char counter */}
        <View style={{ paddingHorizontal: 16, alignItems: "flex-end" }}>
          <Text style={{ color: content.length > charLimit * 0.9 ? "#ef4444" : colors.mutedForeground, fontSize: 12 }}>
            {content.length}/{charLimit}
          </Text>
        </View>

        {/* Media preview */}
        {media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
            {media.map((a, i) => (
              <View key={i} style={styles.mediaThumb}>
                <Image source={{ uri: a.uri }} style={styles.mediaThumbnailImg} resizeMode="cover" />
                {a.type === "video" && (
                  <View style={styles.videoOverlay}>
                    <Feather name="play" size={20} color="#fff" />
                    {a.fileSize && <Text style={{ color: "#fff", fontSize: 10, marginTop: 2 }}>{(a.fileSize / 1024 / 1024).toFixed(1)}MB</Text>}
                  </View>
                )}
                <Pressable onPress={() => setMedia(prev => prev.filter((_, j) => j !== i))}
                  style={styles.removeMedia}>
                  <Feather name="x" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Toolbar */}
        <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
          <Pressable onPress={openCamera} style={styles.toolBtn}>
            <Feather name="camera" size={22} color={colors.primary} />
            <Text style={[styles.toolBtnText, { color: colors.primary }]}>Camera</Text>
          </Pressable>
          <Pressable onPress={pickMedia} style={styles.toolBtn}>
            <Feather name={mode === "reel" ? "video" : "image"} size={22} color={colors.primary} />
            <Text style={[styles.toolBtnText, { color: colors.primary }]}>
              {mode === "reel" ? "Video (up to 100MB)" : "Gallery"}
            </Text>
          </Pressable>
          <Pressable onPress={handleAICaption} disabled={generatingCaption} style={styles.toolBtn}>
            {generatingCaption ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Feather name="zap" size={22} color={colors.primary} />
            )}
            <Text style={[styles.toolBtnText, { color: colors.primary }]}>AI Caption</Text>
          </Pressable>
          <AIHashtagSuggestions
            content={content}
            onApply={tag => setContent(prev => prev ? `${prev} ${tag}` : tag)}
          />
          <AICaptionEnhancer
            caption={content}
            onApply={setContent}
          />
        </View>

        {content === "" && media.length === 0 && (
          <AIPostIdeas trendingTags={trendingTags} onApply={setContent} />
        )}

        {/* Visibility */}
        <View style={[styles.visibilityRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          <Feather name="globe" size={16} color={colors.mutedForeground} />
          <Text style={[styles.visibilityLabel, { color: colors.foreground }]}>Visibility</Text>
          {(["public", "followers", "private"] as const).map(v => (
            <Pressable key={v} onPress={() => setVisibility(v)}
              style={[styles.visChip, { backgroundColor: visibility === v ? colors.primary : colors.secondary, borderColor: colors.border }]}>
              <Text style={{ color: visibility === v ? "#fff" : colors.foreground, fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>{v}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  modeTabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  modeTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2 },
  modeTabText: { fontSize: 14 },
  composer: { flexDirection: "row", gap: 12, padding: 16, alignItems: "flex-start" },
  composerName: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  textInput: { fontSize: 16, lineHeight: 24, minHeight: 80 },
  mediaRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  mediaThumb: { width: 110, height: 110, borderRadius: 12, overflow: "hidden", position: "relative" },
  mediaThumbnailImg: { width: "100%", height: "100%" },
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  removeMedia: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  toolbar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, gap: 20 },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolBtnText: { fontSize: 13, fontWeight: "600" },
  visibilityRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  visibilityLabel: { fontSize: 14, fontWeight: "600", flex: 1 },
  visChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
});
