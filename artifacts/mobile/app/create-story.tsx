import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Alert, Image, Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { uploadMedia, createStory } from "@/lib/db";

export default function CreateStoryScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [posting, setPosting] = useState(false);

  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow media access to share a story.");
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
      Alert.alert("Permission required", "Allow camera access to take a photo.");
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
      const ext = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
      const isVideo = asset.type === "video";
      const mime = isVideo ? `video/${ext}` : `image/${ext}`;
      const url = await uploadMedia(asset.uri, `story_${Date.now()}.${ext}`, mime);
      await createStory(user.id, url, isVideo ? "video" : "image");
      qc.invalidateQueries({ queryKey: ["stories"] });
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to share story.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>New Story</Text>
        <Pressable
          onPress={handleShare}
          disabled={!asset || posting}
          style={[styles.shareBtn, { backgroundColor: asset && !posting ? colors.primary : colors.muted }]}
        >
          {posting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.shareBtnText}>Share</Text>}
        </Pressable>
      </View>

      {/* Preview */}
      {asset ? (
        <View style={styles.preview}>
          <Image source={{ uri: asset.uri }} style={styles.previewImg} resizeMode="cover" />
          <Pressable onPress={() => setAsset(null)} style={styles.removeBtn}>
            <Feather name="x" size={16} color="#fff" />
          </Pressable>
          <View style={styles.storyBadge}>
            <Feather name={asset.type === "video" ? "video" : "image"} size={12} color="#fff" />
            <Text style={styles.storyBadgeText}>
              {asset.type === "video" ? "Video Story" : "Photo Story"}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.pickArea}>
          <LinearGradient
            colors={["#1e1b4b", "#2d1b69"]}
            style={styles.pickAreaGrad}
          >
            <Feather name="camera" size={52} color="rgba(255,255,255,0.3)" />
            <Text style={styles.pickTitle}>Create a Story</Text>
            <Text style={styles.pickSub}>Stories disappear after 24 hours</Text>

            <View style={styles.pickBtns}>
              <Pressable onPress={openCamera} style={styles.pickBtn}>
                <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.pickBtnGrad}>
                  <Feather name="camera" size={20} color="#fff" />
                  <Text style={styles.pickBtnText}>Camera</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={pickMedia} style={styles.pickBtn}>
                <LinearGradient colors={["#0891b2", "#0e7490"]} style={styles.pickBtnGrad}>
                  <Feather name="image" size={20} color="#fff" />
                  <Text style={styles.pickBtnText}>Gallery</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  shareBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  shareBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  preview: { flex: 1, position: "relative" },
  previewImg: { flex: 1 },
  removeBtn: {
    position: "absolute", top: 14, right: 14,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  storyBadge: {
    position: "absolute", bottom: 20, left: "50%",
    transform: [{ translateX: -60 }],
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  storyBadgeText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  pickArea: { flex: 1 },
  pickAreaGrad: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32,
  },
  pickTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 16 },
  pickSub: { color: "rgba(255,255,255,0.5)", fontSize: 14, textAlign: "center" },
  pickBtns: { flexDirection: "row", gap: 16, marginTop: 24 },
  pickBtn: { borderRadius: 18, overflow: "hidden" },
  pickBtnGrad: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  pickBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
