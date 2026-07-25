import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  TextInput, Alert, Image, Modal, ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { resolveMediaUrl, timeAgo, formatCount } from "@/lib/db";

type ChannelPost = {
  id: string; content: string; media_urls: string[]; created_at: string;
  likes_count: number; author_id: string; profiles?: { display_name: string; avatar_url: string | null; username: string };
};

type ChannelInfo = {
  id: string; name: string | null; description?: string | null;
  created_by: string; subscriber_count?: number;
};

function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !err) {
    return <Image source={{ uri: resolveMediaUrl(avatarUrl) }}
      style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setErr(true)} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},55%,45%)`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

function ChannelInfoSheet({ visible, onClose, channel, isOwner, colors }:
  { visible: boolean; onClose: () => void; channel: ChannelInfo | null; isOwner: boolean; colors: any }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: insets.top + 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800" }}>Channel Info</Text>
          <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={colors.foreground} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Feather name="hash" size={32} color="#fff" />
            </LinearGradient>
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800" }}>{channel?.name ?? "Channel"}</Text>
            {channel?.description && (
              <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 }}>{channel.description}</Text>
            )}
          </View>
          <View style={[{ borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth }, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Subscribers</Text>
            <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "800" }}>{formatCount(channel?.subscriber_count ?? 0)}</Text>
          </View>
          {isOwner && (
            <View style={[{ borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth }, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Owner Controls</Text>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>You own this channel. Use the post button to publish announcements.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    supabase.from("conversations").select("id, name, created_by").eq("id", channelId).single()
      .then(({ data }) => { if (data) setChannel(data as ChannelInfo); });
    if (user?.id) {
      supabase.from("conversation_members").select("user_id").eq("conversation_id", channelId).eq("user_id", user.id).maybeSingle()
        .then(({ data }) => setIsSubscribed(!!data));
    }
  }, [channelId, user?.id]);

  const { data: posts = [], isLoading, refetch } = useQuery({
    queryKey: ["channel-posts", channelId],
    queryFn: async () => {
      const { data } = await supabase.from("posts").select("*, profiles(*)")
        .eq("author_id", channel?.created_by ?? "").eq("visibility", "public")
        .order("created_at", { ascending: false }).limit(30);
      return (data ?? []) as ChannelPost[];
    },
    enabled: !!channel?.created_by,
  });

  const handleSubscribe = async () => {
    if (!user?.id || !channelId) return;
    setSubscribing(true);
    try {
      if (isSubscribed) {
        await supabase.from("conversation_members").delete().eq("conversation_id", channelId).eq("user_id", user.id);
        setIsSubscribed(false);
      } else {
        await supabase.from("conversation_members").upsert({ conversation_id: channelId, user_id: user.id });
        setIsSubscribed(true);
      }
    } finally { setSubscribing(false); }
  };

  const handlePost = async () => {
    if (!postText.trim() || !user?.id) return;
    setPosting(true);
    try {
      await supabase.from("posts").insert({ author_id: user.id, content: postText.trim(), visibility: "public", is_reel: false, media_urls: [], likes_count: 0, comments_count: 0, shares_count: 0, views_count: 0 });
      setPostText("");
      setPostModalOpen(false);
      qc.invalidateQueries({ queryKey: ["channel-posts", channelId] });
      refetch();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setPosting(false); }
  };

  const isOwner = channel?.created_by === user?.id;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <Pressable onPress={() => setInfoOpen(true)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }}>
            <Feather name="hash" size={16} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>{channel?.name ?? "Channel"}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Tap for info</Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {isOwner && (
            <Pressable onPress={() => setPostModalOpen(true)} style={[styles.subBtn, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Post</Text>
            </Pressable>
          )}
          {!isOwner && (
            <Pressable onPress={handleSubscribe} disabled={subscribing}
              style={[styles.subBtn, { backgroundColor: isSubscribed ? colors.secondary : colors.primary, borderWidth: isSubscribed ? 1 : 0, borderColor: colors.border }]}>
              {subscribing ? <ActivityIndicator size="small" color={isSubscribed ? colors.foreground : "#fff"} /> : (
                <Text style={{ color: isSubscribed ? colors.foreground : "#fff", fontWeight: "700", fontSize: 13 }}>
                  {isSubscribed ? "Subscribed" : "Subscribe"}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={posts as ChannelPost[]}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={styles.empty}>
              <LinearGradient colors={[colors.primary + "22", colors.primary + "08"]}
                style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Feather name="hash" size={36} color={colors.primary} />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No announcements yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                {isOwner ? "Post your first announcement!" : "Subscribe to get notified when the owner posts"}
              </Text>
            </View>
          }
          renderItem={({ item: p }) => {
            const profile = p.profiles;
            return (
              <Pressable onPress={() => router.push(`/post/${p.id}` as any)}
                style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.postHeader}>
                  <Avatar name={profile?.display_name ?? "U"} avatarUrl={profile?.avatar_url} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.postAuthor, { color: colors.foreground }]}>{profile?.display_name ?? "Channel"}</Text>
                    <Text style={[styles.postTime, { color: colors.mutedForeground }]}>{timeAgo(p.created_at)}</Text>
                  </View>
                  <View style={[styles.announceBadge, { backgroundColor: colors.primary + "18" }]}>
                    <Feather name="radio" size={10} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>ANNOUNCEMENT</Text>
                  </View>
                </View>
                {!!p.content && <Text style={[styles.postContent, { color: colors.foreground }]}>{p.content}</Text>}
                {p.media_urls?.[0] && (
                  <Image source={{ uri: resolveMediaUrl(p.media_urls[0]) }} style={styles.postMedia} resizeMode="cover" />
                )}
                <View style={styles.postFooter}>
                  <Feather name="heart" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.postStat, { color: colors.mutedForeground }]}>{formatCount(p.likes_count)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Post announcement modal */}
      <Modal visible={postModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPostModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: insets.top + 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setPostModalOpen(false)} hitSlop={8}><Feather name="x" size={20} color={colors.foreground} /></Pressable>
            <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700" }}>New Announcement</Text>
            <Pressable onPress={handlePost} disabled={!postText.trim() || posting}
              style={{ backgroundColor: postText.trim() ? colors.primary : colors.muted, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 }}>
              {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Post</Text>}
            </Pressable>
          </View>
          <TextInput
            style={{ flex: 1, padding: 20, fontSize: 16, color: colors.foreground, textAlignVertical: "top" }}
            placeholder="Write your announcement..."
            placeholderTextColor={colors.mutedForeground}
            value={postText} onChangeText={setPostText}
            multiline autoFocus
          />
        </View>
      </Modal>

      <ChannelInfoSheet visible={infoOpen} onClose={() => setInfoOpen(false)} channel={channel} isOwner={isOwner} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { fontSize: 16, fontWeight: "700" },
  subBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 40 },
  postCard: { margin: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", padding: 14 },
  postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  postAuthor: { fontSize: 14, fontWeight: "700" },
  postTime: { fontSize: 12, marginTop: 1 },
  announceBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  postContent: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  postMedia: { width: "100%", height: 200, borderRadius: 10, marginBottom: 10 },
  postFooter: { flexDirection: "row", alignItems: "center", gap: 5 },
  postStat: { fontSize: 13, fontWeight: "600" },
});
