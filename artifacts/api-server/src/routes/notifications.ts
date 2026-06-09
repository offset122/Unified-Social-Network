import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, profilesTable, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

async function buildNotification(n: typeof notificationsTable.$inferSelect) {
  let actor = null;
  if (n.actorId) {
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, n.actorId));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, n.actorId));
    actor = {
      id: n.actorId,
      username: profile?.username ?? "unknown",
      displayName: profile?.displayName ?? "Unknown",
      avatarUrl: profile?.avatarUrl ?? user?.profileImageUrl ?? null,
      isFollowing: false,
    };
  }
  return {
    id: n.id,
    type: n.type,
    actor,
    postId: n.postId ?? null,
    commentId: n.commentId ?? null,
    channelId: n.channelId ?? null,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

// GET /notifications
router.get("/notifications", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const cursor = req.query.cursor as string | undefined;
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(
      cursor
        ? sql`${notificationsTable.userId} = ${req.user.id} AND ${notificationsTable.id} < ${cursor}`
        : eq(notificationsTable.userId, req.user.id),
    )
    .orderBy(sql`${notificationsTable.createdAt} DESC`)
    .limit(30);

  const items = await Promise.all(rows.map(buildNotification));
  res.json({ items, nextCursor: rows.length === 30 ? rows[rows.length - 1].id : null });
});

// GET /notifications/unread-count
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notificationsTable)
    .where(sql`${notificationsTable.userId} = ${req.user.id} AND ${notificationsTable.isRead} = false`);
  res.json({ count: Number(count) });
});

// POST /notifications/read-all
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(sql`${notificationsTable.userId} = ${req.user.id} AND ${notificationsTable.isRead} = false`);
  res.json({ success: true });
});

export default router;
