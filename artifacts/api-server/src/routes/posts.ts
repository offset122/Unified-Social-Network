import { Router, type IRouter } from "express";
import { eq, sql, inArray, and, lt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  postsTable,
  likesTable,
  savesTable,
  followsTable,
  notificationsTable,
} from "@workspace/db";
import { io } from "../app";

const router: IRouter = Router();

async function buildPost(
  post: typeof postsTable.$inferSelect,
  viewerId: string | null,
  authorProfile?: typeof profilesTable.$inferSelect,
) {
  let profile = authorProfile;
  if (!profile) {
    const [p] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, post.authorId));
    profile = p;
  }
  const [authorUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, post.authorId));

  const author = {
    id: post.authorId,
    username: profile?.username ?? "unknown",
    displayName: profile?.displayName ?? "Unknown",
    avatarUrl: profile?.avatarUrl ?? authorUser?.profileImageUrl ?? null,
    isFollowing: false,
  };

  let isLiked = false;
  let isSaved = false;
  if (viewerId) {
    const [like] = await db
      .select()
      .from(likesTable)
      .where(
        sql`${likesTable.userId} = ${viewerId} AND ${likesTable.postId} = ${post.id}`,
      );
    const [save] = await db
      .select()
      .from(savesTable)
      .where(
        sql`${savesTable.userId} = ${viewerId} AND ${savesTable.postId} = ${post.id}`,
      );
    isLiked = !!like;
    isSaved = !!save;
  }

  return {
    id: post.id,
    author,
    content: post.content,
    mediaUrls: post.mediaUrls ?? [],
    mediaType: post.mediaType ?? null,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    sharesCount: post.sharesCount,
    viewsCount: post.viewsCount,
    visibility: post.visibility,
    isLiked,
    isSaved,
    channelId: post.channelId ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

// GET /posts — feed (own posts + followed users)
router.get("/posts", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor as string | undefined;

  const rows = await db
    .select()
    .from(postsTable)
    .where(
      cursor
        ? and(isNull(postsTable.channelId), lt(postsTable.id, cursor))
        : isNull(postsTable.channelId),
    )
    .orderBy(sql`${postsTable.createdAt} DESC`)
    .limit(limit);

  const items = await Promise.all(rows.map((p) => buildPost(p, req.user.id)));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  res.json({ items, nextCursor });
});

// GET /posts/saved
router.get("/posts/saved", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const saves = await db
    .select({ postId: savesTable.postId })
    .from(savesTable)
    .where(eq(savesTable.userId, req.user.id))
    .orderBy(sql`${savesTable.createdAt} DESC`)
    .limit(20);

  if (saves.length === 0) {
    res.json({ items: [], nextCursor: null });
    return;
  }

  const postIds = saves.map((s) => s.postId);
  const rows = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.id, postIds));
  const items = await Promise.all(rows.map((p) => buildPost(p, req.user.id)));
  res.json({ items, nextCursor: null });
});

// GET /posts/reels
router.get("/posts/reels", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const cursor = req.query.cursor as string | undefined;
  const viewerId = req.isAuthenticated() ? req.user.id : null;

  const rows = await db
    .select()
    .from(postsTable)
    .where(
      cursor
        ? sql`${postsTable.mediaType} = 'video' AND ${postsTable.id} < ${cursor}`
        : sql`${postsTable.mediaType} = 'video'`,
    )
    .orderBy(sql`${postsTable.createdAt} DESC`)
    .limit(limit);

  const items = await Promise.all(rows.map((p) => buildPost(p, viewerId)));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  res.json({ items, nextCursor });
});

// GET /posts/explore
router.get("/posts/explore", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(postsTable)
    .where(isNull(postsTable.channelId))
    .orderBy(sql`${postsTable.createdAt} DESC`)
    .limit(30);
  const viewerId = req.isAuthenticated() ? req.user.id : null;
  const items = await Promise.all(rows.map((p) => buildPost(p, viewerId)));
  res.json({ items, nextCursor: null });
});

// POST /posts
router.post("/posts", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { content, mediaUrls, mediaType, visibility } = req.body as {
    content: string;
    mediaUrls?: string[];
    mediaType?: "image" | "video";
    visibility?: "public" | "followers" | "private";
  };
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const [post] = await db
    .insert(postsTable)
    .values({
      authorId: req.user.id,
      content,
      mediaUrls: mediaUrls ?? [],
      mediaType,
      visibility: visibility ?? "public",
    })
    .returning();

  await db
    .update(profilesTable)
    .set({ postsCount: sql`${profilesTable.postsCount} + 1` })
    .where(eq(profilesTable.userId, req.user.id));

  const built = await buildPost(post, req.user.id);

  const followers = await db
    .select({ id: followsTable.followerId })
    .from(followsTable)
    .where(eq(followsTable.followingId, req.user.id));
  for (const f of followers) {
    io.to(`user:${f.id}`).emit("new_post", built);
  }

  res.status(201).json(built);
});

// GET /posts/:postId
router.get("/posts/:postId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, raw));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const viewerId = req.isAuthenticated() ? req.user.id : null;
  res.json(await buildPost(post, viewerId));
});

// PATCH /posts/:postId
router.patch("/posts/:postId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  const { content } = req.body as { content: string };
  const [post] = await db
    .update(postsTable)
    .set({ content, updatedAt: new Date() })
    .where(
      sql`${postsTable.id} = ${raw} AND ${postsTable.authorId} = ${req.user.id}`,
    )
    .returning();
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(await buildPost(post, req.user.id));
});

// DELETE /posts/:postId
router.delete("/posts/:postId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  const [post] = await db
    .delete(postsTable)
    .where(
      sql`${postsTable.id} = ${raw} AND ${postsTable.authorId} = ${req.user.id}`,
    )
    .returning();
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  await db
    .update(profilesTable)
    .set({ postsCount: sql`GREATEST(${profilesTable.postsCount} - 1, 0)` })
    .where(eq(profilesTable.userId, req.user.id));
  res.sendStatus(204);
});

// POST /posts/:postId/like
router.post("/posts/:postId/like", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  await db
    .insert(likesTable)
    .values({ userId: req.user.id, postId: raw })
    .onConflictDoNothing();
  const [post] = await db
    .update(postsTable)
    .set({ likesCount: sql`${postsTable.likesCount} + 1` })
    .where(eq(postsTable.id, raw))
    .returning();

  if (post && post.authorId !== req.user.id) {
    await db.insert(notificationsTable).values({
      userId: post.authorId,
      actorId: req.user.id,
      type: "like",
      postId: raw,
    });
    io.to(`user:${post.authorId}`).emit("notification", { type: "like" });
  }

  res.json({ liked: true, likesCount: post?.likesCount ?? 0 });
});

// DELETE /posts/:postId/like
router.delete("/posts/:postId/like", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  await db
    .delete(likesTable)
    .where(
      sql`${likesTable.userId} = ${req.user.id} AND ${likesTable.postId} = ${raw}`,
    );
  const [post] = await db
    .update(postsTable)
    .set({ likesCount: sql`GREATEST(${postsTable.likesCount} - 1, 0)` })
    .where(eq(postsTable.id, raw))
    .returning();
  res.json({ liked: false, likesCount: post?.likesCount ?? 0 });
});

// POST /posts/:postId/save
router.post("/posts/:postId/save", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  await db
    .insert(savesTable)
    .values({ userId: req.user.id, postId: raw })
    .onConflictDoNothing();
  res.json({ saved: true });
});

// DELETE /posts/:postId/save
router.delete("/posts/:postId/save", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  await db
    .delete(savesTable)
    .where(
      sql`${savesTable.userId} = ${req.user.id} AND ${savesTable.postId} = ${raw}`,
    );
  res.json({ saved: false });
});

export { buildPost };
export default router;
