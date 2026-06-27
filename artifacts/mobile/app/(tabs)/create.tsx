import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  Platform, ScrollView, Alert, Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import {
  uploadMedia, generateAICaption, enhanceAICaption,
  generatePostIdea, generateAIHashtags,
} from "@/lib/db";
import { supabase as sb } from "@/lib/supabase";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
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

// ─── AI Toolbar ───────────────────────────────────────────────────────────────

function AIToolbar({ content, mode, onContent }: {
  content: string;
  mode: PostMode;
  onContent: (v: string) => void;
}) {
  const colors = useColors();
  const [active, setActive] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);

  const run = async (action: string) => {
    setActive(action);
    setHashtags([]);
    try {
      if (action === "caption") {
        const ctx = mode === "reel" ? "a short video reel for social media" : content || "a lifestyle photo post";
        const cap = await generateAICaption(ctx);
        if (cap) onContent(cap);
      } else if (action === "enhance") {
        if (!content.trim()) return Alert.alert("Add a caption first", "Write something to enhance.");
        const enhanced = await enhanceAICaption(content);
        if (enhanced) onContent(enhanced);
      } else if (action === "idea") {
        const idea = await generatePostIdea([]);
        if (idea) onContent(idea);
      } else if (action === "hashtags") {
        if (!content.trim()) return Alert.alert("Add content first", "Write a caption to generate relevant hashtags.");
        const tags = await generateAIHashtags(content);
        setHashtags(tags);
      }
    } finally {
      setActive(null);
    }
  };

  const applyHashtag = (tag: string) => {
    onContent(prev => prev.trim() ? `${prev} ${tag}` : tag);
    setHashtags(prev => prev.filter(t => t !== tag));
  };

  const tools: { id: string; icon: string; label: string }[] = [
    { id: "caption", icon: "zap", label: "Caption" },
    { id: "enhance", icon: "trending-up", label: "Enhance" },
    { id: "idea", icon: "lightbulb", label: "Inspire" },
    { id: "hashtags", icon: "hash", label: "Tags" },
  ];

  return (
    <View>
      <View style={[S.aiBar, { borderTopColor: colors.border }]}>
        <View style={[S.aiLabel, { backgroundColor: colors.primary + "18" }]}>
          <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={S.aiGradDot}>
            <Feather name="zap" size={10} color="#fff" />
          </LinearGradient>
          <Text style={[S.aiLabelText, { color: colors.primary }]}>AI</Text>
        </View>
        {tools.map(tool => (
          <Pressable key={tool.id} onPress={() => run(tool.id)} disabled={!!active}
            style={[S.aiTool, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            {active === tool.id
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name={tool.icon as any} size={15} color={colors.primary} />}
            <Text style={[S.aiToolText, { color: colors.primary }]}>{tool.label}</Text>
          </Pressable>
        ))}
      </View>

      {hashtags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[S.tagRow, { borderBottomColor: colors.border }]}>
          <Text style={[S.tagHint, { color: colors.mutedForeground }]}>Tap to add:</Text>
          {hashtags.map((tag, i) => (
            <Pressable key={i} onPress={() => applyHashtag(tag)}
              style={[S.tagChip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
              <Text style={[S.tagChipText, { color: colors.primary }]}>{tag}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setHashtags([])} hitSlop={8} style={{ paddingHorizontal: 4 }}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Create Screen ─────────────────────────────────────────────────────────────

export default function CreateScreen() {
  const { user, isAuthenticated } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const isWeb = Platform.OS === "web";

  const [mode, setMode] = useState<PostMode>("post");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [posting, setPosting] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");

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
      await sb.rpc("increment_posts_count" as any, { user_id: user.id });

      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["reels"] });
      qc.invalidateQueries({ queryKey: ["my-posts"] });

      setContent("");
      setMedia([]);
      Alert.alert("Posted! 🎉", `Your ${mode} is now live.`, [
        { text: "OK", onPress: () => router.replace(mode === "reel" ? "/(tabs)/reels" : "/(tabs)/") }
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to post. Try again.");
    } finally {
      setPosting(false);
    }
  };

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";
  const charLimit = mode === "reel" ? 150 : 500;
  const canPost = (content.trim().length > 0 || media.length > 0) && !posting;

  return (
    <View style={[S.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      {/* Header */}
      <View style={[S.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[S.headerTitle, { color: colors.foreground }]}>
          {mode === "reel" ? "New Reel" : "New Post"}
        </Text>
        <Pressable onPress={handlePost} disabled={!canPost}
          style={[S.postBtn, { backgroundColor: canPost ? colors.primary : colors.muted }]}>
          {posting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={S.postBtnText}>Share</Text>}
        </Pressable>
      </View>

      {/* Mode tabs */}
      <View style={[S.modeTabs, { borderBottomColor: colors.border }]}>
        {(["post", "reel"] as PostMode[]).map(m => (
          <Pressable key={m} onPress={() => { setMode(m); setMedia([]); }}
            style={[S.modeTab, { borderBottomColor: m === mode ? colors.primary : "transparent" }]}>
            <Feather name={m === "post" ? "image" : "film"} size={16}
              color={m === mode ? colors.primary : colors.mutedForeground} />
            <Text style={[S.modeTabText, { color: m === mode ? colors.primary : colors.mutedForeground },
              m === mode && { fontWeight: "700" }]}>
              {m === "post" ? "Post" : "Reel"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>

        {/* Composer */}
        <View style={S.composer}>
          <Avatar name={displayName} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={[S.composerName, { color: colors.foreground }]}>{displayName}</Text>
            <TextInput
              style={[S.textInput, { color: colors.foreground }]}
              placeholder={mode === "reel" ? "Describe your reel…" : "What's on your mind?"}
              placeholderTextColor={colors.mutedForeground}
              value={content} onChangeText={setContent}
              multiline maxLength={charLimit} autoFocus
            />
          </View>
        </View>

        {/* Char counter */}
        <View style={{ paddingHorizontal: 16, alignItems: "flex-end", marginTop: -4 }}>
          <Text style={{ color: content.length > charLimit * 0.85 ? "#ef4444" : colors.mutedForeground, fontSize: 11 }}>
            {content.length}/{charLimit}
          </Text>
        </View>

        {/* Media preview */}
        {media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.mediaRow}>
            {media.map((a, i) => (
              <View key={i} style={S.mediaThumb}>
                <Image source={{ uri: a.uri }} style={S.mediaThumbnailImg} resizeMode="cover" />
                {a.type === "video" && (
                  <View style={S.videoOverlay}>
                    <Feather name="play" size={20} color="#fff" />
                    {a.fileSize && (
                      <Text style={{ color: "#fff", fontSize: 10, marginTop: 2 }}>
                        {(a.fileSize / 1024 / 1024).toFixed(1)}MB
                      </Text>
                    )}
                  </View>
                )}
                <Pressable onPress={() => setMedia(prev => prev.filter((_, j) => j !== i))}
                  style={S.removeMedia}>
                  <Feather name="x" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Media pick */}
        <Pressable onPress={pickMedia}
          style={[S.mediaPickBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name={mode === "reel" ? "video" : "image"} size={20} color={colors.primary} />
          <Text style={[S.mediaPickText, { color: colors.primary }]}>
            {mode === "reel" ? "Pick Video (up to 100MB)" : "Add Photos / Video"}
          </Text>
        </Pressable>

        {/* AI Toolbar */}
        <AIToolbar content={content} mode={mode} onContent={(v: any) => {
          if (typeof v === "function") setContent(v);
          else setContent(v);
        }} />

        {/* Visibility */}
        <View style={[S.visibilityRow, { borderTopColor: colors.border }]}>
          <Feather name="globe" size={15} color={colors.mutedForeground} />
          <Text style={[S.visibilityLabel, { color: colors.foreground }]}>Who can see this?</Text>
          <View style={S.visBtns}>
            {(["public", "followers", "private"] as const).map(v => (
              <Pressable key={v} onPress={() => setVisibility(v)}
                style={[S.visChip,
                  visibility === v
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[S.visChipText, { color: visibility === v ? "#fff" : colors.mutedForeground }]}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  postBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
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
  mediaPickBtn: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginVertical: 8, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  mediaPickText: { fontSize: 14, fontWeight: "600" },
  aiBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  aiLabel: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  aiGradDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  aiLabelText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  aiTool: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  aiToolText: { fontSize: 12, fontWeight: "600" },
  tagRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  tagHint: { fontSize: 12, marginRight: 2 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  tagChipText: { fontSize: 13, fontWeight: "700" },
  visibilityRow: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  visibilityLabel: { fontSize: 14, fontWeight: "600" },
  visBtns: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 },
  visChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  visChipText: { fontSize: 13, fontWeight: "600" },
});
