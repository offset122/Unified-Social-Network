import { supabase } from "./supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

export function resolveMediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  // Supabase storage public URL
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
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
};

export type Post = {
  id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  media_type: "image" | "video" | null;
  media_width: number | null;
  media_height: number | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  views_count: number;
  is_reel: boolean;
  is_liked?: boolean;
  is_saved?: boolean;
  visibility: string;
  created_at: string;
  profiles?: Profile;
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  likes_count: number;
  parent_id: string | null;
  created_at: string;
  profiles?: Profile;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | "file" | null;
  reply_to_id: string | null;
  post_id: string | null;
  is_deleted: boolean;
  created_at: string;
  profiles?: Profile;
};

export type Conversation = {
  id: string;
  type: "dm" | "group";
  name: string | null;
  avatar_url: string | null;
  created_by: string;
  last_message_at: string | null;
  created_at: string;
  unread_count?: number;
  other_user?: Profile;
  last_message?: string;
};

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchFeed(userId: string, cursor?: string): Promise<Post[]> {
  let query = supabase
    .from("posts")
    .select(`*, profiles(*)`)
    .eq("is_reel", false)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(20);

  if (cursor) query = query.lt("created_at", cursor);

  const { data } = await query;
  if (!data) return [];

  const liked = await fetchUserLikes(userId, data.map((p) => p.id));
  const saved = await fetchUserSaves(userId, data.map((p) => p.id));

  return data.map((p) => ({
    ...p,
    media_urls: p.media_urls ?? [],
    is_liked: liked.has(p.id),
    is_saved: saved.has(p.id),
  }));
}

export async function fetchReels(userId: string, cursor?: string): Promise<Post[]> {
  let query = supabase
    .from("posts")
    .select(`*, profiles(*)`)
    .eq("is_reel", true)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(10);

  if (cursor) query = query.lt("created_at", cursor);

  const { data } = await query;
  if (!data) return [];

  const liked = await fetchUserLikes(userId, data.map((p) => p.id));
  const saved = await fetchUserSaves(userId, data.map((p) => p.id));

  return data.map((p) => ({
    ...p,
    media_urls: p.media_urls ?? [],
    is_liked: liked.has(p.id),
    is_saved: saved.has(p.id),
  }));
}

async function fetchUserLikes(userId: string, postIds: string[]): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();
  const { data } = await supabase
    .from("likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  return new Set((data ?? []).map((r) => r.post_id));
}

async function fetchUserSaves(userId: string, postIds: string[]): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();
  const { data } = await supabase
    .from("saves")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  return new Set((data ?? []).map((r) => r.post_id));
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

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data } = await supabase
    .from("comments")
    .select(`*, profiles(*)`)
    .eq("post_id", postId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function createComment(postId: string, authorId: string, content: string, parentId?: string) {
  const { data, error } = await supabase.from("comments").insert({
    post_id: postId,
    author_id: authorId,
    content,
    parent_id: parentId ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  await supabase.rpc("increment_post_comments", { post_id: postId });
  return data;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return data;
}

export async function fetchUserPosts(userId: string, isReel = false): Promise<Post[]> {
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("author_id", userId)
    .eq("is_reel", isReel)
    .order("created_at", { ascending: false });
  return (data ?? []).map((p) => ({ ...p, media_urls: p.media_urls ?? [] }));
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId);
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
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  return !!data;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(20);
  return data ?? [];
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const { data: memberRows } = await supabase
    .from("conversation_members")
    .select(`conversation_id, unread_count, conversations(*)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!memberRows) return [];

  const convos = await Promise.all(
    memberRows.map(async (row: any) => {
      const convo = row.conversations as Conversation;
      if (!convo) return null;

      let otherUser: Profile | undefined;
      if (convo.type === "dm") {
        const { data: members } = await supabase
          .from("conversation_members")
          .select("user_id, profiles(*)")
          .eq("conversation_id", convo.id)
          .neq("user_id", userId)
          .limit(1);
        otherUser = (members?.[0] as any)?.profiles ?? undefined;
      }

      const { data: lastMsgData } = await supabase
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", convo.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...convo,
        unread_count: row.unread_count ?? 0,
        other_user: otherUser,
        last_message: lastMsgData?.content,
        last_message_at: lastMsgData?.created_at ?? convo.last_message_at,
      } as Conversation;
    })
  );

  return convos.filter(Boolean).sort((a, b) =>
    new Date(b!.last_message_at ?? b!.created_at).getTime() -
    new Date(a!.last_message_at ?? a!.created_at).getTime()
  ) as Conversation[];
}

export async function getOrCreateDM(userId: string, otherId: string): Promise<string> {
  const { data: existing } = await supabase.rpc("get_dm_conversation", {
    user1: userId,
    user2: otherId,
  });
  if (existing) return existing;

  const { data: convo } = await supabase.from("conversations").insert({
    type: "dm",
    created_by: userId,
  }).select().single();

  if (!convo) throw new Error("Failed to create conversation");

  await supabase.from("conversation_members").insert([
    { conversation_id: convo.id, user_id: userId },
    { conversation_id: convo.id, user_id: otherId },
  ]);

  return convo.id;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string, cursor?: string): Promise<Message[]> {
  let query = supabase
    .from("messages")
    .select(`*, profiles(*)`)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (cursor) query = query.lt("created_at", cursor);

  const { data } = await query;
  return (data ?? []).reverse();
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  opts?: { mediaUrl?: string; mediaType?: string; replyToId?: string; postId?: string }
) {
  const { data, error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    media_url: opts?.mediaUrl ?? null,
    media_type: opts?.mediaType ?? null,
    reply_to_id: opts?.replyToId ?? null,
    post_id: opts?.postId ?? null,
    is_deleted: false,
  }).select(`*, profiles(*)`).single();

  if (error) throw new Error(error.message);

  await supabase
    .from("conversation_members")
    .update({ unread_count: supabase.rpc("increment_unread" as any) as any })
    .eq("conversation_id", conversationId)
    .neq("user_id", senderId);

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);

  return data;
}

export async function deleteMessage(messageId: string, senderId: string) {
  const { error } = await supabase
    .from("messages")
    .update({ is_deleted: true, content: "This message was deleted" })
    .eq("id", messageId)
    .eq("sender_id", senderId);
  if (error) throw new Error(error.message);
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
  const { data } = await supabase
    .from("blocks")
    .select("blocker_id")
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId)
    .maybeSingle();
  return !!data;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadMedia(
  fileUri: string,
  fileName: string,
  mimeType: string,
  bucket = "media"
): Promise<string> {
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const path = `${Date.now()}_${fileName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) throw new Error(error.message);
  return getPublicUrl(bucket, path);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  return count ?? 0;
}

// ─── Stories ─────────────────────────────────────────────────────────────────

export async function fetchStories(userId: string) {
  const { data } = await supabase
    .from("stories")
    .select(`*, profiles(*)`)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

// ─── Live Sessions ────────────────────────────────────────────────────────────

export async function fetchLiveSessions() {
  const { data } = await supabase
    .from("live_sessions")
    .select(`*, profiles(*)`)
    .eq("is_active", true)
    .order("viewers_count", { ascending: false });
  return data ?? [];
}

export async function startLiveSession(hostId: string, title: string) {
  const { data, error } = await supabase.from("live_sessions").insert({
    host_id: hostId,
    title,
    is_active: true,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function endLiveSession(sessionId: string) {
  await supabase.from("live_sessions").update({
    is_active: false,
    ended_at: new Date().toISOString(),
  }).eq("id", sessionId);
}

// ─── AI (OpenRouter) ─────────────────────────────────────────────────────────

export async function generateAICaption(context: string): Promise<string> {
  const openrouterKey = process.env.EXPO_PUBLIC_OPENROUTER_KEY;
  if (!openrouterKey) return "";

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.1-8b-instruct:free",
      messages: [
        {
          role: "system",
          content: "You are a social media caption writer. Generate engaging, short captions with relevant hashtags. Keep it under 150 characters.",
        },
        { role: "user", content: `Write a caption for: ${context}` },
      ],
      max_tokens: 100,
    }),
  });

  if (!resp.ok) return "";
  const json = await resp.json() as any;
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function generateAIReplySuggestion(messageContext: string): Promise<string[]> {
  const openrouterKey = process.env.EXPO_PUBLIC_OPENROUTER_KEY;
  if (!openrouterKey) return [];

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.1-8b-instruct:free",
      messages: [
        {
          role: "system",
          content: "Generate 3 short reply suggestions (under 50 chars each) for a chat message. Return as JSON array of strings only.",
        },
        { role: "user", content: `Last message: "${messageContext}"` },
      ],
      max_tokens: 80,
    }),
  });

  if (!resp.ok) return [];
  const json = await resp.json() as any;
  const text = json.choices?.[0]?.message?.content?.trim() ?? "[]";
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.slice(0, 3) : [];
  } catch {
    return [];
  }
}
