import React, { useState, useEffect } from "react";
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
import { Stack, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { fetchProfile, updateProfile, uploadMedia, resolveMediaUrl } from "@/lib/db";
import { inferExtension, normalizeMimeType } from "@/lib/mediaUtils";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import AIBioWriter from "@/components/ai/AIBioWriter";

export default function EditProfileScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const maxWidth = isWeb && width >= 768 ? 620 : undefined;

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    fetchProfile(user.id).then((p) => {
      if (p) {
        setDisplayName(p.display_name ?? "");
        setUsername(p.username ?? "");
        setBio(p.bio ?? "");
        setWebsite((p as any).website ?? "");
        setLocation((p as any).location ?? "");
        setPronouns((p as any).pronouns ?? "");
        setAvatarUri(p.avatar_url ? resolveMediaUrl(p.avatar_url) : null);
        setCoverUri(p.cover_url ? resolveMediaUrl(p.cover_url) : null);
      }
      setLoading(false);
    });
  }, [user?.id]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast("Allow photo access to update your avatar.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
      setAvatarMime((result.assets[0] as any).mimeType ?? null);
    }
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast("Allow photo access to update your cover photo.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled) {
      setCoverUri(result.assets[0].uri);
      setCoverMime((result.assets[0] as any).mimeType ?? null);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!displayName.trim()) {
      showToast("Display name is required.", "error");
      return;
    }
    if (!username.trim()) {
      showToast("Username is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const updates: any = {
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        website: website.trim(),
        location: location.trim(),
        pronouns: pronouns.trim(),
      };

      if (avatarUri && !avatarUri.startsWith("http")) {
        const ext = inferExtension(avatarUri, avatarMime);
        const mime = normalizeMimeType(avatarMime ?? ext, "image");
        updates.avatar_url = await uploadMedia(
          avatarUri,
          `avatar_${user.id}.${ext}`,
          mime,
          "avatars",
        );
      }
      if (coverUri && !coverUri.startsWith("http")) {
        const ext = inferExtension(coverUri, coverMime);
        const mime = normalizeMimeType(coverMime ?? ext, "image");
        updates.cover_url = await uploadMedia(
          coverUri,
          `cover_${user.id}.${ext}`,
          mime,
          "media",
        );
      }

      await updateProfile(user.id, updates);
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
      showToast("Profile updated", "success");
      router.back();
    } catch (e: any) {
      showToast(e.message ?? "Failed to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bgCanvas,
        }}
      >
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

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
            onPress={() => router.back()}
            style={styles.hitTarget}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing profile"
          >
            <Feather name="x" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Edit Profile</Text>
          <Pressable
            onPress={() => {
              haptics.selection();
              handleSave();
            }}
            disabled={saving}
            style={[
              styles.saveBtn,
              { backgroundColor: saving ? colors.muted : colors.accentPrimary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save profile changes"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>
      </GlassSurface>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingBottom: insets.bottom + 40, width: "100%", alignSelf: "center" },
          maxWidth ? { maxWidth } : null,
        ]}
      >
        <Pressable
          onPress={pickCover}
          style={styles.coverWrap}
          accessibilityRole="button"
          accessibilityLabel="Change cover photo"
        >
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#1E1B4B", "#4C1D95"]} style={styles.coverImg} />
          )}
          <View style={styles.coverEditBtn}>
            <Feather name="camera" size={16} color="#FFFFFF" />
          </View>
        </Pressable>

        <View style={styles.avatarSection}>
          <Pressable
            onPress={pickAvatar}
            style={{ position: "relative", alignSelf: "flex-start" }}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={[styles.avatar, { borderColor: colors.bgCanvas }]}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={[colors.accentPrimary, "#4F46E5"]}
                style={[styles.avatar, { borderColor: colors.bgCanvas }]}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "700" }}>
                  {displayName
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "?"}
                </Text>
              </LinearGradient>
            )}
            <View
              style={[
                styles.avatarEditBtn,
                { backgroundColor: colors.accentPrimary, borderColor: colors.bgCanvas },
              ]}
            >
              <Feather name="camera" size={13} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 16 }}>
          {[
            {
              label: "Display Name",
              value: displayName,
              onChange: setDisplayName,
              placeholder: "Your full name",
              autoCapitalize: "words" as const,
            },
            {
              label: "Username",
              value: username,
              onChange: (v: string) =>
                setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, "")),
              placeholder: "username",
              autoCapitalize: "none" as const,
            },
            {
              label: "Website",
              value: website,
              onChange: setWebsite,
              placeholder: "https://yoursite.com",
              autoCapitalize: "none" as const,
            },
            {
              label: "Location",
              value: location,
              onChange: setLocation,
              placeholder: "City, Country",
              autoCapitalize: "words" as const,
            },
            {
              label: "Pronouns",
              value: pronouns,
              onChange: setPronouns,
              placeholder: "they/them, she/her, he/him",
              autoCapitalize: "none" as const,
            },
          ].map((field) => (
            <View key={field.label}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                {field.label}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.bgElevated,
                    borderColor: colors.separator,
                  },
                ]}
                value={field.value}
                onChangeText={field.onChange}
                placeholder={field.placeholder}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize={field.autoCapitalize}
                autoCorrect={false}
              />
            </View>
          ))}

          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
            <TextInput
              style={[
                styles.input,
                styles.bioInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.separator,
                },
              ]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={150}
            />
            <Text style={[styles.charCount, { color: colors.textTertiary }]}>
              {bio.length}/150
            </Text>
            <AIBioWriter displayName={displayName} onApply={setBio} />
          </View>
        </View>
      </ScrollView>
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
  title: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  saveBtn: {
    paddingHorizontal: 18,
    minHeight: 36,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14 },
  coverWrap: { height: 140, position: "relative" },
  coverImg: { width: "100%", height: "100%" },
  coverEditBtn: {
    position: "absolute",
    bottom: 10,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSection: { paddingHorizontal: 16, marginTop: -42, marginBottom: 14 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarEditBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15.5,
    minHeight: 46,
  },
  bioInput: { height: 104, textAlignVertical: "top" },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
});
