import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { uploadMedia } from "@/lib/db";
import { inferExtension, normalizeMimeType } from "@/lib/mediaUtils";
import { ActionSheet } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";
import { supabase } from "@/lib/supabase";

export default function CreateStoryScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const maxWidth = isWeb && width >= 768 ? 520 : undefined;

  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [posting, setPosting] = useState(false);
  const [discardSheetOpen, setDiscardSheetOpen] = useState(false);

  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast("Allow media library access to share a story.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
      videoMaxDuration: 15,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled) setAsset(result.assets[0]);
  };

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast("Allow camera access to capture a story.", "error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
      videoMaxDuration: 15,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled) setAsset(result.assets[0]);
  };

  const handleShare = async () => {
    if (!asset || !user?.id) return;
    setPosting(true);
    try {
      const isVideo = asset.type === "video";
      const ext = inferExtension(asset.uri, (asset as any).mimeType);
      const mime = normalizeMimeType(
        (asset as any).mimeType ?? ext,
        isVideo ? "video" : "image",
      );
      const url = await uploadMedia(asset.uri, `story_${Date.now()}.${ext}`, mime);
      await supabase.from("stories").insert({
        author_id: user.id,
        media_url: url,
        media_type: isVideo ? "video" : "image",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["stories"] });
      showToast("Story shared", "success");
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      showToast(e.message ?? "Failed to share story.", "error");
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCanvas }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <GlassSurface
        style={[
          styles.header,
          {
            paddingTop: isWeb ? 12 : Math.max(insets.top + 6, 12),
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={[styles.headerInner, maxWidth ? { maxWidth } : null]}>
          <Pressable
            onPress={() => {
              haptics.selection();
              if (asset) setDiscardSheetOpen(true);
              else router.back();
            }}
            style={styles.hitTarget}
            accessibilityRole="button"
            accessibilityLabel="Close story composer"
          >
            <Feather name="x" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New Story</Text>
          <Pressable
            onPress={handleShare}
            disabled={!asset || posting}
            style={[
              styles.shareBtn,
              {
                backgroundColor:
                  asset && !posting ? colors.accentPrimary : colors.muted,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Share story"
          >
            {posting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.shareBtnText}>Share</Text>
            )}
          </Pressable>
        </View>
      </GlassSurface>

      <View
        style={[
          styles.stageWrap,
          maxWidth ? { maxWidth, alignSelf: "center", padding: 16 } : null,
        ]}
      >
        {asset ? (
          <View style={styles.preview}>
            <Image source={{ uri: asset.uri }} style={styles.previewImg} resizeMode="cover" />
            <Pressable
              onPress={() => setAsset(null)}
              style={styles.removeBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear selected media"
            >
              <Feather name="x" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <LinearGradient colors={["#161224", "#241942"]} style={styles.pickAreaGrad}>
            <Feather name="camera" size={48} color="rgba(255,255,255,0.42)" />
            <Text style={styles.pickTitle}>Share a Moment</Text>
            <Text style={styles.pickSub}>Stories are visible to your followers for 24 hours.</Text>

            <View style={styles.pickBtns}>
              {!isWeb && (
                <Pressable
                  onPress={openCamera}
                  style={[styles.pickBtn, { backgroundColor: colors.accentPrimary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open camera"
                >
                  <Feather name="camera" size={18} color="#FFFFFF" />
                  <Text style={styles.pickBtnText}>Camera</Text>
                </Pressable>
              )}
              <Pressable
                onPress={pickMedia}
                style={[
                  styles.pickBtn,
                  { backgroundColor: "rgba(255,255,255,0.16)" },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Choose from gallery"
              >
                <Feather name="image" size={18} color="#FFFFFF" />
                <Text style={styles.pickBtnText}>Gallery</Text>
              </Pressable>
            </View>
          </LinearGradient>
        )}
      </View>

      <ActionSheet
        visible={discardSheetOpen}
        title="Discard Story?"
        message="Your selected media will not be saved."
        items={[
          {
            id: "discard",
            label: "Discard Story",
            icon: "trash-2",
            destructive: true,
            onPress: () => router.back(),
          },
        ]}
        cancelLabel="Keep Editing"
        onClose={() => setDiscardSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerTitle: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  shareBtn: {
    paddingHorizontal: 18,
    minHeight: 36,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14 },
  stageWrap: { flex: 1, width: "100%" },
  preview: {
    flex: 1,
    position: "relative",
    borderRadius: RADIUS.lg,
    overflow: "hidden",
  },
  previewImg: { flex: 1 },
  removeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickAreaGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
    borderRadius: RADIUS.lg,
  },
  pickTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginTop: 10 },
  pickSub: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14.5,
    textAlign: "center",
    maxWidth: 280,
  },
  pickBtns: { flexDirection: "row", gap: 12, marginTop: 20 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    minHeight: 46,
    borderRadius: RADIUS.pill,
  },
  pickBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});
