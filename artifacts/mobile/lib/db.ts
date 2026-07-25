import { getEnvValue, supabase } from "./supabase";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = getEnvValue("EXPO_PUBLIC_SUPABASE_URL", "SUPABASE_URL");

export function resolveMediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/storage/")) return `${SUPABASE_URL}${path}`;
  return `${SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

export function getPublicUrl(bucket: string, filePath: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export type Profile = {
  id: string; username: string; display_name: string; bio: string | null;
  avatar_url: string | null; cover_url: string | null; followers_count: number;
  following_count: number; posts_count: number; is_admin: boolean; is_banned: boolean; created_at: string;
};

export type Post = {
  id: string; author_id: string; content: string; media_urls: string[];
  media_type: "image" | "video" | null; media_width: number | null; media_height: number | null;
  likes_count: number; comments_count: number; shares_count: number; views_count: number;
  is_reel: boolean; is_liked?: boolean; is_saved?: boolean; visibility: string;
  created_at: string; profiles?: Profile;
};

export type Comment = {
  id: string; post_id: string; author_id: string; content: string;
  likes_count: number; parent_id: string | null; created_at: string; profiles?: Profile;
};

export type Message = {
  id: string; conversation_id: string; sender_id: string; content: string;
  media_url: string | null; media_type: "image" | "video" | "audio" | "file" | null;
  reply_to_id: string | null; post_id: string | null; is_deleted: boolean;
  created_at: string; profiles?: Profile;
  reply_to?: { id: string; content: string; media_type: string | null; sender_id: string } | null;
  shared_post?: { id: string; content: string; media_urls: string[]; media_type: string | null; author_id: string } | null;
  reactions?: { emoji: string; count: number; selfReacted: boolean }[];
};

export type Conversation = {
  id: string; type: "dm" | "group"; name: string | null; avatar_url: string | null;
  created_by: string; last_message_at: string | null; created_at: string;
  unread_count?: number; other_user?: Profile; last_message?: string; last_message_type?: string | null;
};

export type LiveSession = {
  id: string; host_id: string; title: string; viewers_count: number;
  likes_count: number; is_active: boolean; is_camera_on: boolean; is_mic_on: boolean;
  started_at: string; ended_at: string | null; profiles?: Profile;
};

export type LiveMessage = {
  id: string; session_id: string; user_id: string; content: string; created_at: string; profiles?: Profile;
};

export type LiveViewer = {
  id: string; session_id: string; user_id: string; joined_at: string; profiles?: Profile;
};

export type LiveJoinRequest = {
  id: string; session_id: string; requester_id: string;
  status: "pending" | "accepted" | "rejected"; created_at: string; profiles?: Profile;
};

export type Notification = {
  id: string; user_id: string; actor_id: string | null; type: string;
  post_id: string | null; comment_id: string | null; is_read: boolean; created_at: string;
  actor?: Profile;
};

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchFeed(userId: string, cursor?: string): Promise<Post[]> {
  const q = supabase.from("posts").select("*, profiles!posts_author_id_fkey(*)").eq("is_reel", false).eq("visibility", "public").order("created_at", { ascending: false }).limit(20);
  const finalQ = cursor ? q.lt("created_at", cursor) : q;
  const { data, error } = await finalQ;
  if (error) throw new Error(`Failed to fetch feed: ${error.message}`);
  if (!data) return [];
  const ids = data.map(p => p.id);
  const [liked, saved] = await Promise.all([
    fetchUserLikes(userId, ids).catch(() => new Set<string>()),
    fetchUserSaves(userId, ids).catch(() => new Set<string>()),
  ]);
  return data.map(p => ({ ...p, media_urls: p.media_urls ?? [], is_liked: liked.has(p.id), is_saved: saved.has(p.id) }));
}

export async function fetchReels(userId: string, cursor?: string): Promise<Post[]> {
  const q = supabase.from("posts").select("*, profiles!posts_author_id_fkey(*)").eq("is_reel", true).eq("visibility", "public").order("created_at", { ascending: false }).limit(10);
  const finalQ = cursor ? q.lt("created_at", cursor) : q;
  const { data, error } = await finalQ;
  if (error) throw new Error(`Failed to fetch reels: ${error.message}`);
  if (!data) return [];
  const ids = data.map(p => p.id);
  const [liked, saved] = await Promise.all([
    fetchUserLikes(userId, ids).catch(() => new Set<string>()),
    fetchUserSaves(userId, ids).catch(() => new Set<string>()),
  ]);
  return data.map(p => ({ ...p, media_urls: p.media_urls ?? [], is_liked: liked.has(p.id), is_saved: saved.has(p.id) }));
}

async function fetchUserLikes(userId: string, postIds: string[]): Promise<Set<string>> {
  if (!userId || !postIds.length) return new Set();
  const { data } = await supabase.from("likes").select("post_id").eq("user_id", userId).in("post_id", postIds);
  return new Set((data ?? []).map(r => r.post_id));
}

async function fetchUserSaves(userId: string, postIds: string[]): Promise<Set<string>> {
  if (!userId || !postIds.length) return new Set();
  const { data } = await supabase.from("saves").select("post_id").eq("user_id", userId).in("post_id", postIds);
  return new Set((data ?? []).map(r => r.post_id));
}

// ─── Post Actions ─────────────────────────────────────────────────────────────

export async function likePost(userId: string, postId: string) {
  await supabase.from("likes").upsert({ user_id: userId, post_id: postId });
  await supabase.rpc("increment_post_likes", { post_id: postId });
}

export async function unlikePost(userId: string, postId: string) {
  await supabase.from("likes").delete().eq("user_id", userId).eq("post_id", postId);
  await supabase.rpc("decrement_post_likes", { post_id: postId });
}

export async function savePost(userId: string, postId: string) {
  await supabase.from("saves").upsert({ user_id: userId, post_id: postId });
}

export async function unsavePost(userId: string, postId: string) {
  await supabase.from("saves").delete().eq("user_id", userId).eq("post_id", postId);
}

export async function incrementPostViews(postId: string) {
  supabase.rpc("increment_post_views" as any, { post_id: postId });
}

export async function deletePost(postId: string, authorId: string) {
  const { error } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", authorId);
  if (error) throw new Error(error.message);
}

export async function updatePostVisibility(postId: string, authorId: string, visibility: "public" | "followers" | "private") {
  const { error } = await supabase.from("posts").update({ visibility }).eq("id", postId).eq("author_id", authorId);
  if (error) throw new Error(error.message);
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data } = await supabase.from("comments").select("*, profiles!comments_author_id_fkey(*)").eq("post_id", postId).is("parent_id", null).order("created_at", { ascending: true });
  return data ?? [];
}

export async function createComment(postId: string, authorId: string, content: string, parentId?: string) {
  const { data, error } = await supabase.from("comments").insert({ post_id: postId, author_id: authorId, content, parent_id: parentId ?? null }).select().single();
  if (error) throw new Error(error.message);
  await supabase.rpc("increment_post_comments", { post_id: postId });
  return data;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return data;
}

export async function fetchUserPosts(authorId: string, viewerId?: string, isReel = false): Promise<Post[]> {
  let query = supabase.from("posts").select("*").eq("author_id", authorId).eq("is_reel", isReel);
  if (viewerId && viewerId !== authorId) {
    query = query.eq("visibility", "public");
  }
  const { data } = await query.order("created_at", { ascending: false });
  return (data ?? []).map(p => ({ ...p, media_urls: p.media_urls ?? [] }));
}

export async function fetchPost(postId: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("*, profiles!posts_author_id_fkey(*)")
    .eq("id", postId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchSavedPosts(userId: string): Promise<Post[]> {
  const { data } = await supabase.from("saves").select("posts(*, profiles!posts_author_id_fkey(*))").eq("user_id", userId).order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => r.posts ? { ...r.posts, media_urls: r.posts.media_urls ?? [] } : null).filter(Boolean) as Post[];
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { error } = await supabase.from("profiles").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw new Error(error.message);
}

// ─── Follow ───────────────────────────────────────────────────────────────────

export async function followUser(followerId: string, followingId: string) {
  await supabase.from("follows").upsert({ follower_id: followerId, following_id: followingId });
  await supabase.rpc("increment_followers", { user_id: followingId });
  await supabase.rpc("increment_following", { user_id: followerId });
}

export async function unfollowUser(followerId: string, followingId: string) {
  await supabase.from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
  await supabase.rpc("decrement_followers", { user_id: followingId });
  await supabase.rpc("decrement_following", { user_id: followerId });
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data } = await supabase.from("follows").select("follower_id").eq("follower_id", followerId).eq("following_id", followingId).maybeSingle();
  return !!data;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<Profile[]> {
  const { data } = await supabase.from("profiles").select("*").or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(20);
  return data ?? [];
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const { data: memberRows, error } = await supabase
    .from("conversation_members")
    .select("conversation_id, unread_count")
    .eq("user_id", userId);
  if (error || !memberRows?.length) return [];

  const convIds = memberRows.map((r: any) => r.conversation_id as string);
  const unreadMap = new Map<string, number>(memberRows.map((r: any) => [r.conversation_id as string, (r.unread_count as number) ?? 0]));

  const { data: convos } = await supabase
    .from("conversations")
    .select("*")
    .in("id", convIds);
  if (!convos?.length) return [];

  const enriched = await Promise.all((convos as Conversation[]).map(async (convo) => {
    let otherUser: Profile | undefined;
    if (convo.type === "dm") {
      // Use RPC to get the other member's user_id (bypasses RLS on conversation_members)
      const { data: otherId } = await supabase
        .rpc("get_dm_other_user", { p_conversation_id: convo.id, p_user_id: userId });
      if (otherId) {
        const { data: p } = await supabase.from("profiles").select("*").eq("id", otherId).single();
        otherUser = p ?? undefined;
      }
    }
    const { data: lastMsgData } = await supabase
      .from("messages")
      .select("content, created_at, media_type")
      .eq("conversation_id", convo.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      ...convo,
      unread_count: unreadMap.get(convo.id) ?? 0,
      other_user: otherUser,
      last_message: lastMsgData?.content,
      last_message_type: lastMsgData?.media_type,
      last_message_at: lastMsgData?.created_at ?? convo.last_message_at,
    } as Conversation;
  }));

  return enriched.sort((a, b) =>
    new Date(b.last_message_at ?? b.created_at).getTime() -
    new Date(a.last_message_at ?? a.created_at).getTime()
  );
}

export async function getOrCreateDM(userId: string, otherId: string): Promise<string> {
  // Step 1: check for existing DM via security-definer RPC (bypasses RLS)
  const { data: existing, error: rpcErr } = await supabase.rpc("get_dm_conversation", { user1: userId, user2: otherId });
  if (rpcErr) {
    const code = (rpcErr as any)?.code ?? "";
    if (code === "42883" || rpcErr.message?.includes("does not exist")) {
      throw new Error("[Step 1] RPC get_dm_conversation missing — run fix_messaging.sql in Supabase.");
    }
    throw new Error(`[Step 1 RPC] ${rpcErr.message}`);
  }
  if (existing) return existing as string;

  // Step 2: create conversation row
  const newId = uuidv4();
  const { error: createErr } = await supabase
    .from("conversations")
    .insert({ id: newId, type: "dm", created_by: userId });
  if (createErr) {
    throw new Error(`[Step 2 INSERT conversations] ${createErr.message} (code: ${(createErr as any).code})`);
  }

  // Step 3: add both members
  const { error: memberErr } = await supabase.from("conversation_members").insert([
    { conversation_id: newId, user_id: userId },
    { conversation_id: newId, user_id: otherId },
  ]);
  if (memberErr) {
    await supabase.from("conversations").delete().eq("id", newId);
    throw new Error(`[Step 3 INSERT members] ${memberErr.message} (code: ${(memberErr as any).code})`);
  }

  return newId;
}

export async function createGroupConversation(creatorId: string, name: string, memberIds: string[]): Promise<string> {
  const { data: convo, error } = await supabase.from("conversations").insert({ type: "group", name, created_by: creatorId }).select("id").single();
  if (error || !convo?.id) throw new Error(error?.message ?? "Failed");
  await supabase.from("conversation_members").insert([creatorId, ...memberIds].map(uid => ({ conversation_id: convo.id, user_id: uid, is_admin: uid === creatorId })));
  return convo.id;
}

export async function fetchConversationMembers(conversationId: string): Promise<Profile[]> {
  const { data } = await supabase.from("conversation_members").select("profiles!conversation_members_user_id_fkey(*)").eq("conversation_id", conversationId);
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string, cursor?: string): Promise<Message[]> {
  // Explicit column list avoids PostgREST schema ambiguity between
  // public.messages and realtime.messages. Profiles joined client-side.
  let q = supabase
    .from("messages")
    .select("id, conversation_id, sender_id, content, media_url, media_type, reply_to_id, post_id, is_deleted, created_at")
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(40);
  if (cursor) q = q.lt("created_at", cursor);
  const { data, error } = await q;
  if (error) {
    const code = (error as any)?.code ?? "";
    if (code === "42P01" || error.message?.includes("does not exist")) {
      throw new Error("Messaging tables are missing. Please run missing_tables.sql in Supabase.");
    }
    throw new Error(error.message);
  }
  if (!data?.length) return [];

  // Batch-fetch profiles for all unique senders in one query
  const senderIds = [...new Set(data.map((m: any) => m.sender_id as string))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", senderIds);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id as string, p]));

  return data.reverse().map((m: any) => ({
    ...m,
    profiles: profileMap.get(m.sender_id) ?? undefined,
    reply_to: null,
    shared_post: null,
  })) as Message[];
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  opts?: { mediaUrl?: string; mediaType?: string; replyToId?: string; postId?: string }
) {
  const msgId = uuidv4();
  const { error } = await supabase.from("messages").insert({
    id: msgId,
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    media_url: opts?.mediaUrl ?? null,
    media_type: opts?.mediaType ?? null,
    reply_to_id: opts?.replyToId ?? null,
    post_id: opts?.postId ?? null,
    is_deleted: false,
  });
  if (error) throw new Error(error.message);
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function deleteMessage(messageId: string, senderId: string) {
  const { error } = await supabase
    .from("messages")
    .update({ is_deleted: true, content: "This message was deleted" })
    .eq("id", messageId)
    .eq("sender_id", senderId);
  if (error) throw new Error(error.message);
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  // Check if reaction already exists
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("message_reactions")
      .insert({ message_id: messageId, user_id: userId, emoji });
    if (error) throw new Error(error.message);
  }
}

export async function fetchReactionsForConversation(
  messageIds: string[],
  currentUserId: string
): Promise<Map<string, { emoji: string; count: number; selfReacted: boolean }[]>> {
  if (!messageIds.length) return new Map();
  const { data } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds);

  const map = new Map<string, { emoji: string; count: number; selfReacted: boolean }[]>();
  for (const row of data ?? []) {
    const r = row as { message_id: string; user_id: string; emoji: string };
    const existing = map.get(r.message_id) ?? [];
    const entry = existing.find(e => e.emoji === r.emoji);
    if (entry) {
      entry.count++;
      if (r.user_id === currentUserId) entry.selfReacted = true;
    } else {
      existing.push({ emoji: r.emoji, count: 1, selfReacted: r.user_id === currentUserId });
    }
    map.set(r.message_id, existing);
  }
  return map;
}

export async function markConversationRead(conversationId: string, userId: string) {
  await supabase
    .from("conversation_members")
    .update({ unread_count: 0 })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

// ─── Block ────────────────────────────────────────────────────────────────────

export async function blockUser(blockerId: string, blockedId: string) {
  await supabase.from("blocks").upsert({ blocker_id: blockerId, blocked_id: blockedId });
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await supabase.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", blockerId).eq("blocked_id", blockedId).maybeSingle();
  return !!data;
}

export async function fetchBlockedUsers(userId: string): Promise<Profile[]> {
  const { data } = await supabase.from("blocks").select("profiles!blocks_blocked_id_fkey(*)").eq("blocker_id", userId);
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean);
}

// ─── Upload ───────────────────────────────────────────────────────────────────

const ALLOWED_BUCKETS = new Set(["media", "chat-media", "avatars"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/quicktime","video/webm","audio/mpeg","audio/ogg","audio/webm","audio/aac","audio/x-m4a","application/pdf"]);

export async function uploadMedia(fileUri: string, fileName: string, mimeType: string, bucket = "media"): Promise<string> {
  if (!ALLOWED_BUCKETS.has(bucket)) throw new Error("Invalid storage bucket.");
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("Unsupported file type.");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const path = `${Date.now()}_${safeFileName}`;

  // Use expo-file-system to read local file URIs (file:// / content://)
  // fetch() cannot handle local URIs on Android/iOS
  if (fileUri.startsWith("file://") || fileUri.startsWith("content://")) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require("expo-file-system");
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const { error } = await supabase.storage.from(bucket).upload(path, binary, { contentType: mimeType, upsert: true });
    if (error) throw new Error(error.message);
  } else if (fileUri.startsWith("http://") || fileUri.startsWith("https://")) {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: mimeType, upsert: true });
    if (error) throw new Error(error.message);
  } else {
    throw new Error("Invalid file URI.");
  }

  return getPublicUrl(bucket, path);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false);
  return count ?? 0;
}

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data } = await supabase.from("notifications").select("*, actor:actor_id(id, username, display_name, avatar_url)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as Notification[];
}

export async function markAllNotificationsRead(userId: string) {
  await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
}

// ─── Stories ─────────────────────────────────────────────────────────────────

export async function fetchStories(userId: string) {
  const { data } = await supabase.from("stories").select("*, profiles!stories_author_id_fkey(*)").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

// ─── Live Sessions ────────────────────────────────────────────────────────────

export async function fetchLiveSessions(): Promise<LiveSession[]> {
  const { data } = await supabase.from("live_sessions").select("*, profiles!live_sessions_host_id_fkey(*)").eq("is_active", true).order("viewers_count", { ascending: false });
  return (data ?? []) as LiveSession[];
}

export async function startLiveSession(hostId: string, title: string): Promise<LiveSession> {
  await supabase.from("live_sessions").update({ is_active: false, ended_at: new Date().toISOString() }).eq("host_id", hostId).eq("is_active", true);
  const { data, error } = await supabase.from("live_sessions").insert({ host_id: hostId, title, is_active: true, viewers_count: 0, likes_count: 0, is_camera_on: true, is_mic_on: true }).select("*, profiles!live_sessions_host_id_fkey(*)").single();
  if (error) throw new Error(error.message);
  return data as LiveSession;
}

export async function endLiveSession(sessionId: string) {
  await supabase.from("live_sessions").update({ is_active: false, ended_at: new Date().toISOString() }).eq("id", sessionId);
}

export async function updateLiveSessionState(sessionId: string, updates: { is_camera_on?: boolean; is_mic_on?: boolean }) {
  const { error } = await supabase.from("live_sessions").update(updates).eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function likeLiveSession(userId: string, sessionId: string) {
  await supabase.from("live_likes").upsert({ user_id: userId, session_id: sessionId }).select().maybeSingle();
  await supabase.rpc("increment_live_likes", { session_id: sessionId });
}

export async function unlikeLiveSession(userId: string, sessionId: string) {
  await supabase.from("live_likes").delete().eq("user_id", userId).eq("session_id", sessionId);
  await supabase.rpc("decrement_live_likes", { session_id: sessionId });
}

export async function hasLikedLiveSession(userId: string, sessionId: string): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.from("live_likes").select("user_id").eq("user_id", userId).eq("session_id", sessionId).maybeSingle();
  return !!data;
}

export async function fetchLiveMessages(sessionId: string): Promise<LiveMessage[]> {
  const { data } = await supabase.from("live_messages").select("*, profiles!live_messages_user_id_fkey(*)").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(100);
  return (data ?? []) as LiveMessage[];
}

export async function sendLiveMessage(sessionId: string, userId: string, content: string): Promise<LiveMessage> {
  const { data, error } = await supabase.from("live_messages").insert({ session_id: sessionId, user_id: userId, content }).select("*, profiles!live_messages_user_id_fkey(*)").single();
  if (error) throw new Error(error.message);
  return data as LiveMessage;
}

export async function fetchLiveViewers(sessionId: string): Promise<LiveViewer[]> {
  const { data } = await supabase.from("live_viewers").select("*, profiles!live_viewers_user_id_fkey(*)").eq("session_id", sessionId).order("joined_at", { ascending: true });
  return (data ?? []) as LiveViewer[];
}

export async function joinLiveSession(userId: string, sessionId: string) {
  await supabase.rpc("upsert_live_viewer", { p_session_id: sessionId, p_user_id: userId });
  await supabase.rpc("increment_live_viewers", { session_id: sessionId });
}

export async function leaveLiveSession(userId: string, sessionId: string) {
  await supabase.rpc("remove_live_viewer", { p_session_id: sessionId, p_user_id: userId });
  await supabase.rpc("decrement_live_viewers", { session_id: sessionId });
}

export async function requestToJoinLive(userId: string, sessionId: string) {
  const { data, error } = await supabase.from("live_join_requests").insert({ session_id: sessionId, requester_id: userId, status: "pending" }).select().single();
  if (error) throw new Error(error.message);
  return data as LiveJoinRequest;
}

export async function fetchJoinRequests(sessionId: string): Promise<LiveJoinRequest[]> {
  const { data } = await supabase.from("live_join_requests").select("*, profiles!live_join_requests_requester_id_fkey(*)").eq("session_id", sessionId).eq("status", "pending").order("created_at", { ascending: true });
  return (data ?? []) as LiveJoinRequest[];
}

export async function acceptJoinRequest(requestId: string, sessionId: string) {
  await supabase.rpc("accept_join_request", { p_request_id: requestId, p_session_id: sessionId });
}

export async function rejectJoinRequest(requestId: string, sessionId: string) {
  await supabase.rpc("reject_join_request", { p_request_id: requestId, p_session_id: sessionId });
}

// ─── AI (OpenRouter) ─────────────────────────────────────────────────────────

export async function callAI(system: string, userMsg: string, maxTokens = 150): Promise<string> {
  const key = getEnvValue("EXPO_PUBLIC_OPENROUTER_KEY");
  if (!key) return "";
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemma-4-26b-a4b-it:free", messages: [{ role: "system", content: system }, { role: "user", content: userMsg }], max_tokens: maxTokens }),
    });
    if (!resp.ok) return "";
    const json = await resp.json() as any;
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  } catch { return ""; }
}

export async function generateAICaption(context: string): Promise<string> {
  return callAI("You are a social media caption writer. Write an engaging caption under 150 chars with 2-3 hashtags.", `Write a caption for: ${context}`, 120);
}

export async function generateAIReplySuggestion(messageContext: string): Promise<string[]> {
  const text = await callAI('Generate 3 short reply suggestions (under 50 chars each). Return ONLY a JSON array: ["reply1","reply2","reply3"]', `Message: "${messageContext}"`, 80);
  try { const a = JSON.parse(text); return Array.isArray(a) ? a.slice(0, 3) : []; } catch { return []; }
}

export async function generateAIHashtags(content: string): Promise<string[]> {
  const text = await callAI("Generate 6 relevant hashtags including # symbol. Return ONLY a JSON array.", `Content: "${content}"`, 100);
  try { const a = JSON.parse(text); return Array.isArray(a) ? a.slice(0, 6) : []; } catch { return []; }
}

export async function generateAICommentSuggestions(postContent: string): Promise<string[]> {
  const text = await callAI('Generate 3 engaging comment suggestions (under 60 chars each). Return ONLY a JSON array: ["comment1","comment2","comment3"]', `Post: "${postContent}"`, 100);
  try { const a = JSON.parse(text); return Array.isArray(a) ? a.slice(0, 3) : []; } catch { return []; }
}

export async function generateAIBio(displayName: string): Promise<string> {
  return callAI("You are a social media profile writer. Write a catchy, authentic bio under 120 chars. No quotes in output.", `Write a bio for someone named: ${displayName}`, 100);
}

export async function enhanceAICaption(caption: string): Promise<string> {
  return callAI("You are a social media expert. Rewrite the caption to be punchier and more engaging. Keep it under 200 chars with 2-3 hashtags. No quotes in output.", `Enhance this caption: ${caption}`, 150);
}

export async function generatePostIdea(trendingTags: string[]): Promise<string> {
  const tags = trendingTags.slice(0, 5).join(", ");
  return callAI("You are a creative social media content coach. Suggest an engaging post idea in 1-2 sentences. No quotes in output.", `Trending topics: ${tags || "lifestyle, tech, travel"}. Suggest a post idea.`, 120);
}

export async function generateSearchSuggestions(query: string): Promise<string[]> {
  const text = await callAI('Suggest 4 related search terms or hashtags for a social media search. Return ONLY a JSON array of strings.', `User searched for: "${query}"`, 80);
  try { const a = JSON.parse(text); return Array.isArray(a) ? a.slice(0, 4) : []; } catch { return []; }
}

export async function generateProfileInsights(stats: { totalPosts: number; totalLikes: number; totalViews: number; imagePosts: number; videoPosts: number; textPosts: number }): Promise<string> {
  return callAI("You are a social media growth coach. Give 2-3 short, actionable insights based on post stats. Be specific and encouraging. Under 250 chars total.",
    `Stats: ${stats.totalPosts} posts, ${stats.totalLikes} likes, ${stats.totalViews} views, ${stats.imagePosts} image posts, ${stats.videoPosts} video posts, ${stats.textPosts} text posts.`, 200);
}

export async function chatWithAI(messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const key = getEnvValue("EXPO_PUBLIC_OPENROUTER_KEY");
  if (!key) return "Sorry, AI is not available right now.";
  const body = {
    messages: [
      { role: "system", content: "You are a helpful, friendly AI assistant built into a social media app. Keep responses concise and engaging." },
      ...messages,
    ],
    max_tokens: 300,
  };
  const models = ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"];
  for (const model of models) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://vibe.ai", "X-Title": "Vibe AI" },
        body: JSON.stringify({ ...body, model }),
      });
      if (!resp.ok) continue;
      const json = await resp.json() as any;
      const content = json.choices?.[0]?.message?.content?.trim();
      if (content) return content;
    } catch {}
  }
  return "Sorry, something went wrong. Try again.";
}

export async function adjustAITone(text: string, tone: "formal" | "casual" | "funny" | "flirty"): Promise<string> {
  const prompts: Record<string, string> = {
    formal: "Rewrite the following message in a polite, professional tone. Keep it short.",
    casual: "Rewrite the following message in a chill, everyday tone. Keep it short.",
    funny: "Rewrite the following message in a playful, humorous tone. Keep it short.",
    flirty: "Rewrite the following message in a light, flirty tone. Keep it short.",
  };
  return callAI(prompts[tone] || prompts.casual, `Message: "${text}"`, 120);
}

export async function summarizeAIChat(messages: { role: string; content: string }[]): Promise<string> {
  const convo = messages.slice(-20).map(m => `${m.role}: ${m.content}`).join("\n");
  return callAI("Summarize the following chat in 1-2 short sentences.", `Chat:\n${convo}`, 120);
}

export async function translateAIText(text: string, targetLang: string): Promise<string> {
  return callAI(`Translate the following text to ${targetLang}. Return ONLY the translated text.`, text, 200);
}

export async function generateAIAltText(imageUri: string, caption?: string): Promise<string> {
  return callAI("You describe images for accessibility. Write a concise alt-text description under 125 chars.",
    `Image context: ${caption || "user uploaded image"}. Describe this image for screen readers.`, 100);
}

export async function summarizeAIComments(comments: { content: string }[]): Promise<string> {
  if (!comments.length) return "No comments yet.";
  const text = comments.slice(0, 50).map(c => c.content).join("\n");
  return callAI("Summarize these comments in 1-2 sentences. Focus on the main sentiment and topics.",
    `Comments:\n${text}`, 150);
}

export async function analyzeAISentiment(text: string): Promise<{ label: string; emoji: string }> {
  const out = await callAI('Return ONLY a JSON object: {"label":"positive|neutral|negative","emoji":"😀|😐|😞"}', `Text: "${text}"`, 60);
  try {
    const parsed = JSON.parse(out);
    if (parsed?.label && parsed?.emoji) return parsed;
  } catch {}
  return { label: "neutral", emoji: "😐" };
}

export async function generateAIContentStrategy(stats: { totalPosts: number; totalLikes: number; totalViews: number; imagePosts: number; videoPosts: number; textPosts: number }): Promise<string> {
  return callAI("You are a social media growth coach. Give 2-3 short, actionable insights based on post stats. Be specific and encouraging. Under 250 chars total.",
    `Stats: ${stats.totalPosts} posts, ${stats.totalLikes} likes, ${stats.totalViews} views, ${stats.imagePosts} image posts, ${stats.videoPosts} video posts, ${stats.textPosts} text posts.`, 200);
}

export async function generateAIBioRefresh(displayName: string, recentTopics: string[]): Promise<string> {
  const topics = recentTopics.slice(0, 5).join(", ") || "lifestyle, tech, travel";
  return callAI("You are a social media profile writer. Write a catchy, authentic bio under 120 chars based on the user's name and recent topics. No quotes in output.",
    `Name: ${displayName}. Recent topics: ${topics}.`, 120);
}

export async function generateAIOnboardingTip(userName: string): Promise<string> {
  return callAI("You are a friendly social media onboarding coach. Give a short, specific tip for a new user. One sentence.",
    `New user: ${userName || "there"}.`, 80);
}

export async function generateAINotificationDigest(notifications: { type: string; profiles?: { display_name?: string } | null }[]): Promise<string> {
  if (!notifications.length) return "You're all caught up! No new notifications.";
  const counts: Record<string, number> = {};
  const names: Record<string, string> = {};
  for (const n of notifications) {
    counts[n.type] = (counts[n.type] || 0) + 1;
    if (n.profiles?.display_name && !names[n.type]) names[n.type] = n.profiles.display_name;
  }
  const parts = Object.entries(counts).map(([type, count]) => {
    const who = names[type] ? ` from ${names[type]}` : "";
    return `${count} ${type}${who}`;
  }).slice(0, 4);
  return callAI("Rewrite this notification summary in a friendly, concise way. Under 150 chars.",
    `Notifications: ${parts.join(", ")}.`, 120);
}

export async function generateAISemanticSearch(query: string): Promise<string[]> {
  const text = await callAI('Suggest 3 natural-language search queries related to this topic for a social media app. Return ONLY a JSON array of strings.', `Topic: "${query}"`, 80);
  try { const a = JSON.parse(text); return Array.isArray(a) ? a.slice(0, 3) : []; } catch { return []; }
}

export async function generateAITrendingInsights(tag: string): Promise<string> {
  return callAI("You are a social media trend analyst. Explain why this hashtag might be trending in 1-2 short sentences. Be informative but concise.", `Hashtag: ${tag}`, 120);
}

export async function generateAIVideoHook(context: string): Promise<string> {
  return callAI("You are a social media video creator. Suggest an attention-grabbing hook/title for a short video reel. Under 80 chars.", `Video context: ${context || "lifestyle/social video"}`, 80);
}