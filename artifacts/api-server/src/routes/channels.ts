import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  channelsTable,
  channelMembersTable,
  postsTable,
  likesTable,
  savesTable,
} from "@workspace/db";
import { buildPost } from "./posts";

const router: IRouter = Router();

async function buildChannel(channel: typeof channelsTable.$inferSelect, myId: string | null) {
  let isSubscribed = false;
  let isAdmin = false;
  if (myId) {
    const [membership] = await db
      .select()
      .from(channelMembersTable)
      .where(sql`${channelMembersTable.channelId} = ${channel.id} AND ${channelMembersTable.userId} = ${myId}`);
    isSubscribed = !!membership;
    isAdmin = membership?.isAdmin ?? false;
  }
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description ?? null,
    avatarUrl: channel.avatarUrl ?? null,
    subscribersCount: channel.subscribersCount,
    isSubscribed,
    isAdmin,
    createdAt: channel.createdAt.toISOString(),
  };
}

// GET /channels
router.get("/channels", async (req, res): Promise<void> => {
  const channels = await db
    .select()
    .from(channelsTable)
    .orderBy(sql`${channelsTable.subscribersCount} DESC`)
    .limit(30);
  const myId = req.isAuthenticated() ? req.user.id : null;
  const items = await Promise.all(channels.map((c) => buildChannel(c, myId)));
  res.json(items);
});

// GET /channels/subscribed
router.get("/channels/subscribed", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const memberships = await db
    .select({ channelId: channelMembersTable.channelId })
    .from(channelMembersTable)
    .where(eq(channelMembersTable.userId, req.user.id));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const channelIds = memberships.map((m) => m.channelId);
  const channels = await db
    .select()
    .from(channelsTable)
    .where(sql`${channelsTable.id} = ANY(${channelIds})`);

  const items = await Promise.all(channels.map((c) => buildChannel(c, req.user.id)));
  res.json(items);
});

// POST /channels
router.post("/channels", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { name, description, avatarUrl } = req.body as {
    name: string;
    description?: string;
    avatarUrl?: string;
  };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [channel] = await db
    .insert(channelsTable)
    .values({ name, description, avatarUrl, creatorId: req.user.id })
    .returning();
  await db.insert(channelMembersTable).values({
    channelId: channel.id,
    userId: req.user.id,
    isAdmin: true,
  });
  res.status(201).json(await buildChannel(channel, req.user.id));
});

// GET /channels/:channelId
router.get("/channels/:channelId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, raw));
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  const myId = req.isAuthenticated() ? req.user.id : null;
  res.json(await buildChannel(channel, myId));
});

// POST /channels/:channelId/subscribe
router.post("/channels/:channelId/subscribe", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  await db
    .insert(channelMembersTable)
    .values({ channelId: raw, userId: req.user.id })
    .onConflictDoNothing();
  await db
    .update(channelsTable)
    .set({ subscribersCount: sql`${channelsTable.subscribersCount} + 1` })
    .where(eq(channelsTable.id, raw));
  res.json({ success: true });
});

// DELETE /channels/:channelId/subscribe
router.delete("/channels/:channelId/subscribe", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  await db
    .delete(channelMembersTable)
    .where(sql`${channelMembersTable.channelId} = ${raw} AND ${channelMembersTable.userId} = ${req.user.id}`);
  await db
    .update(channelsTable)
    .set({ subscribersCount: sql`GREATEST(${channelsTable.subscribersCount} - 1, 0)` })
    .where(eq(channelsTable.id, raw));
  res.json({ success: true });
});

// GET /channels/:channelId/posts
router.get("/channels/:channelId/posts", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  const cursor = req.query.cursor as string | undefined;
  const rows = await db
    .select()
    .from(postsTable)
    .where(
      cursor
        ? sql`${postsTable.channelId} = ${raw} AND ${postsTable.id} < ${cursor}`
        : eq(postsTable.channelId, raw),
    )
    .orderBy(sql`${postsTable.createdAt} DESC`)
    .limit(20);

  const viewerId = req.isAuthenticated() ? req.user.id : null;
  const items = await Promise.all(rows.map((p) => buildPost(p, viewerId)));
  res.json({ items, nextCursor: rows.length === 20 ? rows[rows.length - 1].id : null });
});

// POST /channels/:channelId/posts
router.post("/channels/:channelId/posts", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  const [membership] = await db
    .select()
    .from(channelMembersTable)
    .where(sql`${channelMembersTable.channelId} = ${raw} AND ${channelMembersTable.userId} = ${req.user.id} AND ${channelMembersTable.isAdmin} = true`);
  if (!membership) {
    res.status(403).json({ error: "Only admins can broadcast" });
    return;
  }
  const { content, mediaUrls, mediaType } = req.body as {
    content: string;
    mediaUrls?: string[];
    mediaType?: "image" | "video";
  };
  const [post] = await db
    .insert(postsTable)
    .values({ authorId: req.user.id, content, mediaUrls: mediaUrls ?? [], mediaType, channelId: raw })
    .returning();
  res.status(201).json(await buildPost(post, req.user.id));
});

export default router;
