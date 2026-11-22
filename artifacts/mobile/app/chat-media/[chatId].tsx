import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { resolveMediaUrl, timeAgo } from "@/lib/db";
import { useColors } from "@/hooks/useColors";
import { GlassSurface } from "@/components/GlassSurface";
import { useToast } from "@/components/Toast";
import { RADIUS } from "@/constants/colors";
import { haptics } from "@/lib/motion";

type Tab = "media" | "files" | "links";

export default function ChatMediaScreen() {
  const { chatId, peerName } = useLocalSearchParams<{
    chatId: string;
    peerName?: string;
  }>();
  const colors = useColors();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [tab, setTab] = useState<Tab>("media");
  const [preview, setPreview] = useState<{
    uri: string;
    type: "image" | "video";
  } | null>(null);

  const isDesktop = width >= 768;
  const colWidth = Math.min(width, 720);
  const cols = isDesktop ? 4 : 3;
  const thumbSize = Math.floor((colWidth - (cols - 1) * 2) / cols);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-media-messages", chatId],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, media_url, media_type, content, created_at")
        .eq("conversation_id", chatId as string)
        .eq("is_deleted", false)
        .or("media_url.not.is.null,content.ilike.%http%")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!chatId,
  });

  const rows = messages as any[];
  const mediaItems = rows.filter(
    (m) => m.media_type === "image" || m.media_type === "video",
  );
  const fileItems = rows.filter(
    (m) => m.media_type === "file" || m.media_type === "audio",
  );
  const linkItems = rows.filter(
    (m) => typeof m.content === "string" && /https?:\/\/[^\s]+/i.test(m.content),
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "media", label: "Media", count: mediaItems.length },
    { key: "files", label: "Files", count: fileItems.length },
    { key: "links", label: "Links", count: linkItems.length },
  ];

  const activeData =
    tab === "media" ? mediaItems : tab === "files" ? fileItems : linkItems;

  const openExternalUrl = async (rawUrl: string) => {
    if (!rawUrl) return;
    try {
      await Linking.openURL(rawUrl);
    } catch {
      showToast("Unable to open link", "error");
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgCanvas }]}>
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
        <View style={[styles.headerInner, { maxWidth: 720 }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={24} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Shared Content
            </Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              {peerName ?? "Conversation"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.tabsRow,
            { maxWidth: 720, borderTopColor: colors.separator },
          ]}
        >
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  haptics.selection();
                  setTab(t.key);
                }}
                style={[
                  styles.tab,
                  active && {
                    borderBottomColor: colors.accentPrimary,
                  },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${t.label} (${t.count})`}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: active
                        ? colors.accentPrimary
                        : colors.textSecondary,
                      fontWeight: active ? "700" : "500",
                    },
                  ]}
                >
                  {t.label}
                </Text>
                {t.count > 0 && (
                  <Text
                    style={[
                      styles.tabCount,
                      {
                        color: active
                          ? colors.accentPrimary
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    {t.count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>

      <View style={[styles.bodyWrap, { maxWidth: 720 }]}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accentPrimary} size="large" />
          </View>
        ) : activeData.length === 0 ? (
          <View style={styles.center}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: colors.bgElevated, borderColor: colors.separator },
              ]}
            >
              <Feather
                name={tab === "media" ? "image" : tab === "files" ? "file" : "link"}
                size={30}
                color={colors.textTertiary}
              />
            </View>
            <Text style={[styles.emptyLabel, { color: colors.textSecondary }]}>
              {tab === "media"
                ? "No shared media yet"
                : tab === "files"
                ? "No shared files yet"
                : "No shared links yet"}
            </Text>
          </View>
        ) : tab === "media" ? (
          <FlatList
            key={`grid-${cols}`}
            data={mediaItems}
            keyExtractor={(m: any) => m.id}
            numColumns={cols}
            contentContainerStyle={{ gap: 2, paddingBottom: insets.bottom + 24 }}
            columnWrapperStyle={{ gap: 2 }}
            renderItem={({ item: m }: any) => (
              <Pressable
                onPress={() =>
                  setPreview({
                    uri: resolveMediaUrl(m.media_url),
                    type: m.media_type,
                  })
                }
                style={[
                  styles.thumb,
                  {
                    width: thumbSize,
                    height: thumbSize,
                    backgroundColor: colors.bgElevated,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  m.media_type === "video" ? "Preview video" : "Preview image"
                }
              >
                {m.media_type === "image" ? (
                  <Image
                    source={{ uri: resolveMediaUrl(m.media_url) }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        backgroundColor: colors.bgElevated,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Feather
                      name="play-circle"
                      size={30}
                      color={colors.accentPrimary}
                    />
                  </View>
                )}
                {m.media_type === "video" && (
                  <View style={styles.videoOverlay}>
                    <Feather name="play" size={11} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            )}
          />
        ) : tab === "files" ? (
          <FlatList
            data={fileItems}
            keyExtractor={(m: any) => m.id}
            contentContainerStyle={{
              padding: 16,
              gap: 10,
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item: m }: any) => {
              const fileUrl = resolveMediaUrl(m.media_url);
              const fileName = m.media_url?.split("/").pop() ?? "file";
              return (
                <Pressable
                  onPress={() => openExternalUrl(fileUrl)}
                  style={({ pressed }) => [
                    styles.fileRow,
                    {
                      backgroundColor: colors.bgElevated,
                      borderColor: colors.separator,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Download ${fileName}`}
                >
                  <View
                    style={[
                      styles.fileIcon,
                      { backgroundColor: colors.accentTint },
                    ]}
                  >
                    <Feather
                      name={m.media_type === "audio" ? "music" : "file"}
                      size={20}
                      color={colors.accentPrimary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.fileName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {fileName}
                    </Text>
                    <Text
                      style={[styles.fileMeta, { color: colors.textSecondary }]}
                    >
                      {timeAgo(m.created_at)}
                    </Text>
                  </View>
                  <View style={styles.actionHit}>
                    <Feather
                      name="download"
                      size={18}
                      color={colors.accentPrimary}
                    />
                  </View>
                </Pressable>
              );
            }}
          />
        ) : (
          <FlatList
            data={linkItems}
            keyExtractor={(m: any) => m.id}
            contentContainerStyle={{
              padding: 16,
              gap: 10,
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item: m }: any) => {
              const url = m.content?.match(/https?:\/\/[^\s]+/i)?.[0] ?? "";
              return (
                <Pressable
                  onPress={() => openExternalUrl(url)}
                  style={({ pressed }) => [
                    styles.fileRow,
                    {
                      backgroundColor: colors.bgElevated,
                      borderColor: colors.separator,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="link"
                  accessibilityLabel={`Open link ${url}`}
                >
                  <View
                    style={[
                      styles.fileIcon,
                      { backgroundColor: colors.accentTint },
                    ]}
                  >
                    <Feather
                      name="link-2"
                      size={20}
                      color={colors.accentPrimary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.linkUrl, { color: colors.accentPrimary }]}
                      numberOfLines={1}
                    >
                      {url}
                    </Text>
                    <Text
                      style={[styles.fileMeta, { color: colors.textSecondary }]}
                    >
                      {timeAgo(m.created_at)}
                    </Text>
                  </View>
                  <View style={styles.actionHit}>
                    <Feather
                      name="external-link"
                      size={17}
                      color={colors.textSecondary}
                    />
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.previewOverlay}>
          <Pressable
            style={[styles.previewClose, { top: Math.max(insets.top + 12, 24) }]}
            onPress={() => setPreview(null)}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
          {preview?.type === "image" ? (
            <Image
              source={{ uri: preview.uri }}
              style={styles.previewMedia}
              resizeMode="contain"
            />
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
  screen: { flex: 1 },
  headerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInner: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 12.5,
    marginTop: 1,
  },
  tabsRow: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontSize: 14,
  },
  tabCount: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  bodyWrap: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  thumb: {
    position: "relative",
    overflow: "hidden",
  },
  videoOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 14.5, fontWeight: "600" },
  linkUrl: { fontSize: 13.5, fontWeight: "500" },
  fileMeta: { fontSize: 12, marginTop: 2 },
  actionHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLabel: { fontSize: 15, fontWeight: "500" },
  previewOverlay: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
  },
  previewClose: {
    position: "absolute",
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewMedia: { width: "100%", height: "80%" },
});
