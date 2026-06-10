import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import {
  useCreatePost,
  useRequestUploadUrl,
  getGetFeedQueryKey,
  getGetReelsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

const MAX_CHARS = 500;
const REEL_MAX_CHARS = 150;

type PostMode = "post" | "reel";

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

function HashtagPreview({ text, colors }: { text: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  if (!text.includes("#") && !text.includes("@")) return null;
  const parts = text.split(/(\s+)/);
  return (
    <View style={styles.previewRow}>
      {parts.map((part, i) => {
        const isHashtag = part.startsWith("#");
        const isMention = part.startsWith("@");
        return (
          <Text
            key={i}
            style={[
              styles.previewWord,
              { color: isHashtag ? "#7c3aed" : isMention ? "#0ea5e9" : colors.mutedForeground },
            ]}
          >
            {part}
          </Text>
        );
      })}
    </View>
  );
}

export default function CreateScreen() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [mode, setMode] = useState<PostMode>("post");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();
  const createPost = useCreatePost();
  const requestUploadUrl = useRequestUploadUrl();

  if (authLoading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const maxChars = mode === "reel" ? REEL_MAX_CHARS : MAX_CHARS;
  const remaining = maxChars - content.length;
  const canPost = (mode === "reel" ? !!media : content.trim().length > 0) && remaining >= 0 && !uploading;
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "You";

  const pickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant media library access to upload photos and videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mode === "reel" ? ["videos"] : ["images", "videos"],
      quality: 0.85,
      allowsEditing: true,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets[0]) {
      setMedia(result.assets[0]);
      if (result.assets[0].type === "video" && mode !== "reel") {
        setMode("reel");
      }
    }
  }, [mode]);

  const removeMedia = useCallback(() => setMedia(null), []);

  const handlePost = async () => {
    if (!canPost || createPost.isPending) return;
    let mediaUrls: string[] = [];
    let mediaType: "image" | "video" | undefined;

    if (media) {
      setUploading(true);
      try {
        const mimeType = media.mimeType ?? (media.type === "video" ? "video/mp4" : "image/jpeg");
        const ext = mimeType.split("/")[1] ?? "jpg";
        const fileName = `upload_${Date.now()}.${ext}`;
        const fileSize = media.fileSize ?? 500_000;

        const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
          data: { name: fileName, size: fileSize, contentType: mimeType },
        });

        const fileRes = await fetch(media.uri);
        const blob = await fileRes.blob();
        await fetch(uploadURL, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": mimeType },
        });

        mediaUrls = [objectPath];
        mediaType = media.type === "video" ? "video" : "image";
      } catch {
        setUploading(false);
        Alert.alert("Upload failed", "Could not upload media. Please try again.");
        return;
      }
      setUploading(false);
    }

    createPost.mutate(
      {
        data: {
          content: content.trim() || (mode === "reel" ? "🎬" : ""),
          ...(mediaUrls.length > 0 && { mediaUrls, mediaType }),
        },
      },
      {
        onSuccess: () => {
          setContent("");
          setMedia(null);
          qc.invalidateQueries({ queryKey: getGetFeedQueryKey() });
          if (mode === "reel") {
            qc.invalidateQueries({ queryKey: getGetReelsQueryKey() });
            router.replace("/(tabs)/reels");
          } else {
            router.replace("/(tabs)");
          }
        },
        onError: () => {
          Alert.alert("Error", "Failed to create post. Please try again.");
        },
      },
    );
  };

  const isPosting = uploading || createPost.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>
        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => setMode("post")}
            style={[styles.modeBtn, { backgroundColor: mode === "post" ? colors.primary : "transparent" }]}
          >
            <Text style={[styles.modeBtnText, { color: mode === "post" ? "#fff" : colors.mutedForeground }]}>Post</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("reel")}
            style={[styles.modeBtn, { backgroundColor: mode === "reel" ? "#7c3aed" : "transparent" }]}
          >
            <Feather name="film" size={13} color={mode === "reel" ? "#fff" : colors.mutedForeground} style={{ marginRight: 4 }} />
            <Text style={[styles.modeBtnText, { color: mode === "reel" ? "#fff" : colors.mutedForeground }]}>Reel</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={handlePost}
          disabled={!canPost || isPosting}
          style={[styles.postBtn, { backgroundColor: canPost && !isPosting ? (mode === "reel" ? "#7c3aed" : colors.primary) : colors.muted }]}
        >
          {isPosting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={[styles.postBtnText, { color: canPost ? "#fff" : colors.mutedForeground }]}>{mode === "reel" ? "Share" : "Post"}</Text>
          }
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.body}>
            <Avatar name={displayName} size={44} />
            <View style={styles.inputArea}>
              <Text style={[styles.authorName, { color: colors.foreground }]}>{displayName}</Text>
              {mode === "reel" && !media && (
                <Pressable onPress={pickMedia} style={[styles.videoPickerPlaceholder, { borderColor: colors.border }]}>
                  <Feather name="film" size={32} color="#7c3aed" />
                  <Text style={[styles.videoPickerText, { color: colors.mutedForeground }]}>Tap to select a video</Text>
                  <Text style={[styles.videoPickerSub, { color: colors.mutedForeground }]}>Up to 60 seconds</Text>
                </Pressable>
              )}
              {media ? (
                <View style={styles.mediaPreviewWrap}>
                  {media.type === "video" ? (
                    <View style={[styles.videoPreview, { backgroundColor: "#1a1a2e" }]}>
                      <Feather name="play-circle" size={40} color="#7c3aed" />
                      <Text style={{ color: "#fff", marginTop: 8, fontSize: 13 }}>Video ready</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: media.uri }} style={styles.imagePreview} resizeMode="cover" />
                  )}
                  <Pressable onPress={removeMedia} style={styles.removeMediaBtn}>
                    <Feather name="x" size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : null}
              <TextInput
                style={[styles.textInput, { color: colors.foreground }]}
                placeholder={mode === "reel" ? "Describe your reel…" : "What's on your mind?"}
                placeholderTextColor={colors.mutedForeground}
                value={content}
                onChangeText={setContent}
                multiline
                autoFocus={mode === "post"}
                maxLength={maxChars + 1}
                textAlignVertical="top"
              />
              {content.length > 0 && <HashtagPreview text={content} colors={colors} />}
            </View>
          </View>

          <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
            <View style={styles.toolbarLeft}>
              <Pressable style={styles.toolbarBtn} onPress={pickMedia} hitSlop={8}>
                <Feather name={mode === "reel" ? "film" : "image"} size={22} color={colors.primary} />
              </Pressable>
              <Pressable
                style={styles.toolbarBtn}
                hitSlop={8}
                onPress={() => setContent((c) => c + "#")}
              >
                <Feather name="hash" size={22} color={colors.primary} />
              </Pressable>
              <Pressable
                style={styles.toolbarBtn}
                hitSlop={8}
                onPress={() => setContent((c) => c + "@")}
              >
                <Feather name="at-sign" size={22} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.charCountWrap}>
              {remaining <= 50 && (
                <Text style={[styles.charCount, { color: remaining < 0 ? colors.destructive : colors.mutedForeground }]}>
                  {remaining}
                </Text>
              )}
              <View style={[styles.charRing, { borderColor: remaining < 0 ? colors.destructive : remaining < 50 ? "#f59e0b" : colors.primary, opacity: content.length === 0 ? 0.3 : 1 }]}>
                <View style={[styles.charRingFill, { width: `${Math.min(100, (content.length / maxChars) * 100)}%` as unknown as number, backgroundColor: remaining < 0 ? colors.destructive : colors.primary }]} />
              </View>
            </View>
          </View>

          {mode === "reel" && (
            <View style={[styles.reelTip, { backgroundColor: colors.muted }]}>
              <Feather name="info" size={13} color={colors.mutedForeground} />
              <Text style={[styles.reelTipText, { color: colors.mutedForeground }]}>
                Reels are short videos that appear in the Reels feed for everyone to discover.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: { paddingVertical: 6, paddingRight: 8, minWidth: 60 },
  cancelText: { fontSize: 15 },
  modeToggle: { flexDirection: "row", borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.06)", padding: 3 },
  modeBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 17 },
  modeBtnText: { fontSize: 13, fontWeight: "600" },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, minWidth: 64, alignItems: "center" },
  postBtnText: { fontWeight: "700", fontSize: 15 },
  body: { flexDirection: "row", padding: 16, gap: 12 },
  inputArea: { flex: 1 },
  authorName: { fontWeight: "600", fontSize: 15, marginBottom: 6 },
  videoPickerPlaceholder: {
    borderWidth: 2, borderStyle: "dashed", borderRadius: 12,
    paddingVertical: 36, alignItems: "center", gap: 8, marginBottom: 12,
  },
  videoPickerText: { fontSize: 15, fontWeight: "600" },
  videoPickerSub: { fontSize: 12 },
  mediaPreviewWrap: { position: "relative", marginBottom: 12 },
  imagePreview: { width: "100%", height: 200, borderRadius: 12 },
  videoPreview: { width: "100%", height: 160, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  removeMediaBtn: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 16, padding: 4,
  },
  textInput: { fontSize: 17, lineHeight: 25, minHeight: 80 },
  previewRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 4 },
  previewWord: { fontSize: 13, lineHeight: 18 },
  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarLeft: { flexDirection: "row", gap: 4 },
  toolbarBtn: { padding: 8 },
  charCountWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  charCount: { fontSize: 13 },
  charRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, overflow: "hidden", justifyContent: "center" },
  charRingFill: { height: 2, alignSelf: "flex-start" },
  reelTip: { flexDirection: "row", alignItems: "flex-start", gap: 8, margin: 16, padding: 12, borderRadius: 10 },
  reelTipText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
