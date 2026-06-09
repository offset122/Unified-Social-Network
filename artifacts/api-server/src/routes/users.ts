import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  followsTable,
  postsTable,
  likesTable,
  savesTable,
} from "@workspace/db";

const router: IRouter = Router();

function buildUserProfile(
  user: typeof usersTable.$inferSelect,
  profile: typeof profilesTable.$inferSelect,
  isFollowing: boolean,
  isMe: boolean,
) {
  return {
    id: user.id,
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio ?? null,
    avatarUrl: profile.avatarUrl ?? user.profileImageUrl ?? null,
    coverUrl: profile.coverUrl ?? null,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    postsCount: profile.postsCount,
    isFollowing,
    isMe,
    createdAt: profile.createdAt.toISOString(),
  };
}

async function ensureProfile(userId: string, firstName: string | null, lastName: string | null, email: string | null) {
  const existing = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
  if (existing.length > 0) return existing[0];
  const username = (email?.split("@")[0] ?? `user_${userId.slice(0, 8)}`).replace(/[^a-z0-9_]/gi, "_");
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || username;
  const [profile] = await db.insert(profilesTable).values({
    userId,
    username: `${username}_${Date.now()}`,
    displayName,
  }).onConflictDoNothing().returning();
  return profile ?? existing[0];
}

// GET /users/me
router.get("/users/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const u = req.user;
  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, u.id));
  if (!profile) {
    profile = await ensureProfile(u.id, u.firstName, u.lastName, u.email) as typeof profilesTable.$inferSelect;
  }
  res.json(buildUserProfile(u as typeof usersTable.$inferSelect, profile, false, true));
});

// PATCH /users/me
router.patch("/users/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { username, displayName, bio, avatarUrl, coverUrl } = req.body as Record<string, string>;
  const [profile] = await db
    .update(profilesTable)
    .set({
      ...(username && { username }),
      ...(displayName && { displayName }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(coverUrl !== undefined && { coverUrl }),
      updatedAt: new Date(),
    })
    .where(eq(profilesTable.userId, req.user.id))
    .returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  res.json(buildUserProfile(user, profile, false, true));
});

// GET /users/:userId
router.get("/users/:userId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, raw));
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, raw));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  let isFollowing = false;
  if (req.isAuthenticated() && req.user.id !== raw) {
    const [follow] = await db
      .select()
      .from(followsTable)
      .where(
        sql`${followsTable.followerId} = ${req.user.id} AND ${followsTable.followingId} = ${raw}`,
      );
    isFollowing = !!follow;
  }
  res.json(buildUserProfile(user, profile, isFollowing, req.isAuthenticated() && req.user.id === raw));
});

// GET /users/:userId/followers
router.get("/users/:userId/followers", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const rows = await db
    .select({ user: usersTable, profile: profilesTable })
    .from(followsTable)
    .innerJoin(usersTable, eq(usersTable.id, followsTable.followerId))
    .innerJoin(profilesTable, eq(profilesTable.userId, followsTable.followerId))
    .where(eq(followsTable.followingId, raw))
    .limit(50);

  res.json({
    items: rows.map((r) => ({
      id: r.user.id,
      username: r.profile.username,
      displayName: r.profile.displayName,
      avatarUrl: r.profile.avatarUrl ?? r.user.profileImageUrl ?? null,
      isFollowing: false,
    })),
    nextCursor: null,
  });
});

// GET /users/:userId/following
router.get("/users/:userId/following", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const rows = await db
    .select({ user: usersTable, profile: profilesTable })
    .from(followsTable)
    .innerJoin(usersTable, eq(usersTable.id, followsTable.followingId))
    .innerJoin(profilesTable, eq(profilesTable.userId, followsTable.followingId))
    .where(eq(followsTable.followerId, raw))
    .limit(50);

  res.json({
    items: rows.map((r) => ({
      id: r.user.id,
      username: r.profile.username,
      displayName: r.profile.displayName,
      avatarUrl: r.profile.avatarUrl ?? r.user.profileImageUrl ?? null,
      isFollowing: false,
    })),
    nextCursor: null,
  });
});

// GET /users/:userId/posts
router.get("/users/:userId/posts", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, raw));
  const rows = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, raw))
    .orderBy(sql`${postsTable.createdAt} DESC`)
    .limit(20);

  const authorSummary = profile
    ? { id: raw, username: profile.username, displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null, isFollowing: false }
    : { id: raw, username: "unknown", displayName: "Unknown", avatarUrl: null, isFollowing: false };

  const myId = req.isAuthenticated() ? req.user.id : null;
  const postIds = rows.map((p) => p.id);
  const myLikes = myId && postIds.length > 0
    ? await db.select().from(likesTable).where(sql`${likesTable.userId} = ${myId} AND ${likesTable.postId} = ANY(${postIds})`)
    : [];
  const mySaves = myId && postIds.length > 0
    ? await db.select().from(savesTable).where(sql`${savesTable.userId} = ${myId} AND ${savesTable.postId} = ANY(${postIds})`)
    : [];
  const likedSet = new Set(myLikes.map((l) => l.postId));
  const savedSet = new Set(mySaves.map((s) => s.postId));

  res.json({
    items: rows.map((p) => ({
      id: p.id,
      author: authorSummary,
      content: p.content,
      mediaUrls: p.mediaUrls ?? [],
      mediaType: p.mediaType ?? null,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      sharesCount: p.sharesCount,
      isLiked: likedSet.has(p.id),
      isSaved: savedSet.has(p.id),
      channelId: p.channelId ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    nextCursor: null,
  });
});

export default router;
