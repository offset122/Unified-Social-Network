import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Image, Modal, Dimensions, ActivityIndicator,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { resolveMediaUrl, timeAgo } from "@/lib/db";

const C = {
  bg: "#0F1117", surface: "#1A1D27", surfaceHigh: "#1E2232",
  border: "#252836", primary: "#6366F1", text: "#E2E8F0",
  textDim: "#4B5168", textMuted: "#6B7280",
};

const { width } = Dimensions.get("window");
const THUMB = (width - 4) / 3;
type Tab = "media" | "files" | "links";

export default function ChatMediaScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const params = useLocalSearchParams<{ peerName?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("media");
  const [preview, setPreview] = useState<{ uri: string; type: "image" | "video" } | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-media-messages", chatId],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, media_url, media_type, content, created_at")
        .eq("conversation_id", chatId as string)
        .eq("is_deleted", false)
        .not("media_url", "is", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!chatId,
  });

  const mediaItems = (messages as any[]).filter(m => m.media_type === "image" || m.media_type === "video");
  const fileItems = (messages as any[]).filter(m => m.media_type === "file" || m.media_type === "audio");
  const linkItems = (messages as any[]).filter(m => !m.media_url && m.content?.match(/https?:\/\//));

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "media", label: "Media", count: mediaItems.length },
    { key: "files", label: "Files", count: fileItems.length },
    { key: "links", label: "Links", count: linkItems.length },
  ];

  const activeData = tab === "media" ? mediaItems : tab === "files" ? fileItems : linkItems;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Shared Content</Text>
          <Text style={styles.headerSub}>{params.peerName ?? "Chat"}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, tab === t.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, tab === t.key && { color: C.primary }]}>{t.count}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>
      ) : activeData.length === 0 ? (
        <View style={styles.center}>
          <Feather name={tab === "media" ? "image" : tab === "files" ? "file" : "link"} size={40} color={C.textDim} />
          <Text style={styles.emptyLabel}>
            {tab === "media" ? "No shared media yet" : tab === "files" ? "No shared files yet" : "No shared links yet"}
          </Text>
        </View>
      ) : tab === "media" ? (
        <FlatList
          data={mediaItems}
          keyExtractor={(m: any) => m.id}
          numColumns={3}
          contentContainerStyle={{ gap: 2 }}
          columnWrapperStyle={{ gap: 2 }}
          renderItem={({ item: m }: any) => (
            <Pressable
              onPress={() => setPreview({ uri: resolveMediaUrl(m.media_url), type: m.media_type })}
              style={styles.thumb}
            >
              {m.media_type === "image" ? (
                <Image source={{ uri: resolveMediaUrl(m.media_url) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: C.surfaceHigh, alignItems: "center", justifyContent: "center" }]}>
                  <Feather name="play-circle" size={32} color={C.primary} />
                </View>
              )}
              {m.media_type === "video" && (
                <View style={styles.videoOverlay}>
                  <Feather name="play" size={11} color="#fff" />
                </View>
              )}
            </Pressable>
          )}
        />
      ) : tab === "files" ? (
        <FlatList
          data={fileItems}
          keyExtractor={(m: any) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item: m }: any) => (
            <View style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <Feather name={m.media_type === "audio" ? "music" : "file"} size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>{m.media_url?.split("/").pop() ?? "file"}</Text>
                <Text style={styles.fileMeta}>{timeAgo(m.created_at)}</Text>
              </View>
              <Feather name="download" size={18} color={C.textDim} />
            </View>
          )}
        />
      ) : (
        <FlatList
          data={linkItems}
          keyExtractor={(m: any) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item: m }: any) => {
            const url = m.content?.match(/https?:\/\/[^\s]+/)?.[0] ?? "";
            return (
              <View style={styles.fileRow}>
                <View style={styles.fileIcon}>
                  <Feather name="link-2" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkUrl} numberOfLines={1}>{url}</Text>
                  <Text style={styles.fileMeta}>{timeAgo(m.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Fullscreen preview */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewOverlay}>
          <Pressable style={styles.previewClose} onPress={() => setPreview(null)}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          {preview?.type === "image" ? (
            <Image source={{ uri: preview.uri }} style={styles.previewMedia} resizeMode="contain" />
          ) : preview?.type === "video" ? (
            <Video
              source={{ uri: preview.uri }}
              style={styles.previewMedia}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              useNativeControls
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: C.text, letterSpacing: -0.2 },
  headerSub: { fontSize: 12, color: C.textDim, marginTop: 1 },
  tabs: {
    flexDirection: "row", backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: C.primary },
  tabLabel: { fontSize: 14, fontWeight: "600", color: C.textDim },
  tabLabelActive: { color: C.primary },
  tabBadge: { backgroundColor: C.surfaceHigh, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: C.primary + "22" },
  tabBadgeText: { fontSize: 11, fontWeight: "700", color: C.textDim },
  thumb: { width: THUMB, height: THUMB, backgroundColor: C.surfaceHigh },
  videoOverlay: {
    position: "absolute", bottom: 5, right: 5,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 3,
  },
  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  fileIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: C.primary + "18", alignItems: "center", justifyContent: "center",
  },
  fileName: { fontSize: 14, fontWeight: "600", color: C.text },
  linkUrl: { fontSize: 13, color: C.primary, fontWeight: "500" },
  fileMeta: { fontSize: 11, color: C.textDim, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyLabel: { fontSize: 15, color: C.textDim, fontWeight: "500" },
  previewOverlay: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  previewClose: {
    position: "absolute", top: 52, right: 20, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  previewMedia: { width: "100%", height: "80%" },
});
