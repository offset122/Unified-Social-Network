import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, profilesTable, liveSessionsTable } from "@workspace/db";
import { io } from "../app";

const router: IRouter = Router();

async function buildSession(s: typeof liveSessionsTable.$inferSelect) {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, s.hostId));
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, s.hostId));
  return {
    id: s.id,
    host: {
      id: s.hostId,
      username: profile?.username ?? "unknown",
      displayName: profile?.displayName ?? "Unknown",
      avatarUrl: profile?.avatarUrl ?? user?.profileImageUrl ?? null,
      isFollowing: false,
    },
    title: s.title,
    viewersCount: s.viewersCount,
    isActive: s.isActive,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
  };
}

// GET /live/sessions — list active sessions
router.get("/live/sessions", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(liveSessionsTable)
    .where(eq(liveSessionsTable.isActive, true))
    .orderBy(sql`${liveSessionsTable.startedAt} DESC`)
    .limit(20);
  const items = await Promise.all(rows.map(buildSession));
  res.json(items);
});

// POST /live/start — start a live session
router.post("/live/start", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { title } = req.body as { title?: string };
  // End any existing active session for this host
  await db
    .update(liveSessionsTable)
    .set({ isActive: false, endedAt: new Date() })
    .where(
      sql`${liveSessionsTable.hostId} = ${req.user.id} AND ${liveSessionsTable.isActive} = true`,
    );
  const [session] = await db
    .insert(liveSessionsTable)
    .values({
      hostId: req.user.id,
      title: title ?? "Live",
    })
    .returning();
  io.emit("live:new-session", { sessionId: session.id });
  res.status(201).json(await buildSession(session));
});

// DELETE /live/end — end the host's active session
router.delete("/live/end", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db
    .update(liveSessionsTable)
    .set({ isActive: false, endedAt: new Date() })
    .where(
      sql`${liveSessionsTable.hostId} = ${req.user.id} AND ${liveSessionsTable.isActive} = true`,
    );
  io.to(`live:${req.user.id}`).emit("live:ended");
  res.status(204).end();
});

// POST /live/:sessionId/join — increment viewer count
router.post("/live/:sessionId/join", async (req, res): Promise<void> => {
  const { sessionId } = req.params;
  const [session] = await db
    .update(liveSessionsTable)
    .set({ viewersCount: sql`${liveSessionsTable.viewersCount} + 1` })
    .where(
      sql`${liveSessionsTable.id} = ${sessionId} AND ${liveSessionsTable.isActive} = true`,
    )
    .returning();
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  io.to(`live:${sessionId}`).emit("live:viewer-count", {
    count: session.viewersCount,
  });
  res.json({ viewersCount: session.viewersCount });
});

// DELETE /live/:sessionId/leave — decrement viewer count
router.delete("/live/:sessionId/leave", async (req, res): Promise<void> => {
  const { sessionId } = req.params;
  const [session] = await db
    .update(liveSessionsTable)
    .set({
      viewersCount: sql`GREATEST(${liveSessionsTable.viewersCount} - 1, 0)`,
    })
    .where(
      sql`${liveSessionsTable.id} = ${sessionId} AND ${liveSessionsTable.isActive} = true`,
    )
    .returning();
  if (session) {
    io.to(`live:${sessionId}`).emit("live:viewer-count", {
      count: session.viewersCount,
    });
  }
  res.status(204).end();
});

export default router;
