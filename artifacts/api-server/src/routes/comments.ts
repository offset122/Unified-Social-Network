import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  commentsTable,
  postsTable,
  notificationsTable,
} from "@workspace/db";
import { io } from "../app";

const router: IRouter = Router();

async function buildComment(comment: typeof commentsTable.$inferSelect) {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, comment.authorId));
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, comment.authorId));

  return {
    id: comment.id,
    author: {
      id: comment.authorId,
      username: profile?.username ?? "unknown",
      displayName: profile?.displayName ?? "Unknown",
      avatarUrl: profile?.avatarUrl ?? user?.profileImageUrl ?? null,
      isFollowing: false,
    },
    content: comment.content,
    postId: comment.postId ?? null,
    parentId: comment.parentId ?? null,
    repliesCount: comment.repliesCount,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

// GET /posts/:postId/comments
router.get("/posts/:postId/comments", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const cursor = req.query.cursor as string | undefined;
  const rows = await db
    .select()
    .from(commentsTable)
    .where(
      cursor
        ? sql`${commentsTable.postId} = ${raw} AND ${commentsTable.parentId} IS NULL AND ${commentsTable.id} < ${cursor}`
        : sql`${commentsTable.postId} = ${raw} AND ${commentsTable.parentId} IS NULL`
    )
    .orderBy(sql`${commentsTable.createdAt} ASC`)
    .limit(30);

  const items = await Promise.all(rows.map(buildComment));
  const nextCursor = rows.length === 30 ? rows[rows.length - 1].id : null;
  res.json({ items, nextCursor });
});

// POST /posts/:postId/comments
router.post("/posts/:postId/comments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const { content } = req.body as { content: string };
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const [comment] = await db
    .insert(commentsTable)
    .values({ authorId: req.user.id, postId: raw, content })
    .returning();

  await db
    .update(postsTable)
    .set({ commentsCount: sql`${postsTable.commentsCount} + 1` })
    .where(eq(postsTable.id, raw));

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, raw));
  if (post && post.authorId !== req.user.id) {
    await db.insert(notificationsTable).values({
      userId: post.authorId,
      actorId: req.user.id,
      type: "comment",
      postId: raw,
      commentId: comment.id,
    });
    io.to(`user:${post.authorId}`).emit("notification", { type: "comment" });
  }

  res.status(201).json(await buildComment(comment));
});

// PATCH /comments/:commentId
router.patch("/comments/:commentId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
  const { content } = req.body as { content: string };
  const [comment] = await db
    .update(commentsTable)
    .set({ content, updatedAt: new Date() })
    .where(sql`${commentsTable.id} = ${raw} AND ${commentsTable.authorId} = ${req.user.id}`)
    .returning();
  if (!comment) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  res.json(await buildComment(comment));
});

// DELETE /comments/:commentId
router.delete("/comments/:commentId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
  const [comment] = await db
    .delete(commentsTable)
    .where(sql`${commentsTable.id} = ${raw} AND ${commentsTable.authorId} = ${req.user.id}`)
    .returning();
  if (!comment) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  if (comment.postId) {
    await db
      .update(postsTable)
      .set({ commentsCount: sql`GREATEST(${postsTable.commentsCount} - 1, 0)` })
      .where(eq(postsTable.id, comment.postId));
  }
  if (comment.parentId) {
    await db
      .update(commentsTable)
      .set({ repliesCount: sql`GREATEST(${commentsTable.repliesCount} - 1, 0)` })
      .where(eq(commentsTable.id, comment.parentId));
  }
  res.sendStatus(204);
});

// GET /comments/:commentId/replies
router.get("/comments/:commentId/replies", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
  const rows = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.parentId, raw))
    .orderBy(sql`${commentsTable.createdAt} ASC`)
    .limit(30);
  const items = await Promise.all(rows.map(buildComment));
  res.json({ items, nextCursor: null });
});

// POST /comments/:commentId/replies
router.post("/comments/:commentId/replies", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
  const { content } = req.body as { content: string };
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const [parent] = await db.select().from(commentsTable).where(eq(commentsTable.id, raw));
  if (!parent) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  const [reply] = await db
    .insert(commentsTable)
    .values({ authorId: req.user.id, postId: parent.postId, parentId: raw, content })
    .returning();
  await db
    .update(commentsTable)
    .set({ repliesCount: sql`${commentsTable.repliesCount} + 1` })
    .where(eq(commentsTable.id, raw));

  if (parent.authorId !== req.user.id) {
    await db.insert(notificationsTable).values({
      userId: parent.authorId,
      actorId: req.user.id,
      type: "reply",
      commentId: raw,
    });
    io.to(`user:${parent.authorId}`).emit("notification", { type: "reply" });
  }

  res.status(201).json(await buildComment(reply));
});

export default router;
