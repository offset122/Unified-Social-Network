import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { followsTable, profilesTable, notificationsTable } from "@workspace/db";
import { io } from "../app";

const router: IRouter = Router();

// POST /follows/:userId
router.post("/follows/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (raw === req.user.id) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }
  await db
    .insert(followsTable)
    .values({ followerId: req.user.id, followingId: raw })
    .onConflictDoNothing();

  await db
    .update(profilesTable)
    .set({ followingCount: sql`${profilesTable.followingCount} + 1` })
    .where(sql`${profilesTable.userId} = ${req.user.id}`);
  const [target] = await db
    .update(profilesTable)
    .set({ followersCount: sql`${profilesTable.followersCount} + 1` })
    .where(sql`${profilesTable.userId} = ${raw}`)
    .returning();

  await db.insert(notificationsTable).values({
    userId: raw,
    actorId: req.user.id,
    type: "follow",
  });
  io.to(`user:${raw}`).emit("notification", { type: "follow" });

  res.json({ following: true, followersCount: target?.followersCount ?? 0 });
});

// DELETE /follows/:userId
router.delete("/follows/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db
    .delete(followsTable)
    .where(sql`${followsTable.followerId} = ${req.user.id} AND ${followsTable.followingId} = ${raw}`);

  await db
    .update(profilesTable)
    .set({ followingCount: sql`GREATEST(${profilesTable.followingCount} - 1, 0)` })
    .where(sql`${profilesTable.userId} = ${req.user.id}`);
  const [target] = await db
    .update(profilesTable)
    .set({ followersCount: sql`GREATEST(${profilesTable.followersCount} - 1, 0)` })
    .where(sql`${profilesTable.userId} = ${raw}`)
    .returning();

  res.json({ following: false, followersCount: target?.followersCount ?? 0 });
});

export default router;
