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

export async function savePushToken(userId: string, token: string) {
  try {
    await supabase.from("profiles").update({ push_token: token }).eq("id", userId);
  } catch (e) {
    console.warn("Failed to save push token:", e);
  }
}

export async function sendPushNotification(expoPushToken: string, notification: Omit<AppNotification, "id" | "timestamp">) {
  const meta = NOTIFICATION_META[notification.type];
  const message = {
    to: expoPushToken,
    sound: "default",
    title: `${meta.emoji} ${notification.title}`,
    body: notification.body,
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

  const titleMap: Record<NotificationType, string> = {
    message:         row.sender_name ? `${row.sender_name}` : "New Message",
    message_request: row.sender_name ? `${row.sender_name}` : "Message Request",
    audio_call:      row.sender_name ? `${row.sender_name}` : "Incoming Call",
    video_call:      row.sender_name ? `${row.sender_name}` : "Incoming Video Call",
    new_post:        row.sender_name ? `${row.sender_name}` : "New Post",
    new_reel:        row.sender_name ? `${row.sender_name}` : "New Reel",
    security_alert:  "Security Alert",
    like:            row.sender_name ? `${row.sender_name}` : "New Like",
    comment:         row.sender_name ? `${row.sender_name}` : "New Comment",
    follow:          row.sender_name ? `${row.sender_name}` : "New Follower",
    live:            row.sender_name ? `${row.sender_name}` : "Going Live",
  };

  const bodyMap: Record<NotificationType, string> = {
    message:         row.message ?? "Sent you a message",
    message_request: "Wants to message you",
    audio_call:      "Incoming audio call…",
    video_call:      "Incoming video call…",
    new_post:        row.message ?? "Posted something new",
    new_reel:        row.message ?? "Posted a new reel",
    security_alert:  row.message ?? "New sign-in detected on your account",
    like:            "Liked your post",
    comment:         row.message ?? "Commented on your post",
    follow:          "Started following you",
    live:            "Is now live! Tap to join.",
  };

  return {
    id: row.id ?? String(Date.now()),
    type,
    title: titleMap[type],
    body: bodyMap[type],
    avatarUrl: row.sender_avatar,
    senderName: row.sender_name,
    data: row.data ?? {},
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}
