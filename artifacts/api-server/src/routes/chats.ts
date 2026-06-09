import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  chatsTable,
  messagesTable,
} from "@workspace/db";
import { io } from "../app";

const router: IRouter = Router();

async function buildUserSummary(userId: string) {
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return {
    id: userId,
    username: profile?.username ?? "unknown",
    displayName: profile?.displayName ?? "Unknown",
    avatarUrl: profile?.avatarUrl ?? user?.profileImageUrl ?? null,
    isFollowing: false,
  };
}

async function buildMessage(msg: typeof messagesTable.$inferSelect) {
  const sender = await buildUserSummary(msg.senderId);
  return {
    id: msg.id,
    senderId: msg.senderId,
    sender,
    content: msg.content,
    mediaUrl: msg.mediaUrl ?? null,
    mediaType: msg.mediaType ?? null,
    isRead: msg.isRead,
    createdAt: msg.createdAt.toISOString(),
  };
}

async function buildChat(chat: typeof chatsTable.$inferSelect, myId: string) {
  const participantId = chat.user1Id === myId ? chat.user2Id : chat.user1Id;
  const participant = await buildUserSummary(participantId);
  const [lastMsg] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chat.id))
    .orderBy(sql`${messagesTable.createdAt} DESC`)
    .limit(1);

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(messagesTable)
    .where(sql`${messagesTable.chatId} = ${chat.id} AND ${messagesTable.isRead} = false AND ${messagesTable.senderId} != ${myId}`);

  return {
    id: chat.id,
    participant,
    lastMessage: lastMsg ? await buildMessage(lastMsg) : null,
    unreadCount: Number(count),
    createdAt: chat.createdAt.toISOString(),
  };
}

// GET /chats
router.get("/chats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const chats = await db
    .select()
    .from(chatsTable)
    .where(sql`${chatsTable.user1Id} = ${req.user.id} OR ${chatsTable.user2Id} = ${req.user.id}`)
    .orderBy(sql`${chatsTable.createdAt} DESC`);

  const items = await Promise.all(chats.map((c) => buildChat(c, req.user.id)));
  res.json(items);
});

// POST /chats
router.post("/chats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { participantId } = req.body as { participantId: string };
  if (!participantId) {
    res.status(400).json({ error: "participantId is required" });
    return;
  }
  const myId = req.user.id;
  const [u1, u2] = [myId, participantId].sort();

  // Check if chat already exists
  const [existing] = await db
    .select()
    .from(chatsTable)
    .where(sql`${chatsTable.user1Id} = ${u1} AND ${chatsTable.user2Id} = ${u2}`);

  if (existing) {
    res.json(await buildChat(existing, myId));
    return;
  }

  const [chat] = await db
    .insert(chatsTable)
    .values({ user1Id: u1, user2Id: u2 })
    .returning();

  res.json(await buildChat(chat, myId));
});

// GET /chats/:chatId/messages
router.get("/chats/:chatId/messages", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.chatId) ? req.params.chatId[0] : req.params.chatId;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const cursor = req.query.cursor as string | undefined;

  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      cursor
        ? sql`${messagesTable.chatId} = ${raw} AND ${messagesTable.id} < ${cursor}`
        : eq(messagesTable.chatId, raw),
    )
    .orderBy(sql`${messagesTable.createdAt} DESC`)
    .limit(limit);

  const items = await Promise.all(rows.map(buildMessage));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  res.json({ items: items.reverse(), nextCursor });
});

// POST /chats/:chatId/messages
router.post("/chats/:chatId/messages", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.chatId) ? req.params.chatId[0] : req.params.chatId;
  const { content, mediaUrl, mediaType } = req.body as {
    content: string;
    mediaUrl?: string;
    mediaType?: "image" | "video" | "audio" | "file";
  };
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const [msg] = await db
    .insert(messagesTable)
    .values({ chatId: raw, senderId: req.user.id, content, mediaUrl, mediaType })
    .returning();

  const built = await buildMessage(msg);
  io.to(`chat:${raw}`).emit("new_message", { chatId: raw, message: built });

  // Notify the other user
  const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, raw));
  if (chat) {
    const otherId = chat.user1Id === req.user.id ? chat.user2Id : chat.user1Id;
    io.to(`user:${otherId}`).emit("chat_message", { chatId: raw, message: built });
  }

  res.status(201).json(built);
});

// POST /chats/:chatId/read
router.post("/chats/:chatId/read", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.chatId) ? req.params.chatId[0] : req.params.chatId;
  await db
    .update(messagesTable)
    .set({ isRead: true })
    .where(sql`${messagesTable.chatId} = ${raw} AND ${messagesTable.senderId} != ${req.user.id} AND ${messagesTable.isRead} = false`);
  res.json({ success: true });
});

export default router;
