import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { RADIUS } from "@/constants/colors";
import { haptics } from "@/lib/motion";

const CHANNEL_ICONS = ["📢", "📰", "💬", "📣", "🔔", "📡", "🌐", "🎙️"];

export default function CreateChannelScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channelType, setChannelType] = useState<"public" | "private">("public");
  const [icon, setIcon] = useState("📢");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !user?.id) return;
    setCreating(true);
    try {
      const displayName = `${icon} ${name.trim()}`;
      const { data: ch, error } = await supabase
        .from("conversations")
        .insert({
          type: "group",
          name: displayName,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("conversation_members").insert({
        conversation_id: ch.id,
        user_id: user.id,
        is_admin: true,
      });
      haptics.success();
      showToast("Channel created", "success");
      router.replace({ pathname: `/channel/${ch.id}` } as any);
    } catch (e: any) {
      showToast(e?.message ?? "Could not create channel", "error");
    } finally {
      setCreating(false);
    }
  };

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
        <View style={[styles.headerInner, { maxWidth: 560 }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Feather name="x" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            New Channel
          </Text>
          <Pressable
            onPress={handleCreate}
            disabled={!name.trim() || creating}
            style={[
              styles.btn,
              {
                backgroundColor: name.trim()
                  ? colors.accentPrimary
                  : colors.muted,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create channel"
          >
            {creating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                Create
              </Text>
            )}
          </Pressable>
        </View>
      </GlassSurface>

      <View style={[styles.body, { maxWidth: 560 }]}>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
            },
          ]}
          placeholder="Channel name…"
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <TextInput
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
              marginTop: 12,
            },
          ]}
          placeholder="Topic or description (optional)"
          placeholderTextColor={colors.textTertiary}
          value={description}
          onChangeText={setDescription}
        />

        <View
          style={[
            styles.segmentWrap,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
            },
          ]}
        >
          {(["public", "private"] as const).map((t) => {
            const active = channelType === t;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  haptics.selection();
                  setChannelType(t);
                }}
                style={[
                  styles.segmentBtn,
                  active && { backgroundColor: colors.accentPrimary },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    textTransform: "capitalize",
                    color: active ? "#FFFFFF" : colors.textSecondary,
                  }}
                >
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          style={[styles.sectionLabel, { color: colors.textSecondary }]}
        >
          Icon
        </Text>
        <View style={styles.iconRow}>
          {CHANNEL_ICONS.map((emoji) => {
            const selected = icon === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => {
                  haptics.selection();
                  setIcon(emoji);
                }}
                style={[
                  styles.iconBtn,
                  {
                    backgroundColor: selected
                      ? colors.accentPrimary
                      : colors.bgElevated,
                    borderColor: selected
                      ? colors.accentPrimary
                      : colors.separator,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={styles.iconText}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerInner: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  btn: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    width: "100%",
    alignSelf: "center",
    padding: 20,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15.5,
  },
  segmentWrap: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: RADIUS.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 10,
  },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { fontSize: 22 },
});
