import { supabase } from "./supabase";

export type NotificationType =
  | "message"
  | "message_request"
  | "audio_call"
  | "video_call"
  | "new_post"
  | "new_reel"
  | "security_alert"
  | "like"
  | "comment"
  | "follow"
  | "live";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  avatarUrl?: string;
  senderName?: string;
  data?: Record<string, string>;
  timestamp: number;
}

export const NOTIFICATION_META: Record<NotificationType, { icon: string; color: string; emoji: string }> = {
  message:         { icon: "message-circle", color: "#6d28d9", emoji: "💬" },
  message_request: { icon: "user-plus",      color: "#ea580c", emoji: "🤝" },
  audio_call:      { icon: "phone",          color: "#059669", emoji: "📞" },
  video_call:      { icon: "video",          color: "#0891b2", emoji: "📹" },
  new_post:        { icon: "image",          color: "#7c3aed", emoji: "📸" },
  new_reel:        { icon: "film",           color: "#9333ea", emoji: "🎬" },
  security_alert:  { icon: "shield",         color: "#dc2626", emoji: "🔒" },
  like:            { icon: "heart",          color: "#e11d48", emoji: "❤️" },
  comment:         { icon: "message-square", color: "#2563eb", emoji: "💭" },
  follow:          { icon: "user-check",     color: "#0284c7", emoji: "👤" },
  live:            { icon: "radio",          color: "#dc2626", emoji: "🔴" },
};

// Expo push tokens are either ExponentPushToken[...] or a bare device token
const EXPO_TOKEN_RE = /^ExponentPushToken\[[a-zA-Z0-9_-]+\]$|^[a-zA-Z0-9]{20,64}$/;

function sanitizeText(value: unknown, maxLen: number): string {
  return String(value ?? "").replace(/[<>"'`]/g, "").slice(0, maxLen);
}

export async function savePushToken(userId: string, token: string) {
  try {
    await supabase.from("profiles").update({ push_token: token }).eq("id", userId);
  } catch (e) {
    console.warn("Failed to save push token:", e);
  }
}

export async function sendPushNotification(expoPushToken: string, notification: Omit<AppNotification, "id" | "timestamp">) {
  if (!EXPO_TOKEN_RE.test(expoPushToken)) {
    console.warn("sendPushNotification: invalid push token format, skipping.");
    return;
  }
  const meta = NOTIFICATION_META[notification.type];
  const message = {
    to: expoPushToken,
    sound: "default",
    title: `${meta.emoji} ${sanitizeText(notification.title, 200)}`,
    body: sanitizeText(notification.body, 500),
    data: notification.data ?? {},
    priority: "high" as const,
    badge: 1,
  };
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (e) {
    console.warn("Failed to send push notification:", e);
  }
}

export function mapDbNotificationToApp(row: any): AppNotification {
  const type = (row.type ?? "message") as NotificationType;
  const meta = NOTIFICATION_META[type] ?? NOTIFICATION_META.message;

  const senderName = sanitizeText(row.sender_name, 100);

  const titleMap: Record<NotificationType, string> = {
    message:         senderName || "New Message",
    message_request: senderName || "Message Request",
    audio_call:      senderName || "Incoming Call",
    video_call:      senderName || "Incoming Video Call",
    new_post:        senderName || "New Post",
    new_reel:        senderName || "New Reel",
    security_alert:  "Security Alert",
    like:            senderName || "New Like",
    comment:         senderName || "New Comment",
    follow:          senderName || "New Follower",
    live:            senderName || "Going Live",
  };

  const bodyMap: Record<NotificationType, string> = {
    message:         sanitizeText(row.message, 300) || "Sent you a message",
    message_request: "Wants to message you",
    audio_call:      "Incoming audio call…",
    video_call:      "Incoming video call…",
    new_post:        sanitizeText(row.message, 300) || "Posted something new",
    new_reel:        sanitizeText(row.message, 300) || "Posted a new reel",
    security_alert:  sanitizeText(row.message, 300) || "New sign-in detected on your account",
    like:            "Liked your post",
    comment:         sanitizeText(row.message, 300) || "Commented on your post",
    follow:          "Started following you",
    live:            "Is now live! Tap to join.",
  };

  return {
    id: row.id ?? String(Date.now()),
    type,
    title: titleMap[type],
    body: bodyMap[type],
    avatarUrl: row.sender_avatar,
    senderName: senderName || undefined,
    data: row.data ?? {},
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}
