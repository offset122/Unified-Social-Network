import { getEnvValue, supabase } from "./supabase";

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
  reply_to?: { id: string; content: string; media_type: string | null; profiles?: Profile } | null;
  shared_post?: { id: string; content: string; media_urls: string[]; media_type: string | null; profiles?: Profile } | null;
};

export type Conversation = {
  id: string; type: "dm" | "group"; name: string | null; avatar_url: string | null;
  created_by: string; last_message_at: string | null; created_at: string;
  unread_count?: number; other_user?: Profile; last_message?: string; last_message_type?: string | null;
};

export type LiveSession = {
  id: string; host_id: string; title: string; viewers_count: number;
  is_active: boolean; started_at: string; ended_at: string | null; profiles?: Profile;
};

export type LiveMessage = {
  id: string; session_id: string; user_id: string; content: string; created_at: string; profiles?: Profile;
};

export type Notification = {
  id: string; user_id: string; actor_id: string | null; type: string;
  post_id: string | null; comment_id: string | null; is_read: boolean; created_at: string;
  actor?: Profile;
};

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchFeed(userId: string, cursor?: string): Promise<Post[]> {
  let q = supabase.from("posts").select("*, profiles(*)").eq("is_reel", false).eq("visibility", "public").order("created_at", { ascending: false }).limit(20);
  if (cursor) q = q.lt("created_at", cursor);
  const { data } = await q;
  if (!data) return [];
  const liked = await fetchUserLikes(userId, data.map(p => p.id));
  const saved = await fetchUserSaves(userId, data.map(p => p.id));
  return data.map(p => ({ ...p, media_urls: p.media_urls ?? [], is_liked: liked.has(p.id), is_saved: saved.has(p.id) }));
}

export async function fetchReels(userId: string, cursor?: string): Promise<Post[]> {
  let q = supabase.from("posts").select("*, profiles(*)").eq("is_reel", true).eq("visibility", "public").order("created_at", { ascending: false }).limit(10);
  if (cursor) q = q.lt("created_at", cursor);
  const { data } = await q;
  if (!data) return [];
  const liked = await fetchUserLikes(userId, data.map(p => p.id));
  const saved = await fetchUserSaves(userId, data.map(p => p.id));
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
  const { data } = await supabase.from("comments").select("*, profiles(*)").eq("post_id", postId).is("parent_id", null).order("created_at", { ascending: true });
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

export async function fetchUserPosts(userId: string, isReel = false): Promise<Post[]> {
  const { data } = await supabase.from("posts").select("*").eq("author_id", userId).eq("is_reel", isReel).order("created_at", { ascending: false });
  return (data ?? []).map(p => ({ ...p, media_urls: p.media_urls ?? [] }));
}

export async function fetchSavedPosts(userId: string): Promise<Post[]> {
  const { data } = await supabase.from("saves").select("posts(*, profiles(*))").eq("user_id", userId).order("created_at", { ascending: false });
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
  try {
    const { data: existing } = await supabase.rpc("get_dm_conversation", { user1: userId, user2: otherId });
    if (existing) return existing as string;
  } catch {}

  const { data: myConvos } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);

  if (myConvos?.length) {
    const myIds = (myConvos as any[]).map(r => r.conversation_id as string);
    const { data: sharedMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", otherId)
      .in("conversation_id", myIds);

    if (sharedMemberships?.length) {
      const sharedIds = (sharedMemberships as any[]).map(r => r.conversation_id as string);
      const { data: dmConvo } = await supabase
        .from("conversations")
        .select("id")
        .eq("type", "dm")
        .in("id", sharedIds)
        .limit(1)
        .maybeSingle();
      if ((dmConvo as any)?.id) return (dmConvo as any).id as string;
    }
  }

  const { data: convo, error } = await supabase
    .from("conversations")
    .insert({ type: "dm", created_by: userId })
    .select("id")
    .single();
  if (error || !(convo as any)?.id) throw new Error(error?.message ?? "Failed to create conversation");
  await supabase.from("conversation_members").insert([
    { conversation_id: (convo as any).id, user_id: userId },
    { conversation_id: (convo as any).id, user_id: otherId },
  ]);
  return (convo as any).id as string;
}

export async function createGroupConversation(creatorId: string, name: string, memberIds: string[]): Promise<string> {
  const { data: convo, error } = await supabase.from("conversations").insert({ type: "group", name, created_by: creatorId }).select("id").single();
  if (error || !convo?.id) throw new Error(error?.message ?? "Failed");
  await supabase.from("conversation_members").insert([creatorId, ...memberIds].map(uid => ({ conversation_id: convo.id, user_id: uid, is_admin: uid === creatorId })));
  return convo.id;
}

export async function fetchConversationMembers(conversationId: string): Promise<Profile[]> {
  const { data } = await supabase.from("conversation_members").select("profiles(*)").eq("conversation_id", conversationId);
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string, cursor?: string): Promise<Message[]> {
  let q = supabase.from("messages")
    .select("*, profiles(*), reply_to:reply_to_id(id, content, media_type, profiles(*)), shared_post:post_id(id, content, media_urls, media_type, profiles(*))")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(40);
  if (cursor) q = q.lt("created_at", cursor);
  const { data } = await q;
  return ((data ?? []).reverse()) as Message[];
}

export async function sendMessage(conversationId: string, senderId: string, content: string, opts?: { mediaUrl?: string; mediaType?: string; replyToId?: string; postId?: string }) {
  const { data, error } = await supabase.from("messages").insert({
    conversation_id: conversationId, sender_id: senderId, content,
    media_url: opts?.mediaUrl ?? null, media_type: opts?.mediaType ?? null,
    reply_to_id: opts?.replyToId ?? null, post_id: opts?.postId ?? null, is_deleted: false,
  }).select("*, profiles(*), reply_to:reply_to_id(id, content, media_type, profiles(*)), shared_post:post_id(id, content, media_urls, media_type, profiles(*))").single();
  if (error) throw new Error(error.message);
  await supabase.from("conversation_members").update({ unread_count: supabase.rpc("increment_unread" as any) as any }).eq("conversation_id", conversationId).neq("user_id", senderId);
  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
  return data as Message;
}

export async function deleteMessage(messageId: string, senderId: string) {
  const { error } = await supabase.from("messages").update({ is_deleted: true, content: "This message was deleted" }).eq("id", messageId).eq("sender_id", senderId);
  if (error) throw new Error(error.message);
}

export async function markConversationRead(conversationId: string, userId: string) {
  await supabase.from("conversation_members").update({ unread_count: 0 }).eq("conversation_id", conversationId).eq("user_id", userId);
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

export async function uploadMedia(fileUri: string, fileName: string, mimeType: string, bucket = "media"): Promise<string> {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const path = `${Date.now()}_${fileName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: mimeType, upsert: true });
  if (error) throw new Error(error.message);
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
  const { data } = await supabase.from("stories").select("*, profiles(*)").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export async function createStory(authorId: string, mediaUrl: string, mediaType: "image" | "video"): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("stories").insert({ author_id: authorId, media_url: mediaUrl, media_type: mediaType, expires_at: expiresAt, views_count: 0 });
  if (error) throw new Error(error.message);
}

// ─── Live Sessions ────────────────────────────────────────────────────────────

export async function fetchLiveSessions(): Promise<LiveSession[]> {
  const { data } = await supabase.from("live_sessions").select("*, profiles(*)").eq("is_active", true).order("viewers_count", { ascending: false });
  return (data ?? []) as LiveSession[];
}

export async function startLiveSession(hostId: string, title: string): Promise<LiveSession> {
  await supabase.from("live_sessions").update({ is_active: false, ended_at: new Date().toISOString() }).eq("host_id", hostId).eq("is_active", true);
  const { data, error } = await supabase.from("live_sessions").insert({ host_id: hostId, title, is_active: true, viewers_count: 0 }).select("*, profiles(*)").single();
  if (error) throw new Error(error.message);
  return data as LiveSession;
}

export async function endLiveSession(sessionId: string) {
  await supabase.from("live_sessions").update({ is_active: false, ended_at: new Date().toISOString() }).eq("id", sessionId);
}

export async function fetchLiveMessages(sessionId: string): Promise<LiveMessage[]> {
  const { data } = await supabase.from("live_messages").select("*, profiles(*)").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(100);
  return (data ?? []) as LiveMessage[];
}

export async function sendLiveMessage(sessionId: string, userId: string, content: string): Promise<LiveMessage> {
  const { data, error } = await supabase.from("live_messages").insert({ session_id: sessionId, user_id: userId, content }).select("*, profiles(*)").single();
  if (error) throw new Error(error.message);
  return data as LiveMessage;
}

// ─── AI (OpenRouter) ─────────────────────────────────────────────────────────

async function callAI(system: string, userMsg: string, maxTokens = 150): Promise<string> {
  const key = process.env.EXPO_PUBLIC_OPENROUTER_KEY;
  if (!key) return "";
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct:free", messages: [{ role: "system", content: system }, { role: "user", content: userMsg }], max_tokens: maxTokens }),
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
