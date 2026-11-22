import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { ActionSheet } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { haptics } from "@/lib/motion";
import { inferExtension, normalizeMimeType } from "@/lib/mediaUtils";
import { RADIUS } from "@/constants/colors";
import {
  uploadMedia,
  generateAICaption,
  enhanceAICaption,
  generatePostIdea,
  generateAIHashtags,
  generateAIAltText,
} from "@/lib/db";
import { supabase as sb } from "@/lib/supabase";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
type PostMode = "post" | "reel";

function AIToolbar({
  content,
  mode,
  onContent,
  media,
}: {
  content: string;
  mode: PostMode;
  onContent: (v: string | ((prev: string) => string)) => void;
  media?: ImagePicker.ImagePickerAsset[];
}) {
  const colors = useColors();
  const { showToast } = useToast();
  const [active, setActive] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [altText, setAltText] = useState("");

  const run = async (action: string) => {
    setActive(action);
    setHashtags([]);
    setAltText("");
    haptics.selection();
    try {
      if (action === "caption") {
        const ctx =
          mode === "reel"
            ? "a short video reel for social media"
            : content || "a lifestyle photo post";
        const cap = await generateAICaption(ctx);
        if (cap) onContent(cap);
      } else if (action === "enhance") {
        if (!content.trim()) {
          showToast("Write a caption first to enhance it.", "info");
          return;
        }
        const enhanced = await enhanceAICaption(content);
        if (enhanced) onContent(enhanced);
      } else if (action === "idea") {
        const idea = await generatePostIdea([]);
        if (idea) onContent(idea);
      } else if (action === "hashtags") {
        if (!content.trim()) {
          showToast("Write a caption to generate relevant hashtags.", "info");
          return;
        }
        const tags = await generateAIHashtags(content);
        setHashtags(tags);
      } else if (action === "alttext") {
        if (!media?.length) {
          showToast("Attach a photo or video to generate alt-text.", "info");
          return;
        }
        const result = await generateAIAltText(media[0].uri, content);
        if (result) setAltText(result);
      }
    } catch {
      showToast("AI assistant unavailable right now.", "error");
    } finally {
      setActive(null);
    }
  };

  const tools: { id: string; icon: keyof typeof Feather.glyphMap; label: string }[] = [
    { id: "caption", icon: "zap", label: "Caption" },
    { id: "enhance", icon: "trending-up", label: "Polish" },
    { id: "idea", icon: "sun", label: "Idea" },
    { id: "hashtags", icon: "hash", label: "Tags" },
    { id: "alttext", icon: "eye", label: "Alt Text" },
  ];

  return (
    <View style={[S.aiSection, { borderTopColor: colors.separator }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.aiBar}>
        {tools.map((tool) => (
          <Pressable
            key={tool.id}
            onPress={() => run(tool.id)}
            disabled={!!active}
            style={[
              S.aiTool,
              { backgroundColor: colors.bgElevated, borderColor: colors.separator },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`AI ${tool.label}`}
          >
            {active === tool.id ? (
              <ActivityIndicator size="small" color={colors.accentPrimary} />
            ) : (
              <Feather name={tool.icon} size={14} color={colors.accentPrimary} />
            )}
            <Text style={[S.aiToolText, { color: colors.textPrimary }]}>{tool.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {hashtags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[S.tagRow, { borderTopColor: colors.separator }]}
        >
          {hashtags.map((tag, i) => (
            <Pressable
              key={i}
              onPress={() => {
                haptics.selection();
                onContent((prev: string) => (prev.trim() ? `${prev} ${tag}` : tag));
                setHashtags((prev) => prev.filter((t) => t !== tag));
              }}
              style={[
                S.tagChip,
                { backgroundColor: colors.accentTint, borderColor: colors.separator },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Insert ${tag}`}
            >
              <Text style={[S.tagChipText, { color: colors.accentPrimary }]}>{tag}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setHashtags([])}
            style={S.hitTarget}
            accessibilityRole="button"
            accessibilityLabel="Dismiss tag suggestions"
          >
            <Feather name="x" size={14} color={colors.textSecondary} />
          </Pressable>
        </ScrollView>
      )}

      {!!altText && (
        <View style={[S.altBox, { backgroundColor: colors.bgElevated, borderColor: colors.separator }]}>
          <Text style={[S.altLabel, { color: colors.accentPrimary }]}>Suggested Alt Text</Text>
          <Text style={[S.altBody, { color: colors.textPrimary }]}>{altText}</Text>
        </View>
      )}
    </View>
  );
}

export default function CreateScreen() {
  const { user, isAuthenticated } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const maxWidth = isWeb && width >= 768 ? 640 : undefined;

  const [mode, setMode] = useState<PostMode>("post");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [posting, setPosting] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");
  const [mediaSheetOpen, setMediaSheetOpen] = useState(false);
  const [visSheetOpen, setVisSheetOpen] = useState(false);

  const launchLibrary = useCallback(async () => {
    const isReel = mode === "reel";
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast("Allow photo library access to attach media.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isReel
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: !isReel,
      quality: 0.85,
      videoMaxDuration: isReel ? 60 : 30,
    });
    if (!result.canceled) {
      for (const a of result.assets) {
        if (a.type === "video" && a.fileSize && a.fileSize > MAX_VIDEO_SIZE) {
          showToast(
            `Videos must be under 100MB (${(a.fileSize / 1024 / 1024).toFixed(1)}MB).`,
            "error",
          );
          return;
        }
      }
      setMedia(isReel ? [result.assets[0]] : result.assets.slice(0, 4));
    }
  }, [mode, showToast]);

  const launchCamera = useCallback(async () => {
    const isReel = mode === "reel";
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast("Allow camera access to take photos.", "error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: isReel
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      videoMaxDuration: isReel ? 60 : 30,
    });
    if (!result.canceled) setMedia([result.assets[0]]);
  }, [mode, showToast]);

  if (!isAuthenticated) return <Redirect href="/login" />;

  const handlePost = async () => {
    if (!content.trim() && media.length === 0) {
      showToast("Add text or media before sharing.", "info");
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
        const isVid = asset.type === "video";
        const ext = inferExtension(asset.uri, (asset as any).mimeType);
        const mime = normalizeMimeType(
          (asset as any).mimeType ?? ext,
          isVid ? "video" : "image",
        );
        const url = await uploadMedia(asset.uri, `${Date.now()}.${ext}`, mime);
        mediaUrls.push(url);
        if (isVid) {
          mediaType = "video";
          mediaWidth = asset.width ?? null;
          mediaHeight = asset.height ?? null;
        } else if (!mediaType) {
          mediaType = "image";
          mediaWidth = asset.width ?? null;
          mediaHeight = asset.height ?? null;
        }
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
      showToast(mode === "reel" ? "Reel published" : "Post published", "success");
      router.replace(mode === "reel" ? "/(tabs)/reels" : "/(tabs)");
    } catch (e: any) {
      showToast(e.message ?? "Failed to publish. Try again.", "error");
    } finally {
      setPosting(false);
    }
  };

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";
  const charLimit = mode === "reel" ? 150 : 500;
  const canPost = (content.trim().length > 0 || media.length > 0) && !posting;
  const visLabel =
    visibility === "public"
      ? "Public"
      : visibility === "followers"
      ? "Followers"
      : "Only Me";

  return (
    <View style={[S.container, { backgroundColor: colors.bgCanvas }]}>
      <GlassSurface
        style={[
          S.header,
          {
            paddingTop: isWeb ? 12 : Math.max(insets.top + 6, 12),
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={[S.headerInner, maxWidth ? { maxWidth } : null]}>
          <Pressable
            onPress={() => router.back()}
            style={S.hitTarget}
            accessibilityRole="button"
            accessibilityLabel="Cancel creation"
          >
            <Feather name="x" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[S.headerTitle, { color: colors.textPrimary }]}>
            {mode === "reel" ? "New Reel" : "New Post"}
          </Text>
          <Pressable
            onPress={handlePost}
            disabled={!canPost}
            style={[
              S.postBtn,
              {
                backgroundColor: canPost ? colors.accentPrimary : colors.muted,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Publish"
          >
            {posting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={S.postBtnText}>Publish</Text>
            )}
          </Pressable>
        </View>
      </GlassSurface>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          { paddingBottom: insets.bottom + 36, width: "100%", alignSelf: "center" },
          maxWidth ? { maxWidth } : null,
        ]}
      >
        {/* Mode & Audience bar */}
        <View style={[S.controlsRow, { borderBottomColor: colors.separator }]}>
          <View style={[S.modeTrack, { backgroundColor: colors.bgElevated }]} accessibilityRole="tablist">
            {(["post", "reel"] as PostMode[]).map((m) => {
              const active = m === mode;
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    haptics.selection();
                    setMode(m);
                    setMedia([]);
                  }}
                  style={[S.modeBtn, active && { backgroundColor: colors.bgCanvas }]}
                  accessibilityRole="tab"
                  accessibilityLabel={m === "post" ? "Standard Post" : "Vertical Reel"}
                  accessibilityState={{ selected: active }}
                >
                  <Feather
                    name={m === "post" ? "image" : "film"}
                    size={15}
                    color={active ? colors.textPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      S.modeText,
                      { color: active ? colors.textPrimary : colors.textSecondary },
                    ]}
                  >
                    {m === "post" ? "Post" : "Reel"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => {
              haptics.selection();
              setVisSheetOpen(true);
            }}
            style={[
              S.audienceBtn,
              { backgroundColor: colors.bgElevated, borderColor: colors.separator },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Audience: ${visLabel}`}
          >
            <Feather
              name={
                visibility === "public"
                  ? "globe"
                  : visibility === "followers"
                  ? "users"
                  : "lock"
              }
              size={14}
              color={colors.accentPrimary}
            />
            <Text style={[S.audienceText, { color: colors.textPrimary }]}>{visLabel}</Text>
            <Feather name="chevron-down" size={14} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Composer */}
        <View style={S.composer}>
          <Avatar name={displayName} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={[S.composerName, { color: colors.textPrimary }]}>{displayName}</Text>
            <TextInput
              style={[S.textInput, { color: colors.textPrimary }]}
              placeholder={mode === "reel" ? "Describe your reel…" : "What's on your mind?"}
              placeholderTextColor={colors.textTertiary}
              value={content}
              onChangeText={setContent}
              multiline
              maxLength={charLimit}
              autoFocus
              accessibilityLabel="Post caption"
            />
          </View>
        </View>

        <View style={S.counterRow}>
          <Text
            style={[
              S.counterText,
              {
                color:
                  content.length > charLimit * 0.85
                    ? colors.semanticDanger
                    : colors.textTertiary,
              },
            ]}
          >
            {content.length}/{charLimit}
          </Text>
        </View>

        {/* Media preview */}
        {media.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.mediaRow}
          >
            {media.map((a, i) => (
              <View key={i} style={[S.mediaThumb, { backgroundColor: colors.bgElevated }]}>
                <Image source={{ uri: a.uri }} style={S.mediaThumbnailImg} resizeMode="cover" />
                {a.type === "video" && (
                  <View style={S.videoOverlay}>
                    <Feather name="play" size={20} color="#FFFFFF" />
                    {a.fileSize && (
                      <Text style={{ color: "#FFFFFF", fontSize: 10.5, marginTop: 2 }}>
                        {(a.fileSize / 1024 / 1024).toFixed(1)} MB
                      </Text>
                    )}
                  </View>
                )}
                <Pressable
                  onPress={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                  style={S.removeMedia}
                  accessibilityRole="button"
                  accessibilityLabel="Remove attachment"
                >
                  <Feather name="x" size={13} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Attachment buttons */}
        <View style={S.dockRow}>
          <Pressable
            onPress={() => (isWeb ? launchLibrary() : setMediaSheetOpen(true))}
            style={[
              S.mediaPickBtn,
              { backgroundColor: colors.bgElevated, borderColor: colors.separator },
            ]}
            accessibilityRole="button"
            accessibilityLabel={mode === "reel" ? "Add video" : "Add photo or video"}
          >
            <Feather
              name={mode === "reel" ? "video" : "image"}
              size={18}
              color={colors.accentPrimary}
            />
            <Text style={[S.mediaPickText, { color: colors.textPrimary }]}>
              {mode === "reel" ? "Attach Video" : "Attach Media"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/create-story" as any)}
            style={[
              S.mediaPickBtn,
              { backgroundColor: colors.bgElevated, borderColor: colors.separator },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create 24h Story instead"
          >
            <Feather name="circle" size={18} color={colors.accentPrimary} />
            <Text style={[S.mediaPickText, { color: colors.textPrimary }]}>Story</Text>
          </Pressable>
        </View>

        <AIToolbar content={content} mode={mode} onContent={setContent} media={media} />
      </ScrollView>

      <ActionSheet
        visible={mediaSheetOpen}
        title={mode === "reel" ? "Add Video" : "Add Media"}
        items={[
          {
            id: "camera",
            label: "Take Photo or Video",
            icon: "camera",
            onPress: launchCamera,
          },
          {
            id: "library",
            label: "Choose from Library",
            icon: "image",
            onPress: launchLibrary,
          },
        ]}
        onClose={() => setMediaSheetOpen(false)}
      />

      <ActionSheet
        visible={visSheetOpen}
        title="Audience"
        message="Choose who can see this post."
        items={[
          {
            id: "public",
            label: "Public",
            subtitle: "Anyone on Vibe can view",
            icon: "globe",
            selected: visibility === "public",
            onPress: () => setVisibility("public"),
          },
          {
            id: "followers",
            label: "Followers Only",
            subtitle: "Only people following you",
            icon: "users",
            selected: visibility === "followers",
            onPress: () => setVisibility("followers"),
          },
          {
            id: "private",
            label: "Only Me",
            subtitle: "Saved privately to your profile",
            icon: "lock",
            selected: visibility === "private",
            onPress: () => setVisibility("private"),
          },
        ]}
        onClose={() => setVisSheetOpen(false)}
      />
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    alignSelf: "center",
  },
  hitTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  postBtn: {
    paddingHorizontal: 18,
    minHeight: 36,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  postBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14 },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  modeTrack: {
    flexDirection: "row",
    padding: 3,
    borderRadius: RADIUS.sm,
    gap: 3,
  },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 34,
    borderRadius: 8,
  },
  modeText: { fontSize: 13.5, fontWeight: "600" },
  audienceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 38,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  audienceText: { fontSize: 13.5, fontWeight: "500" },
  composer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    alignItems: "flex-start",
  },
  composerName: { fontSize: 14.5, fontWeight: "600", marginBottom: 4 },
  textInput: { fontSize: 16, lineHeight: 23, minHeight: 100 },
  counterRow: {
    paddingHorizontal: 16,
    alignItems: "flex-end",
    marginBottom: 8,
  },
  counterText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  mediaRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  mediaThumb: {
    width: 112,
    height: 112,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    position: "relative",
  },
  mediaThumbnailImg: { width: "100%", height: "100%" },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeMedia: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  dockRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 14,
  },
  mediaPickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mediaPickText: { fontSize: 14, fontWeight: "600" },
  aiSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  aiBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  aiTool: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aiToolText: { fontSize: 13, fontWeight: "500" },
  tagRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tagChip: {
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: "center",
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagChipText: { fontSize: 13, fontWeight: "600" },
  altBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  altLabel: { fontSize: 12, fontWeight: "600" },
  altBody: { fontSize: 13.5, lineHeight: 19 },
});
