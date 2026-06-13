import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, Alert, Image,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useCreateChannel, useRequestUploadUrl } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (path.startsWith("/objects/")) return `https://${domain}/api/storage${path}`;
  return `https://${domain}${path}`;
}

export default function CreateChannelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const createChannel = useCreateChannel();
  const requestUploadUrl = useRequestUploadUrl();

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAvatarUri(asset.uri);
    setUploadingAvatar(true);
    try {
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const fileName = `channel_avatar_${Date.now()}.${ext}`;
      const contentType = asset.mimeType ?? "image/jpeg";
      const fileSize = asset.fileSize ?? 500_000;
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: { name: fileName, size: fileSize, contentType },
      });
      const blob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
      setAvatarUrl(resolveMediaUrl(`/objects/${objectPath}`));
    } catch {
      Alert.alert("Error", "Failed to upload avatar.");
      setAvatarUri(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) { Alert.alert("Error", "Channel name is required."); return; }
    createChannel.mutate(
      { data: { name: name.trim(), description: description.trim() || undefined, avatarUrl: avatarUrl ?? undefined } },
      {
        onSuccess: (ch) => router.replace(`/channel/${ch.id}` as any),
        onError: () => Alert.alert("Error", "Could not create channel."),
      },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "New Channel", presentation: "modal" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={handlePickAvatar} style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.secondary }]}>
              <Feather name="radio" size={32} color={colors.mutedForeground} />
            </View>
          )}
          {uploadingAvatar && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <View style={[styles.avatarCamera, { backgroundColor: colors.primary }]}>
            <Feather name="camera" size={12} color="#fff" />
          </View>
        </Pressable>

        <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}18` }]}>
          <Feather name="info" size={14} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.primary }]}>
            Channels are one-way broadcasts. Only admins can post; subscribers can read.
          </Text>
        </View>

        <View style={styles.fields}>
          <View style={[styles.fieldWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CHANNEL NAME *</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              placeholder="Enter channel name"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
          </View>

          <View style={[styles.fieldWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.fieldInput, styles.multilineInput, { color: colors.foreground }]}
              placeholder="What will you broadcast here?"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={300}
            />
          </View>
        </View>

        <Pressable
          onPress={handleCreate}
          disabled={createChannel.isPending || uploadingAvatar || !name.trim()}
          style={[styles.createBtn, { backgroundColor: colors.primary, opacity: (createChannel.isPending || !name.trim()) ? 0.6 : 1 }]}
        >
          {createChannel.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="radio" size={18} color="#fff" />
              <Text style={styles.createBtnText}>Create Channel</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: "center", padding: 24, gap: 24 },
  avatarWrap: { position: "relative", marginTop: 8 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 50, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  avatarCamera: { position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, width: "100%" },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  fields: { width: "100%", gap: 12 },
  fieldWrap: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6 },
  fieldInput: { fontSize: 15 },
  multilineInput: { minHeight: 80, textAlignVertical: "top", paddingTop: 4 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingVertical: 16, width: "100%", justifyContent: "center" },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
