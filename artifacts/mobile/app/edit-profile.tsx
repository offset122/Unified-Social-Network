import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  Platform, ScrollView, Alert, Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { fetchProfile, updateProfile, uploadMedia, resolveMediaUrl } from "@/lib/db";
import { LinearGradient } from "expo-linear-gradient";
import AIBioWriter from "@/components/ai/AIBioWriter";

export default function EditProfileScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    fetchProfile(user.id).then(p => {
      if (p) {
        setDisplayName(p.display_name ?? "");
        setUsername(p.username ?? "");
        setBio(p.bio ?? "");
        setAvatarUri(p.avatar_url ? resolveMediaUrl(p.avatar_url) : null);
        setCoverUri(p.cover_url ? resolveMediaUrl(p.cover_url) : null);
      }
      setLoading(false);
    });
  }, [user?.id]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [16, 9] });
    if (!result.canceled) setCoverUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!displayName.trim()) { Alert.alert("Required", "Display name is required"); return; }
    if (!username.trim()) { Alert.alert("Required", "Username is required"); return; }
    setSaving(true);
    try {
      const updates: any = { display_name: displayName.trim(), username: username.trim().toLowerCase(), bio: bio.trim() };

      if (avatarUri && !avatarUri.startsWith("http")) {
        const ext = avatarUri.split(".").pop() ?? "jpg";
        updates.avatar_url = await uploadMedia(avatarUri, `avatar_${user.id}.${ext}`, `image/${ext}`, "avatars");
      }
      if (coverUri && !coverUri.startsWith("http")) {
        const ext = coverUri.split(".").pop() ?? "jpg";
        updates.cover_url = await uploadMedia(coverUri, `cover_${user.id}.${ext}`, `image/${ext}`, "media");
      }

      await updateProfile(user.id, updates);
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
      Alert.alert("Saved!", "Your profile has been updated.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to save");
    } finally { setSaving(false); }
  };

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color="#7c3aed" /></View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Edit Profile</Text>
        <Pressable onPress={handleSave} disabled={saving}
          style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Cover */}
        <Pressable onPress={pickCover} style={styles.coverWrap}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#1e1b4b", "#2d1b69"]} style={styles.coverImg} />
          )}
          <View style={styles.coverEditBtn}>
            <Feather name="camera" size={16} color="#fff" />
          </View>
        </Pressable>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable onPress={pickAvatar} style={{ position: "relative" }}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.avatar}>
                <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800" }}>
                  {displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
                </Text>
              </LinearGradient>
            )}
            <View style={[styles.avatarEditBtn, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* Fields */}
        <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 8 }}>
          {[
            { label: "Display Name", value: displayName, onChange: setDisplayName, placeholder: "Your full name", autoCapitalize: "words" as const },
            { label: "Username", value: username, onChange: (v: string) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, "")), placeholder: "username", autoCapitalize: "none" as const },
          ].map(field => (
            <View key={field.label}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
                value={field.value} onChangeText={field.onChange}
                placeholder={field.placeholder} placeholderTextColor={colors.mutedForeground}
                autoCapitalize={field.autoCapitalize} autoCorrect={false}
              />
            </View>
          ))}
          <View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Bio</Text>
            <TextInput
              style={[styles.input, styles.bioInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
              value={bio} onChangeText={setBio}
              placeholder="Tell people about yourself..." placeholderTextColor={colors.mutedForeground}
              multiline maxLength={150}
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{bio.length}/150</Text>
            <AIBioWriter displayName={displayName} onApply={setBio} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { flex: 1, fontSize: 17, fontWeight: "700" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  coverWrap: { height: 130, position: "relative" },
  coverImg: { width: "100%", height: "100%" },
  coverEditBtn: { position: "absolute", bottom: 10, right: 10, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8 },
  avatarSection: { paddingHorizontal: 20, marginTop: -40, marginBottom: 12 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarEditBtn: { position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  fieldLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  bioInput: { height: 100, textAlignVertical: "top" },
  charCount: { fontSize: 11, textAlign: "right", marginTop: 4 },
});
