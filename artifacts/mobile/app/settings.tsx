import React, { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ActionSheet, PromptSheet } from "@/components/ActionSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";

const PREFS_STORAGE_KEY = "settings_prefs_v1";

interface SettingsPrefs {
  pushLikes: boolean;
  pushComments: boolean;
  pushFollows: boolean;
  pushMessages: boolean;
  privateAccount: boolean;
}

const DEFAULT_PREFS: SettingsPrefs = {
  pushLikes: true,
  pushComments: true,
  pushFollows: true,
  pushMessages: true,
  privateAccount: false,
};

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { themeMode, setTheme, useSystemTheme } = useTheme();
  const { logout, user } = useAuth();
  const { showToast } = useToast();

  const [prefs, setPrefs] = useState<SettingsPrefs>(DEFAULT_PREFS);
  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false);
  const [aboutSheetVisible, setAboutSheetVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setPrefs({ ...DEFAULT_PREFS, ...parsed });
        }
      })
      .catch(() => {});
  }, []);

  const updatePref = <K extends keyof SettingsPrefs>(
    key: K,
    value: SettingsPrefs[K],
  ) => {
    haptics.selection();
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const handleConfirmDeleteAccount = async (typed: string) => {
    if (typed.trim().toUpperCase() !== "DELETE") {
      showToast("Type DELETE exactly to confirm deletion", "error");
      return;
    }
    try {
      if (user?.id) {
        const { error } = await supabase.rpc("delete_user");
        if (error) throw error;
        await supabase.auth.signOut();
      }
      showToast("Account deleted", "success");
      router.replace("/login" as any);
    } catch (e: any) {
      showToast(e?.message ?? "Failed to delete account", "error");
    }
  };

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCanvas }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <GlassSurface
        style={[
          styles.headerWrap,
          {
            paddingTop: Platform.OS === "web" ? 12 : insets.top + 8,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={[styles.headerInner, { maxWidth: 640 }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Settings
          </Text>
          <View style={styles.backBtn} />
        </View>
      </GlassSurface>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 48,
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
      >
        {/* Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Appearance
          </Text>
          <View
            style={[
              styles.group,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            <View style={styles.row}>
              <Feather name="moon" size={18} color={colors.accentPrimary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Theme
              </Text>
              <View
                style={[
                  styles.segmented,
                  {
                    backgroundColor: colors.bgCanvas,
                    borderColor: colors.separator,
                  },
                ]}
              >
                {(
                  [
                    { label: "System", value: "system" as const, onPress: useSystemTheme },
                    { label: "Light", value: "light" as const, onPress: () => setTheme("light") },
                    { label: "Dark", value: "dark" as const, onPress: () => setTheme("dark") },
                  ]
                ).map((opt) => {
                  const active = themeMode === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        haptics.selection();
                        opt.onPress();
                      }}
                      style={[
                        styles.segBtn,
                        active && { backgroundColor: colors.accentPrimary },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${opt.label} theme`}
                    >
                      <Text
                        style={{
                          color: active ? "#FFFFFF" : colors.textSecondary,
                          fontSize: 12.5,
                          fontWeight: "600",
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Account
          </Text>
          <View
            style={[
              styles.group,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            {[
              { icon: "user" as const, label: "Edit Profile", path: "/edit-profile" },
              { icon: "lock" as const, label: "Change Password", path: "/change-password" },
              { icon: "activity" as const, label: "Diagnostics", path: "/diagnostics" },
            ].map((item, i, arr) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.path as any)}
                style={({ pressed }) => [
                  styles.row,
                  i < arr.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.separator,
                  },
                  pressed && { backgroundColor: colors.accentTint },
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Feather name={item.icon} size={18} color={colors.accentPrimary} />
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  {item.label}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Privacy
          </Text>
          <View
            style={[
              styles.group,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            <View
              style={[
                styles.row,
                {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.separator,
                },
              ]}
            >
              <Feather name="lock" size={18} color={colors.accentPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  Private Account
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                  Only approved followers can see your posts
                </Text>
              </View>
              <Switch
                value={prefs.privateAccount}
                onValueChange={(v) => updatePref("privateAccount", v)}
                trackColor={{ true: colors.accentPrimary }}
                accessibilityLabel="Private Account"
              />
            </View>
            <Pressable
              onPress={() => router.push("/blocked-users" as any)}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.accentTint },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Blocked Users"
            >
              <Feather name="eye-off" size={18} color={colors.accentPrimary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Blocked Users
              </Text>
              <Feather name="chevron-right" size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Notifications
          </Text>
          <View
            style={[
              styles.group,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            {[
              { key: "pushLikes" as const, label: "Likes" },
              { key: "pushComments" as const, label: "Comments" },
              { key: "pushFollows" as const, label: "New Followers" },
              { key: "pushMessages" as const, label: "Messages" },
            ].map((item, i, arr) => (
              <View
                key={item.key}
                style={[
                  styles.row,
                  i < arr.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.separator,
                  },
                ]}
              >
                <Feather name="bell" size={18} color={colors.accentPrimary} />
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  {item.label}
                </Text>
                <Switch
                  value={prefs[item.key]}
                  onValueChange={(v) => updatePref(item.key, v)}
                  trackColor={{ true: colors.accentPrimary }}
                  accessibilityLabel={`${item.label} notifications`}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Support
          </Text>
          <View
            style={[
              styles.group,
              {
                backgroundColor: colors.bgElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            <Pressable
              onPress={() => Linking.openURL("https://vibe.app/help").catch(() => {})}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.separator,
                },
                pressed && { backgroundColor: colors.accentTint },
              ]}
              accessibilityRole="link"
              accessibilityLabel="Help and Support"
            >
              <Feather name="help-circle" size={18} color={colors.accentPrimary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Help & Support
              </Text>
              <Feather name="external-link" size={16} color={colors.textTertiary} />
            </Pressable>
            <Pressable
              onPress={() => setAboutSheetVisible(true)}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.accentTint },
              ]}
              accessibilityRole="button"
              accessibilityLabel="About Vibe"
            >
              <Feather name="info" size={18} color={colors.accentPrimary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                About
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  fontVariant: ["tabular-nums"],
                }}
              >
                v{appVersion}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Log Out */}
        <Pressable
          onPress={() => setLogoutSheetVisible(true)}
          style={({ pressed }) => [
            styles.logoutBtn,
            {
              backgroundColor: "rgba(225,29,72,0.08)",
              borderColor: "rgba(225,29,72,0.28)",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Log Out"
        >
          <Feather name="log-out" size={17} color={colors.semanticDanger} />
          <Text style={[styles.logoutText, { color: colors.semanticDanger }]}>
            Log Out
          </Text>
        </Pressable>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.semanticDanger }]}>
            Danger Zone
          </Text>
          <View
            style={[
              styles.group,
              {
                backgroundColor: "rgba(225,29,72,0.06)",
                borderColor: "rgba(225,29,72,0.22)",
              },
            ]}
          >
            <Pressable
              onPress={() => setDeleteConfirmVisible(true)}
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Delete Account"
            >
              <Feather name="trash-2" size={18} color={colors.semanticDanger} />
              <Text style={[styles.rowLabel, { color: colors.semanticDanger }]}>
                Delete Account
              </Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.semanticDanger}
              />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <ActionSheet
        visible={logoutSheetVisible}
        title="Log Out"
        message="You can sign back in anytime."
        onClose={() => setLogoutSheetVisible(false)}
        items={[
          {
            id: "logout",
            label: "Log Out",
            icon: "log-out",
            destructive: true,
            onPress: logout,
          },
        ]}
      />

      <ActionSheet
        visible={aboutSheetVisible}
        title={`Vibe v${appVersion}`}
        message="Built for fast, focused sharing and real-time conversations."
        onClose={() => setAboutSheetVisible(false)}
        items={[
          {
            id: "terms",
            label: "Terms of Service",
            subtitle: "vibe.app/terms",
            icon: "file-text",
            onPress: () => Linking.openURL("https://vibe.app/terms").catch(() => {}),
          },
          {
            id: "privacy",
            label: "Privacy Policy",
            subtitle: "vibe.app/privacy",
            icon: "shield",
            onPress: () => Linking.openURL("https://vibe.app/privacy").catch(() => {}),
          },
        ]}
      />

      <PromptSheet
        visible={deleteConfirmVisible}
        title="Delete Account"
        message="This permanently deletes your profile, posts, and messages. Type DELETE to confirm."
        placeholder="Type DELETE"
        submitLabel="Delete Forever"
        onClose={() => setDeleteConfirmVisible(false)}
        onSubmit={handleConfirmDeleteAccount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInner: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  section: { paddingHorizontal: 16, paddingTop: 22 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    minHeight: 52,
    paddingVertical: 10,
    gap: 12,
  },
  rowLabel: { fontSize: 15.5, fontWeight: "500", flex: 1 },
  segmented: {
    flexDirection: "row",
    borderRadius: RADIUS.sm + 2,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  segBtn: {
    paddingHorizontal: 11,
    height: 30,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 26,
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  logoutText: { fontSize: 15.5, fontWeight: "700" },
});
