import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AntDesign, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { RADIUS, TYPE } from "@/constants/colors";
import {
  acceptJoinRequest,
  endLiveSession,
  fetchJoinRequests,
  fetchLiveMessages,
  fetchLiveSessions,
  fetchLiveViewers,
  formatCount,
  hasLikedLiveSession,
  joinLiveSession,
  leaveLiveSession,
  likeLiveSession,
  rejectJoinRequest,
  requestToJoinLive,
  sendLiveMessage,
  startLiveSession,
  timeAgo,
  unlikeLiveSession,
  updateLiveSessionState,
  type LiveJoinRequest,
  type LiveMessage,
  type LiveSession,
  type LiveViewer,
  type Profile,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/Avatar";
import { GlassSurface } from "@/components/GlassSurface";
import { ActionSheet } from "@/components/ActionSheet";
import { useToast } from "@/components/Toast";

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "👏", "😍", "🎉", "💯", "🤩"];

type FloatingItem = { id: number; emoji: string; x: number };

function FloatingReaction({
  item,
  onDone,
}: {
  item: FloatingItem;
  onDone: (id: number) => void;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 14,
      }),
      Animated.timing(y, {
        toValue: -220,
        duration: 2200,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => onDone(item.id));
  }, [item.id, onDone, opacity, scale, y]);

  return (
    <Animated.Text
      style={{
        position: "absolute",
        bottom: 0,
        left: item.x,
        fontSize: 34,
        opacity,
        transform: [{ translateY: y }, { scale }],
        pointerEvents: "none" as any,
      }}
    >
      {item.emoji}
    </Animated.Text>
  );
}

function FloatingHeart({ onDone }: { onDone: () => void }) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const x = useRef((Math.random() - 0.5) * 46).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60 }),
      Animated.timing(y, {
        toValue: -160,
        duration: 1800,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ]).start(onDone);
  }, [onDone, opacity, scale, y]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 84,
        right: 24,
        transform: [{ translateY: y }, { translateX: x }, { scale }],
        opacity,
        pointerEvents: "none" as any,
      }}
    >
      <AntDesign name="heart" size={28} color="#FF3B5C" />
    </Animated.View>
  );
}

function StageVisual({
  host,
  isHost,
  isCameraOn,
}: {
  host?: Profile;
  isHost: boolean;
  isCameraOn: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (isHost && isCameraOn && !showCamera) {
      (async () => {
        if (permission?.granted) {
          setShowCamera(true);
        } else if (!permission) {
          const result = await requestPermission();
          if (result.granted) setShowCamera(true);
        }
      })();
    }
  }, [isHost, isCameraOn, permission, requestPermission, showCamera]);

  if (Platform.OS !== "web" && isHost && isCameraOn && showCamera && permission?.granted) {
    return <CameraView style={StyleSheet.absoluteFill} facing="front" />;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#160B2E", "#241447", "#0D0D14"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={LS.audioStageCenter}>
        <Avatar
          name={host?.display_name ?? "Host"}
          avatarUrl={host?.avatar_url}
          size={104}
          ringColors={["#8B5CF6", "#EC4899", "#F59E0B"]}
          canvasColor="#1B1033"
        />
        <Text style={LS.stageHostName}>{host?.display_name ?? "Host"}</Text>
        <Text style={LS.stageSubtitle}>
          {isHost
            ? !isCameraOn
              ? "Camera off · Audio stage"
              : Platform.OS === "web"
              ? "Audio & Live Chat Stage"
              : permission?.granted === false
              ? "Camera permission denied · Audio stage"
              : "Audio & Live Chat Stage"
            : "Audio & Live Chat Stage"}
        </Text>
        {Platform.OS !== "web" &&
          isHost &&
          isCameraOn &&
          permission?.granted !== false && (
            <Pressable
              onPress={async () => {
                const res = await requestPermission();
                if (res.granted) setShowCamera(true);
              }}
              style={LS.enableCamBtn}
              accessibilityRole="button"
              accessibilityLabel="Enable camera preview"
            >
              <Feather name="video" size={15} color="#FFFFFF" />
              <Text style={LS.enableCamText}>Enable Camera</Text>
            </Pressable>
          )}
      </View>
    </View>
  );
}

function LiveStreamModal({
  session,
  onClose,
  userId,
  isHost,
}: {
  session: LiveSession;
  onClose: () => void;
  userId: string;
  isHost: boolean;
}) {
  const { showToast } = useToast();
  const { width: winW, height: winH } = useWindowDimensions();
  const stageWidth = Platform.OS === "web" ? Math.min(winW, 480) : winW;

  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const [reactions, setReactions] = useState<FloatingItem[]>([]);
  const [hearts, setHearts] = useState<number[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(session.likes_count);
  const [showEmojiBar, setShowEmojiBar] = useState(true);
  const [showViewersList, setShowViewersList] = useState(false);
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(session.is_camera_on);
  const [isMicOn, setIsMicOn] = useState(session.is_mic_on);
  const [viewers, setViewers] = useState<LiveViewer[]>([]);
  const [joinRequests, setJoinRequests] = useState<LiveJoinRequest[]>([]);

  const flatRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const nextId = useRef(0);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["live-messages", session.id],
    queryFn: () => fetchLiveMessages(session.id),
    refetchInterval: 2500,
  });

  const { data: liveData } = useQuery({
    queryKey: ["live-session", session.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("live_sessions")
        .select("*, profiles(*)")
        .eq("id", session.id)
        .single();
      return data as LiveSession | null;
    },
    refetchInterval: 4000,
  });

  const { data: liked } = useQuery({
    queryKey: ["live-liked", session.id, userId],
    queryFn: () => hasLikedLiveSession(userId, session.id),
    enabled: !!userId && !isHost,
  });

  useEffect(() => {
    if (liked !== undefined) setIsLiked(liked);
  }, [liked]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.35,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const ch = supabase
      .channel(`live-chat-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_messages",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["live-messages", session.id] });
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, session.id]);

  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(async () => {
      const reqs = await fetchJoinRequests(session.id);
      setJoinRequests(reqs);
    }, 3000);
    return () => clearInterval(interval);
  }, [isHost, session.id]);

  const handleSend = async () => {
    if (!chatText.trim() || !userId) return;
    setSending(true);
    const text = chatText.trim();
    setChatText("");
    try {
      await sendLiveMessage(session.id, userId, text);
      qc.invalidateQueries({ queryKey: ["live-messages", session.id] });
    } catch {
      setChatText(text);
    } finally {
      setSending(false);
    }
  };

  const sendEmoji = async (emoji: string) => {
    const id = nextId.current++;
    setReactions((prev) => [
      ...prev,
      { id, emoji, x: 32 + Math.random() * Math.max(120, stageWidth - 110) },
    ]);
    if (userId) {
      try {
        await sendLiveMessage(session.id, userId, emoji);
        qc.invalidateQueries({ queryKey: ["live-messages", session.id] });
      } catch {}
    }
  };

  const handleLike = async () => {
    if (!userId || isHost) return;
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 80 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 80 }),
    ]).start();
    const id = Date.now();
    setHearts((prev) => [...prev, id]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h !== id)), 2400);
    if (isLiked) {
      await unlikeLiveSession(userId, session.id);
      setIsLiked(false);
      setLikesCount((c) => Math.max(0, c - 1));
    } else {
      await likeLiveSession(userId, session.id);
      setIsLiked(true);
      setLikesCount((c) => c + 1);
    }
  };

  const handleCameraToggle = async () => {
    const newState = !isCameraOn;
    setIsCameraOn(newState);
    await updateLiveSessionState(session.id, { is_camera_on: newState });
  };

  const handleMicToggle = async () => {
    const newState = !isMicOn;
    setIsMicOn(newState);
    await updateLiveSessionState(session.id, { is_mic_on: newState });
  };

  const handleShowViewers = async () => {
    const viewerList = await fetchLiveViewers(session.id);
    setViewers(viewerList);
    setShowViewersList(true);
  };

  const handleRequestJoin = async () => {
    if (!userId) {
      showToast("Sign in to request to join", "info");
      return;
    }
    try {
      await requestToJoinLive(userId, session.id);
      showToast("Join request sent to host", "success");
    } catch (e: any) {
      showToast(e?.message ?? "Could not send join request", "error");
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    await acceptJoinRequest(requestId, session.id);
    setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const handleRejectRequest = async (requestId: string) => {
    await rejectJoinRequest(requestId, session.id);
    setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join "${session.title}" live on Vibe`,
      });
    } catch {
      showToast("Live stream link ready to share", "info");
    }
  };

  const removeReaction = useCallback((id: number) => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const host = (liveData?.profiles ?? session.profiles) as Profile | undefined;
  const viewerCount = liveData?.viewers_count ?? session.viewers_count;

  return (
    <View style={LS.stageBackdrop}>
      <View
        style={[
          LS.stageFrame,
          Platform.OS === "web" && {
            maxWidth: 480,
            maxHeight: Math.min(winH - 32, 860),
            borderRadius: RADIUS.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "rgba(255,255,255,0.14)",
            overflow: "hidden",
          },
        ]}
      >
        <StageVisual host={host} isHost={isHost} isCameraOn={isCameraOn} />

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.68)", "rgba(0,0,0,0.92)"]}
          style={[StyleSheet.absoluteFill, { top: "45%", pointerEvents: "none" } as any]}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "transparent"]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 132,
            pointerEvents: "none",
          } as any}
        />

        <View
          style={[
            LS.liveHeader,
            { paddingTop: Platform.OS === "web" ? 14 : insets.top + 10 },
          ]}
        >
          <Pressable
            onPress={onClose}
            style={LS.liveBackBtn}
            accessibilityRole="button"
            accessibilityLabel={isHost ? "End stream" : "Leave stream"}
          >
            <Feather name="chevron-down" size={26} color="#FFFFFF" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={LS.liveTitle} numberOfLines={1}>
              {session.title}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <Avatar
                name={host?.display_name ?? "Host"}
                avatarUrl={host?.avatar_url}
                size={18}
                canvasColor="#1B1033"
              />
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
                {host?.display_name ?? "Host"} {isHost ? "(You)" : ""}
              </Text>
            </View>
          </View>
          <View style={LS.liveStatsRow}>
            <Animated.View
              style={[LS.liveDotBadge, { transform: [{ scale: pulseAnim }] }]}
            />
            <Text style={LS.liveLabel}>LIVE</Text>
            <Pressable
              onPress={handleShowViewers}
              style={LS.viewerBadge}
              accessibilityRole="button"
              accessibilityLabel={`${viewerCount} viewers`}
            >
              <Feather name="eye" size={12} color="#FFFFFF" />
              <Text style={[LS.viewerCount, TYPE.tabular]}>
                {formatCount(viewerCount)}
              </Text>
            </Pressable>
            {isHost && joinRequests.length > 0 && (
              <Pressable
                onPress={() => setShowJoinRequests(true)}
                style={LS.viewerBadge}
                accessibilityRole="button"
                accessibilityLabel={`${joinRequests.length} join requests`}
              >
                <Feather name="users" size={12} color="#FBBF24" />
                <Text style={[LS.viewerCount, TYPE.tabular, { color: "#FBBF24" }]}>
                  {joinRequests.length}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={LS.likesContainer}>
          <Pressable
            onPress={isHost ? undefined : handleLike}
            style={LS.likeBtn}
            accessibilityRole="button"
            accessibilityLabel="Like live stream"
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <AntDesign
                name={(isLiked ? "heart" : "hearto") as any}
                size={28}
                color={isLiked ? "#FF3B5C" : "#FFFFFF"}
              />
            </Animated.View>
          </Pressable>
          <Text style={[LS.likesCountText, TYPE.tabular]}>
            {formatCount(likesCount)}
          </Text>
        </View>

        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}>
          {reactions.map((r) => (
            <FloatingReaction key={r.id} item={r} onDone={removeReaction} />
          ))}
          {hearts.map((id) => (
            <FloatingHeart
              key={id}
              onDone={() => setHearts((prev) => prev.filter((h) => h !== id))}
            />
          ))}
        </View>

        {isHost && (
          <View
            style={[
              LS.hostControls,
              { bottom: (Platform.OS === "web" ? 16 : insets.bottom + 12) + 120 },
            ]}
          >
            <Pressable
              onPress={handleCameraToggle}
              style={[LS.hostControlBtn, !isCameraOn && LS.hostControlBtnOff]}
              accessibilityRole="button"
              accessibilityLabel={isCameraOn ? "Turn camera off" : "Turn camera on"}
            >
              <Feather
                name={isCameraOn ? "camera" : "camera-off"}
                size={18}
                color={isCameraOn ? "#FFFFFF" : "#FB7185"}
              />
              <Text
                style={[
                  LS.hostControlLabel,
                  !isCameraOn && { color: "#FB7185" },
                ]}
              >
                {isCameraOn ? "Camera" : "Cam Off"}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleMicToggle}
              style={[LS.hostControlBtn, !isMicOn && LS.hostControlBtnOff]}
              accessibilityRole="button"
              accessibilityLabel={isMicOn ? "Mute microphone" : "Unmute microphone"}
            >
              <Feather
                name={isMicOn ? "mic" : "mic-off"}
                size={18}
                color={isMicOn ? "#FFFFFF" : "#FB7185"}
              />
              <Text
                style={[LS.hostControlLabel, !isMicOn && { color: "#FB7185" }]}
              >
                {isMicOn ? "Mic" : "Muted"}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleShowViewers}
              style={LS.hostControlBtn}
              accessibilityRole="button"
              accessibilityLabel="Viewers list"
            >
              <Feather name="users" size={18} color="#FFFFFF" />
              <Text style={LS.hostControlLabel}>Viewers</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={LS.endLiveBtn}
              accessibilityRole="button"
              accessibilityLabel="End live stream"
            >
              <View style={LS.endLiveDot} />
              <Text style={LS.endLiveText}>END</Text>
            </Pressable>
          </View>
        )}

        <KeyboardAvoidingView
          style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[LS.liveChatWrap, { pointerEvents: "box-none" } as any]}>
            {!isLoading && (
              <FlatList
                ref={flatRef}
                data={messages as LiveMessage[]}
                keyExtractor={(m) => m.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 5, paddingBottom: 6 }}
                onContentSizeChange={() =>
                  flatRef.current?.scrollToEnd({ animated: false })
                }
                renderItem={({ item: m }) => {
                  const p = m.profiles as Profile | undefined;
                  const isEmoji = /^\p{Emoji}+$/u.test(m.content?.trim() ?? "");
                  if (isEmoji) {
                    return (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingLeft: 4,
                        }}
                      >
                        <Avatar
                          name={p?.username ?? "U"}
                          avatarUrl={p?.avatar_url}
                          size={18}
                          canvasColor="#1B1033"
                        />
                        <Text style={{ fontSize: 20 }}>{m.content}</Text>
                      </View>
                    );
                  }
                  return (
                    <View style={LS.liveChatMsg}>
                      <View style={LS.liveChatBubble}>
                        <Text style={LS.liveChatUser}>
                          {p?.username ?? "user"}{" "}
                        </Text>
                        <Text style={LS.liveChatText}>{m.content}</Text>
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>

          {showEmojiBar && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={LS.emojiBar}
              style={LS.emojiBarWrap}
            >
              {QUICK_EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => sendEmoji(e)}
                  style={LS.emojiBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${e} reaction`}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View
            style={[
              LS.liveChatInput,
              { paddingBottom: Platform.OS === "web" ? 12 : insets.bottom + 10 },
            ]}
          >
            <Pressable
              onPress={() => setShowEmojiBar((e) => !e)}
              style={LS.emojiToggle}
              accessibilityRole="button"
              accessibilityLabel="Toggle reaction bar"
            >
              <Text style={{ fontSize: 20 }}>😊</Text>
            </Pressable>
            <TextInput
              style={LS.liveChatField}
              placeholder="Say something..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={chatText}
              onChangeText={setChatText}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              accessibilityLabel="Live chat message"
            />
            {chatText.trim() ? (
              <Pressable
                onPress={handleSend}
                disabled={sending}
                style={LS.liveSendBtn}
                accessibilityRole="button"
                accessibilityLabel="Send chat message"
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Feather name="send" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            ) : (
              <>
                {!isHost && (
                  <Pressable
                    onPress={handleRequestJoin}
                    style={LS.liveRequestBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Request to join stream"
                  >
                    <Feather name="user-plus" size={18} color="#FFFFFF" />
                  </Pressable>
                )}
                <Pressable
                  onPress={handleShare}
                  style={LS.liveShareBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Share stream"
                >
                  <Feather name="share" size={18} color="#FFFFFF" />
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={showViewersList}
          transparent
          animationType="slide"
          onRequestClose={() => setShowViewersList(false)}
        >
          <View style={LS.modalOverlay}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setShowViewersList(false)}
            />
            <View
              style={[LS.modalContent, { paddingBottom: insets.bottom + 20 }]}
            >
              <View style={LS.modalHeader}>
                <Text style={LS.modalTitle}>
                  Live Viewers ({viewers.length})
                </Text>
                <Pressable
                  onPress={() => setShowViewersList(false)}
                  style={LS.modalCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close viewers list"
                >
                  <Feather name="x" size={22} color="#FFFFFF" />
                </Pressable>
              </View>
              <FlatList
                data={viewers}
                keyExtractor={(v) => v.id}
                contentContainerStyle={{ padding: 16, gap: 10 }}
                renderItem={({ item: v }) => {
                  const profile = v.profiles as Profile | undefined;
                  return (
                    <View style={LS.viewerItem}>
                      <Avatar
                        name={profile?.display_name ?? "User"}
                        avatarUrl={profile?.avatar_url}
                        size={40}
                        canvasColor="#111116"
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontSize: 15,
                            fontWeight: "600",
                          }}
                        >
                          {profile?.display_name ?? "User"}
                        </Text>
                        <Text
                          style={{
                            color: "rgba(255,255,255,0.55)",
                            fontSize: 12,
                          }}
                        >
                          @{profile?.username ?? "user"}
                        </Text>
                      </View>
                    </View>
                  );
                }}
              />
            </View>
          </View>
        </Modal>

        <Modal
          visible={showJoinRequests}
          transparent
          animationType="slide"
          onRequestClose={() => setShowJoinRequests(false)}
        >
          <View style={LS.modalOverlay}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setShowJoinRequests(false)}
            />
            <View
              style={[LS.modalContent, { paddingBottom: insets.bottom + 20 }]}
            >
              <View style={LS.modalHeader}>
                <Text style={LS.modalTitle}>
                  Join Requests ({joinRequests.length})
                </Text>
                <Pressable
                  onPress={() => setShowJoinRequests(false)}
                  style={LS.modalCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close join requests"
                >
                  <Feather name="x" size={22} color="#FFFFFF" />
                </Pressable>
              </View>
              {joinRequests.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 40,
                  }}
                >
                  <Feather
                    name="user-x"
                    size={42}
                    color="rgba(255,255,255,0.25)"
                  />
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      marginTop: 12,
                      fontSize: 15,
                    }}
                  >
                    No pending requests
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={joinRequests}
                  keyExtractor={(r) => r.id}
                  contentContainerStyle={{ padding: 16, gap: 10 }}
                  renderItem={({ item: r }) => {
                    const profile = r.profiles as Profile | undefined;
                    return (
                      <View style={LS.requestItem}>
                        <Avatar
                          name={profile?.display_name ?? "User"}
                          avatarUrl={profile?.avatar_url}
                          size={44}
                          canvasColor="#111116"
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontSize: 15,
                              fontWeight: "600",
                            }}
                          >
                            {profile?.display_name ?? "User"}
                          </Text>
                          <Text
                            style={{
                              color: "rgba(255,255,255,0.55)",
                              fontSize: 13,
                            }}
                          >
                            Wants to join your live
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => handleAcceptRequest(r.id)}
                          style={LS.acceptBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Accept join request"
                        >
                          <Feather name="check" size={18} color="#FFFFFF" />
                        </Pressable>
                        <Pressable
                          onPress={() => handleRejectRequest(r.id)}
                          style={LS.rejectBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Reject join request"
                        >
                          <Feather name="x" size={18} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

export default function LiveSessionsScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [liveTitle, setLiveTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  const [watchingSession, setWatchingSession] = useState<LiveSession | null>(
    null,
  );
  const [endConfirmSessionId, setEndConfirmSessionId] = useState<string | null>(
    null,
  );
  const [showEndedViewers, setShowEndedViewers] = useState(false);
  const [endedViewers, setEndedViewers] = useState<LiveViewer[]>([]);

  const watchingSessionRef = useRef<LiveSession | null>(null);
  useEffect(() => {
    watchingSessionRef.current = watchingSession;
  }, [watchingSession]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        const s = watchingSessionRef.current;
        if (s && s.id !== mySessionId) {
          supabase.rpc("decrement_live_viewers" as any, { session_id: s.id });
        }
      }
    });
    return () => sub.remove();
  }, [mySessionId]);

  const {
    data: sessions = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["live-sessions"],
    queryFn: fetchLiveSessions,
    refetchInterval: 8000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("live-sessions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_sessions" },
        () => {
          qc.invalidateQueries({ queryKey: ["live-sessions"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const handleStartLive = async () => {
    if (!user?.id) {
      showToast("Sign in to start a live stream", "info");
      router.push("/login" as any);
      return;
    }
    const title = liveTitle.trim() || "My Live Stream";
    setStarting(true);
    try {
      const session = await startLiveSession(user.id, title);
      setMySessionId(session.id);
      setLiveTitle("");
      qc.invalidateQueries({ queryKey: ["live-sessions"] });
      setWatchingSession(session);
    } catch (e: any) {
      showToast(e?.message ?? "Could not start stream", "error");
    } finally {
      setStarting(false);
    }
  };

  const confirmEndLive = async (sessionId: string) => {
    try {
      await endLiveSession(sessionId);
      const viewers = await fetchLiveViewers(sessionId);
      setEndedViewers(viewers);
      setShowEndedViewers(true);
      setMySessionId(null);
      setWatchingSession(null);
      qc.invalidateQueries({ queryKey: ["live-sessions"] });
    } catch (e: any) {
      showToast(e?.message ?? "Could not end stream", "error");
    }
  };

  if (showEndedViewers) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient
          colors={["#3B0764", "#1E1B4B", "#09090B"]}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            flex: 1,
            width: "100%",
            maxWidth: 520,
            alignSelf: "center",
            paddingTop: Platform.OS === "web" ? 40 : insets.top + 36,
            paddingHorizontal: 20,
          }}
        >
          <Text style={LS.endedTitle}>Stream Ended</Text>
          <Text style={LS.endedSub}>Thanks for broadcasting on Vibe</Text>
          <Text style={[LS.endedCount, TYPE.tabular]}>
            {endedViewers.length}{" "}
            {endedViewers.length === 1 ? "Viewer" : "Viewers"}
          </Text>
          <FlatList
            data={endedViewers}
            keyExtractor={(v) => v.id}
            contentContainerStyle={{ gap: 10, paddingVertical: 16 }}
            renderItem={({ item: v }) => {
              const profile = v.profiles as Profile | undefined;
              return (
                <View style={LS.endedViewerItem}>
                  <Avatar
                    name={profile?.display_name ?? "User"}
                    avatarUrl={profile?.avatar_url}
                    size={46}
                    canvasColor="#1E1B4B"
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 15.5,
                        fontWeight: "600",
                      }}
                    >
                      {profile?.display_name ?? "User"}
                    </Text>
                    <Text
                      style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}
                    >
                      @{profile?.username ?? "user"}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
          <Pressable
            onPress={() => setShowEndedViewers(false)}
            style={[LS.endLiveBtn, { alignSelf: "center", marginBottom: insets.bottom + 24 }]}
            accessibilityRole="button"
            accessibilityLabel="Close stream summary"
          >
            <Text style={LS.endLiveText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentUserId = user?.id ?? "";

  if (watchingSession) {
    const isHost = watchingSession.id === mySessionId;
    const handleCloseLive = async () => {
      if (isHost) {
        setEndConfirmSessionId(watchingSession.id);
      } else {
        if (currentUserId) {
          await leaveLiveSession(currentUserId, watchingSession.id);
        }
        setWatchingSession(null);
      }
    };
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LiveStreamModal
          session={watchingSession}
          onClose={handleCloseLive}
          userId={currentUserId}
          isHost={isHost}
        />
        <ActionSheet
          visible={!!endConfirmSessionId}
          title="End Live Stream?"
          message="Your broadcast will end for all viewers."
          onClose={() => setEndConfirmSessionId(null)}
          items={
            endConfirmSessionId
              ? [
                  {
                    id: "end",
                    label: "End Stream",
                    icon: "stop-circle",
                    destructive: true,
                    onPress: () => confirmEndLive(endConfirmSessionId),
                  },
                ]
              : []
          }
        />
      </View>
    );
  }

  const topPadding = Platform.OS === "web" ? 14 : insets.top + 8;

  return (
    <View style={[LS.container, { backgroundColor: colors.bgCanvas }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <GlassSurface
        style={[
          LS.lobbyHeader,
          { paddingTop: topPadding, borderBottomColor: colors.separator },
        ]}
      >
        <View style={LS.lobbyHeaderInner}>
          <Pressable
            onPress={() => router.back()}
            style={LS.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[LS.lobbyTitle, { color: colors.textPrimary }]}>
            Live
          </Text>
          <View style={{ width: 44 }} />
        </View>
      </GlassSurface>

      <View style={LS.lobbyCol}>
        <View
          style={[
            LS.goLiveCard,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
            },
          ]}
        >
          <View
            style={[
              LS.liveIconCircle,
              { backgroundColor: colors.semanticDanger },
            ]}
          >
            <Feather name="radio" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[LS.goLiveTitle, { color: colors.textPrimary }]}>
              {mySessionId ? "You're Live" : "Start a Live Stream"}
            </Text>
            {!mySessionId ? (
              <TextInput
                style={[
                  LS.titleInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.separator,
                    backgroundColor: colors.input,
                  },
                ]}
                placeholder="Stream title..."
                placeholderTextColor={colors.textTertiary}
                value={liveTitle}
                onChangeText={setLiveTitle}
                accessibilityLabel="Live stream title"
              />
            ) : (
              <Text
                style={{
                  color: colors.semanticSuccess,
                  fontSize: 13.5,
                  fontWeight: "600",
                }}
              >
                Tap View to return to your stream
              </Text>
            )}
          </View>
          {mySessionId ? (
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  const s = (sessions as LiveSession[]).find(
                    (x) => x.id === mySessionId,
                  );
                  if (s) setWatchingSession(s);
                }}
                style={[LS.liveBtn, { backgroundColor: colors.accentPrimary }]}
                accessibilityRole="button"
                accessibilityLabel="View your live stream"
              >
                <Feather name="eye" size={14} color="#FFFFFF" />
                <Text style={LS.liveBtnText}>View</Text>
              </Pressable>
              <Pressable
                onPress={() => setEndConfirmSessionId(mySessionId)}
                style={[LS.liveBtn, { backgroundColor: colors.semanticDanger }]}
                accessibilityRole="button"
                accessibilityLabel="End your live stream"
              >
                <Text style={LS.liveBtnText}>End</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleStartLive}
              disabled={starting}
              style={[LS.liveBtn, { backgroundColor: colors.semanticDanger }]}
              accessibilityRole="button"
              accessibilityLabel="Go Live"
            >
              {starting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Feather name="video" size={14} color="#FFFFFF" />
                  <Text style={LS.liveBtnText}>Go Live</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        <Text style={[LS.sectionLabel, { color: colors.textSecondary }]}>
          LIVE NOW
        </Text>

        {isLoading ? (
          <View style={LS.centerFill}>
            <ActivityIndicator color={colors.accentPrimary} size="large" />
          </View>
        ) : (sessions as LiveSession[]).length === 0 ? (
          <View style={LS.centerFill}>
            <View
              style={[
                LS.emptyCircle,
                { backgroundColor: colors.accentTint },
              ]}
            >
              <Feather name="radio" size={36} color={colors.accentPrimary} />
            </View>
            <Text style={[LS.emptyTitle, { color: colors.textPrimary }]}>
              No live streams
            </Text>
            <Text style={[LS.emptyDesc, { color: colors.textSecondary }]}>
              Start a broadcast above to connect with your community in real
              time.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions as LiveSession[]}
            keyExtractor={(s) => s.id}
            onRefresh={refetch}
            refreshing={isLoading}
            contentContainerStyle={{
              padding: 16,
              gap: 12,
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item: s }) => {
              const host = s.profiles as Profile | undefined;
              const join = () => {
                if (user?.id) {
                  joinLiveSession(user.id, s.id).then(() =>
                    qc.invalidateQueries({ queryKey: ["live-sessions"] }),
                  );
                }
                setWatchingSession(s);
              };
              return (
                <Pressable
                  onPress={join}
                  style={({ pressed }) => [
                    LS.sessionCard,
                    {
                      backgroundColor: colors.bgElevated,
                      borderColor: colors.separator,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Join ${s.title}`}
                >
                  <LinearGradient
                    colors={["#1B1033", "#2E1A5E"]}
                    style={LS.sessionThumb}
                  >
                    <Avatar
                      name={host?.display_name ?? "Host"}
                      avatarUrl={host?.avatar_url}
                      size={44}
                      canvasColor="#241447"
                    />
                    <View
                      style={[
                        LS.liveBadge,
                        { backgroundColor: colors.semanticDanger },
                      ]}
                    >
                      <View style={LS.liveDotSmall} />
                      <Text style={LS.liveBadgeText}>LIVE</Text>
                    </View>
                  </LinearGradient>

                  <View style={LS.sessionInfo}>
                    <Text
                      style={[LS.sessionTitle, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {s.title}
                    </Text>
                    <Text
                      style={[LS.hostName, { color: colors.textSecondary }]}
                    >
                      {host?.display_name ?? "Host"}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 6,
                      }}
                    >
                      <Feather
                        name="eye"
                        size={12}
                        color={colors.textTertiary}
                      />
                      <Text
                        style={[
                          TYPE.tabular,
                          { color: colors.textSecondary, fontSize: 12 },
                        ]}
                      >
                        {formatCount(s.viewers_count)} watching
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                        ·
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                        {timeAgo(s.started_at)}
                      </Text>
                    </View>
                  </View>

                  <View style={LS.joinColumn}>
                    <View
                      style={[
                        LS.joinBtn,
                        { backgroundColor: colors.semanticDanger },
                      ]}
                    >
                      <Feather name="play" size={12} color="#FFFFFF" />
                      <Text style={LS.joinBtnText}>Join</Text>
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      <ActionSheet
        visible={!!endConfirmSessionId}
        title="End Live Stream?"
        message="Your broadcast will end for all viewers."
        onClose={() => setEndConfirmSessionId(null)}
        items={
          endConfirmSessionId
            ? [
                {
                  id: "end",
                  label: "End Stream",
                  icon: "stop-circle",
                  destructive: true,
                  onPress: () => confirmEndLive(endConfirmSessionId),
                },
              ]
            : []
        }
      />
    </View>
  );
}

const LS = StyleSheet.create({
  container: { flex: 1 },
  lobbyHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  lobbyHeaderInner: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  lobbyTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  lobbyCol: {
    flex: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  goLiveCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 16,
    padding: 16,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  goLiveTitle: { fontSize: 15.5, fontWeight: "700", marginBottom: 8 },
  titleInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    minHeight: 42,
    fontSize: 14.5,
  },
  liveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: RADIUS.md,
  },
  liveBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13.5 },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 19, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 320 },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  sessionThumb: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sessionInfo: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  sessionTitle: { fontSize: 15, fontWeight: "700" },
  hostName: { fontSize: 13, marginTop: 2 },
  joinColumn: { paddingRight: 12 },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: RADIUS.pill,
  },
  joinBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12.5 },
  endedTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  endedSub: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
    fontSize: 15,
    textAlign: "center",
  },
  endedCount: {
    color: "#FFFFFF",
    marginTop: 18,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  endedViewerItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: RADIUS.md,
    padding: 12,
  },

  stageBackdrop: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  stageFrame: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000000",
  },
  audioStageCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 96,
    gap: 10,
  },
  stageHostName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
  stageSubtitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13.5,
    fontWeight: "500",
  },
  enableCamBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    minHeight: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: "#6D28D9",
  },
  enableCamText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },

  liveHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    zIndex: 20,
  },
  liveBackBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  liveTitle: { color: "#FFFFFF", fontSize: 15.5, fontWeight: "700" },
  liveStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    minHeight: 34,
  },
  liveDotBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E11D48",
  },
  liveLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 4,
    minHeight: 32,
  },
  viewerCount: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  likesContainer: {
    position: "absolute",
    right: 14,
    bottom: 180,
    alignItems: "center",
    gap: 4,
    zIndex: 10,
  },
  likeBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  likesCountText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  liveChatWrap: { maxHeight: 220, paddingHorizontal: 14, paddingBottom: 8 },
  liveChatMsg: { flexDirection: "row" },
  liveChatBubble: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "88%",
  },
  liveChatUser: { color: "#C4B5FD", fontSize: 12, fontWeight: "700" },
  liveChatText: { color: "#FFFFFF", fontSize: 13 },
  emojiBarWrap: { backgroundColor: "rgba(0,0,0,0.5)" },
  emojiBar: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveChatInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  emojiToggle: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  liveChatField: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    minHeight: 44,
    color: "#FFFFFF",
    fontSize: 14.5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  liveSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6D28D9",
    alignItems: "center",
    justifyContent: "center",
  },
  liveRequestBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
  },
  liveShareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  hostControls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
    flexWrap: "wrap",
  },
  hostControlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  hostControlBtnOff: {
    backgroundColor: "rgba(225,29,72,0.22)",
    borderColor: "rgba(225,29,72,0.55)",
  },
  hostControlLabel: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  endLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E11D48",
    paddingHorizontal: 20,
    minHeight: 44,
    borderRadius: RADIUS.pill,
  },
  endLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  endLiveText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13.5,
    letterSpacing: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#121216",
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  viewerItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: RADIUS.md,
    padding: 12,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: RADIUS.md,
    padding: 12,
  },
  acceptBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E11D48",
    alignItems: "center",
    justifyContent: "center",
  },
});
