import React, { useState, useEffect } from "react";
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
import { Stack, router } from "expo-router";
import {
  useGetMyProfile,
  useUpdateMyProfile,
  useRequestUploadUrl,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

function AvatarPicker({
  displayName,
  avatarUrl,
  onPress,
}: {
  displayName: string;
  avatarUrl?: string | null;
  onPress: () => void;
}) {
  const initials = displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Pressable onPress={onPress} style={styles.avatarWrap}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitials}>{initials || "?"}</Text>
        </View>
      )}
      <View style={styles.avatarEditBadge}>
        <Feather name="camera" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

export default function EditProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const qc = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();
  const requestUploadUrl = useRequestUploadUrl();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newAvatarAsset, setNewAvatarAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? "");
      setUsername(profile.username ?? "");
      setBio(profile.bio ?? "");
      setAvatarUrl(profile.avatarUrl ?? null);
    }
  }, [profile]);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Grant photo library access to change your avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setNewAvatarAsset(result.assets[0]);
      setAvatarUrl(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert("Validation", "Display name cannot be empty.");
      return;
    }
    if (!username.trim()) {
      Alert.alert("Validation", "Username cannot be empty.");
      return;
    }

    let uploadedAvatarUrl: string | undefined;

    if (newAvatarAsset) {
      setUploading(true);
      try {
        const mimeType = newAvatarAsset.mimeType ?? "image/jpeg";
        const ext = mimeType.split("/")[1] ?? "jpg";
        const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
          data: { name: `avatar_${Date.now()}.${ext}`, size: newAvatarAsset.fileSize ?? 200_000, contentType: mimeType },
        });
        const fileRes = await fetch(newAvatarAsset.uri);
        const blob = await fileRes.blob();
        await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": mimeType } });
        uploadedAvatarUrl = objectPath;
      } catch {
        setUploading(false);
        Alert.alert("Upload failed", "Could not upload avatar. Please try again.");
        return;
      }
      setUploading(false);
    }

    updateProfile.mutate(
      {
        data: {
          displayName: displayName.trim(),
          username: username.trim(),
          bio: bio.trim(),
          ...(uploadedAvatarUrl && { avatarUrl: uploadedAvatarUrl }),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          Alert.alert("Saved!", "Your profile has been updated.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string })?.message ?? "Please try again.";
          Alert.alert("Error", msg);
        },
      },
    );
  };

  const isSaving = uploading || updateProfile.isPending;
  const canSave = displayName.trim().length > 0 && username.trim().length > 0;

  if (profileLoading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Edit Profile", headerShown: false }} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ title: "Edit Profile", headerShown: false }} />
      <View style={[styles.header, { paddingTop: isWeb ? 16 : insets.top + 4, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Edit Profile</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave || isSaving}
          style={[styles.saveBtn, { backgroundColor: canSave ? colors.primary : colors.muted }]}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.saveBtnText, { color: canSave ? "#fff" : colors.mutedForeground }]}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <AvatarPicker displayName={displayName || "?"} avatarUrl={avatarUrl} onPress={pickAvatar} />
          <Text style={[styles.changePhotoLabel, { color: colors.primary }]}>Change Photo</Text>
        </View>

        <View style={[styles.form, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Display Name</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
              maxLength={50}
            />
          </View>
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Username</Text>
            <View style={styles.usernameRow}>
              <Text style={[styles.atSign, { color: colors.mutedForeground }]}>@</Text>
              <TextInput
                style={[styles.fieldInput, { flex: 1, color: colors.foreground }]}
                value={username}
                onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                placeholder="username"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                returnKeyType="next"
                maxLength={30}
              />
            </View>
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Bio</Text>
            <TextInput
              style={[styles.fieldInput, styles.bioInput, { color: colors.foreground }]}
              value={bio}
              onChangeText={setBio}
              placeholder="Write something about yourself…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={160}
              textAlignVertical="top"
            />
            <Text style={[styles.bioCount, { color: colors.mutedForeground }]}>{bio.length}/160</Text>
          </View>
        </View>

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Your username must be unique and can only contain letters, numbers, dots, and underscores.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6, minWidth: 40 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, minWidth: 60, alignItems: "center" },
  saveBtnText: { fontWeight: "700", fontSize: 15 },
  content: { paddingBottom: 60 },
  avatarSection: { alignItems: "center", paddingVertical: 28 },
  avatarWrap: { position: "relative" },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: "#7c3aed" },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: "#7c3aed",
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#a78bfa",
  },
  avatarInitials: { color: "#fff", fontSize: 32, fontWeight: "800" },
  avatarEditBadge: {
    position: "absolute", bottom: 2, right: 2,
    backgroundColor: "#7c3aed", borderRadius: 14, padding: 5, borderWidth: 2, borderColor: "#fff",
  },
  changePhotoLabel: { marginTop: 10, fontSize: 14, fontWeight: "600" },
  form: {
    marginHorizontal: 16, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  field: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  fieldInput: { fontSize: 16, paddingVertical: 2 },
  usernameRow: { flexDirection: "row", alignItems: "center" },
  atSign: { fontSize: 16, marginRight: 2 },
  bioInput: { minHeight: 80 },
  bioCount: { fontSize: 11, textAlign: "right", marginTop: 4 },
  hint: { fontSize: 12, lineHeight: 17, marginHorizontal: 16, marginTop: 12, textAlign: "center" },
});
