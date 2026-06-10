import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, profilesTable, postsTable, storiesTable, chatsTable } from "@workspace/db";

const router: IRouter = Router();

async function requireAdmin(req: import("express").Request, res: import("express").Response): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
  if (!profile?.isAdmin) {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return false;
  }
  return true;
}

// GET /admin/stats
router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const [[{ usersCount }], [{ postsCount }], [{ storiesCount }], [{ reelsCount }], [{ chatsCount }]] =
    await Promise.all([
      db.select({ usersCount: sql<number>`COUNT(*)` }).from(usersTable),
      db.select({ postsCount: sql<number>`COUNT(*)` }).from(postsTable).where(sql`${postsTable.mediaType} IS NULL OR ${postsTable.mediaType} != 'video'`),
      db.select({ storiesCount: sql<number>`COUNT(*)` }).from(storiesTable),
      db.select({ reelsCount: sql<number>`COUNT(*)` }).from(postsTable).where(sql`${postsTable.mediaType} = 'video'`),
      db.select({ chatsCount: sql<number>`COUNT(*)` }).from(chatsTable),
    ]);

  res.json({
    usersCount: Number(usersCount),
    postsCount: Number(postsCount),
    storiesCount: Number(storiesCount),
    reelsCount: Number(reelsCount),
    chatsCount: Number(chatsCount),
  });
});

// GET /admin/users
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const rows = await db
    .select({ user: usersTable, profile: profilesTable })
    .from(usersTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
    .orderBy(sql`${usersTable.createdAt} DESC`)
    .limit(100);

  res.json(
    rows.map(({ user, profile }) => ({
      id: user.id,
      username: profile?.username ?? "unknown",
      displayName: profile?.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || "User"),
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? user.profileImageUrl ?? null,
      coverUrl: profile?.coverUrl ?? null,
      followersCount: profile?.followersCount ?? 0,
      followingCount: profile?.followingCount ?? 0,
      postsCount: profile?.postsCount ?? 0,
      isFollowing: false,
      isMe: false,
      isAdmin: profile?.isAdmin ?? false,
      isBanned: profile?.isBanned ?? false,
      createdAt: (profile?.createdAt ?? user.createdAt).toISOString(),
    })),
  );
});

// PATCH /admin/users/:userId
router.patch("/admin/users/:userId", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { isAdmin, isBanned } = req.body as { isAdmin?: boolean; isBanned?: boolean };

  const [profile] = await db
    .update(profilesTable)
    .set({
      ...(isAdmin !== undefined && { isAdmin }),
      ...(isBanned !== undefined && { isBanned }),
      updatedAt: new Date(),
    })
    .where(eq(profilesTable.userId, userId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.json({
    id: user.id,
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio ?? null,
    avatarUrl: profile.avatarUrl ?? user.profileImageUrl ?? null,
    coverUrl: profile.coverUrl ?? null,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    postsCount: profile.postsCount,
    isFollowing: false,
    isMe: false,
    isAdmin: profile.isAdmin,
    isBanned: profile.isBanned,
    createdAt: profile.createdAt.toISOString(),
  });
});

// DELETE /admin/posts/:postId
router.delete("/admin/posts/:postId", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const postId = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  await db.delete(postsTable).where(eq(postsTable.id, postId));
  res.sendStatus(204);
});

export default router;
