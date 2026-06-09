import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  groupsTable,
  groupMembersTable,
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

async function buildGroup(group: typeof groupsTable.$inferSelect, myId: string) {
  const memberRows = await db
    .select()
    .from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, group.id))
    .limit(20);
  const members = await Promise.all(memberRows.map((m) => buildUserSummary(m.userId)));
  const myMembership = memberRows.find((m) => m.userId === myId);

  const [lastMsg] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.groupId, group.id))
    .orderBy(sql`${messagesTable.createdAt} DESC`)
    .limit(1);

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(messagesTable)
    .where(sql`${messagesTable.groupId} = ${group.id} AND ${messagesTable.isRead} = false AND ${messagesTable.senderId} != ${myId}`);

  return {
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    avatarUrl: group.avatarUrl ?? null,
    membersCount: group.membersCount,
    members,
    isAdmin: myMembership?.isAdmin ?? false,
    lastMessage: lastMsg
      ? {
          id: lastMsg.id,
          senderId: lastMsg.senderId,
          sender: null,
          content: lastMsg.content,
          mediaUrl: lastMsg.mediaUrl ?? null,
          mediaType: lastMsg.mediaType ?? null,
          isRead: lastMsg.isRead,
          createdAt: lastMsg.createdAt.toISOString(),
        }
      : null,
    unreadCount: Number(count),
    createdAt: group.createdAt.toISOString(),
  };
}

// GET /groups
router.get("/groups", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const memberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, req.user.id));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const groupIds = memberships.map((m) => m.groupId);
  const groups = await db
    .select()
    .from(groupsTable)
    .where(sql`${groupsTable.id} = ANY(${groupIds})`);

  const items = await Promise.all(groups.map((g) => buildGroup(g, req.user.id)));
  res.json(items);
});

// POST /groups
router.post("/groups", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { name, description, avatarUrl, memberIds } = req.body as {
    name: string;
    description?: string;
    avatarUrl?: string;
    memberIds?: string[];
  };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [group] = await db
    .insert(groupsTable)
    .values({ name, description, avatarUrl, creatorId: req.user.id })
    .returning();

  // Add creator as admin
  await db.insert(groupMembersTable).values({ groupId: group.id, userId: req.user.id, isAdmin: true });

  // Add initial members
  if (memberIds && memberIds.length > 0) {
    await db.insert(groupMembersTable).values(
      memberIds.filter((id) => id !== req.user.id).map((userId) => ({ groupId: group.id, userId })),
    ).onConflictDoNothing();
    await db
      .update(groupsTable)
      .set({ membersCount: sql`${groupsTable.membersCount} + ${memberIds.length}` })
      .where(eq(groupsTable.id, group.id));
  }

  res.status(201).json(await buildGroup(group, req.user.id));
});

// GET /groups/:groupId
router.get("/groups/:groupId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, raw));
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  res.json(await buildGroup(group, req.user.id));
});

// PATCH /groups/:groupId
router.patch("/groups/:groupId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const { name, description, avatarUrl } = req.body as Record<string, string>;
  const [group] = await db
    .update(groupsTable)
    .set({
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      updatedAt: new Date(),
    })
    .where(eq(groupsTable.id, raw))
    .returning();
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  res.json(await buildGroup(group, req.user.id));
});

// POST /groups/:groupId/members
router.post("/groups/:groupId/members", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const { userId } = req.body as { userId: string };
  await db.insert(groupMembersTable).values({ groupId: raw, userId }).onConflictDoNothing();
  await db
    .update(groupsTable)
    .set({ membersCount: sql`${groupsTable.membersCount} + 1` })
    .where(eq(groupsTable.id, raw));
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, raw));
  res.json(await buildGroup(group!, req.user.id));
});

// DELETE /groups/:groupId/members/:userId
router.delete("/groups/:groupId/members/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rawGroup = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db
    .delete(groupMembersTable)
    .where(sql`${groupMembersTable.groupId} = ${rawGroup} AND ${groupMembersTable.userId} = ${rawUser}`);
  await db
    .update(groupsTable)
    .set({ membersCount: sql`GREATEST(${groupsTable.membersCount} - 1, 1)` })
    .where(eq(groupsTable.id, rawGroup));
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, rawGroup));
  res.json(await buildGroup(group!, req.user.id));
});

// GET /groups/:groupId/messages
router.get("/groups/:groupId/messages", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const cursor = req.query.cursor as string | undefined;
  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      cursor
        ? sql`${messagesTable.groupId} = ${raw} AND ${messagesTable.id} < ${cursor}`
        : eq(messagesTable.groupId, raw),
    )
    .orderBy(sql`${messagesTable.createdAt} DESC`)
    .limit(50);

  const items = await Promise.all(
    rows.map(async (msg) => {
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
    }),
  );

  const nextCursor = rows.length === 50 ? rows[rows.length - 1].id : null;
  res.json({ items: items.reverse(), nextCursor });
});

// POST /groups/:groupId/messages
router.post("/groups/:groupId/messages", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
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
    .values({ groupId: raw, senderId: req.user.id, content, mediaUrl, mediaType })
    .returning();
  const sender = await buildUserSummary(req.user.id);
  const built = {
    id: msg.id,
    senderId: msg.senderId,
    sender,
    content: msg.content,
    mediaUrl: msg.mediaUrl ?? null,
    mediaType: msg.mediaType ?? null,
    isRead: msg.isRead,
    createdAt: msg.createdAt.toISOString(),
  };
  io.to(`group:${raw}`).emit("new_message", { groupId: raw, message: built });
  res.status(201).json(built);
});

export default router;
