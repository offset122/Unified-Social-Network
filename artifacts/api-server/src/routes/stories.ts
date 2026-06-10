import { Router, type IRouter } from "express";
import { eq, sql, gt, inArray, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  storiesTable,
  storyViewsTable,
  followsTable,
} from "@workspace/db";

const router: IRouter = Router();

function buildStory(
  story: typeof storiesTable.$inferSelect,
  profile: typeof profilesTable.$inferSelect | undefined,
  user: typeof usersTable.$inferSelect | undefined,
  isViewed: boolean,
) {
  return {
    id: story.id,
    author: {
      id: story.authorId,
      username: profile?.username ?? "unknown",
      displayName: profile?.displayName ?? "Unknown",
      avatarUrl: profile?.avatarUrl ?? user?.profileImageUrl ?? null,
      isFollowing: false,
    },
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    viewsCount: story.viewsCount,
    isViewed,
    expiresAt: story.expiresAt.toISOString(),
    createdAt: story.createdAt.toISOString(),
  };
}

// GET /stories
router.get("/stories", async (req, res): Promise<void> => {
  const now = new Date();

  let authorIds: string[] = [];
  if (req.isAuthenticated()) {
    const following = await db
      .select({ id: followsTable.followingId })
      .from(followsTable)
      .where(eq(followsTable.followerId, req.user.id));
    authorIds = [req.user.id, ...following.map((f) => f.id)];
  }

  const stories =
    authorIds.length > 0
      ? await db
          .select()
          .from(storiesTable)
          .where(
            and(
              inArray(storiesTable.authorId, authorIds),
              gt(storiesTable.expiresAt, now),
            ),
          )
          .orderBy(sql`${storiesTable.createdAt} DESC`)
      : await db
          .select()
          .from(storiesTable)
          .where(gt(storiesTable.expiresAt, now))
          .orderBy(sql`${storiesTable.createdAt} DESC`)
          .limit(50);

  // Get viewed story IDs for the current user
  const viewedIds = new Set<string>();
  if (req.isAuthenticated() && stories.length > 0) {
    const storyIds = stories.map((s) => s.id);
    const views = await db
      .select({ storyId: storyViewsTable.storyId })
      .from(storyViewsTable)
      .where(
        and(
          eq(storyViewsTable.viewerId, req.user.id),
          inArray(storyViewsTable.storyId, storyIds),
        ),
      );
    views.forEach((v) => viewedIds.add(v.storyId));
  }

  // REPLACE with this one line:
  const groups = new Map<string, { profile: any; user: any; stories: any[] }>();
  for (const story of stories) {
    if (!groups.has(story.authorId)) {
      const [profile] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, story.authorId));
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, story.authorId));
      groups.set(story.authorId, { profile, user, stories: [] });
    }
    groups.get(story.authorId)!.stories.push(story);
  }

  const result = Array.from(groups.entries()).map(
    ([authorId, { profile, user, stories: authorStories }]) => ({
      author: {
        id: authorId,
        username: profile?.username ?? "unknown",
        displayName: profile?.displayName ?? "Unknown",
        avatarUrl: profile?.avatarUrl ?? user?.profileImageUrl ?? null,
        isFollowing: false,
      },
      stories: authorStories.map((s) =>
        buildStory(s, profile, user, viewedIds.has(s.id)),
      ),
      hasUnviewed: authorStories.some((s) => !viewedIds.has(s.id)),
    }),
  );

  res.json(result);
});

// POST /stories
router.post("/stories", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { mediaUrl, mediaType } = req.body as {
    mediaUrl: string;
    mediaType: "image" | "video";
  };
  if (!mediaUrl || !mediaType) {
    res.status(400).json({ error: "mediaUrl and mediaType are required" });
    return;
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [story] = await db
    .insert(storiesTable)
    .values({ authorId: req.user.id, mediaUrl, mediaType, expiresAt })
    .returning();

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, req.user.id));
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  res.status(201).json(buildStory(story, profile, user, false));
});

// POST /stories/:storyId/view
router.post("/stories/:storyId/view", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = Array.isArray(req.params.storyId)
    ? req.params.storyId[0]
    : req.params.storyId;
  const inserted = await db
    .insert(storyViewsTable)
    .values({ storyId: raw, viewerId: req.user.id })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) {
    await db
      .update(storiesTable)
      .set({ viewsCount: sql`${storiesTable.viewsCount} + 1` })
      .where(eq(storiesTable.id, raw));
  }
  res.json({ success: true });
});

// GET /stories/:storyId/viewers
router.get("/stories/:storyId/viewers", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.storyId)
    ? req.params.storyId[0]
    : req.params.storyId;
  const rows = await db
    .select({ user: usersTable, profile: profilesTable })
    .from(storyViewsTable)
    .innerJoin(usersTable, eq(usersTable.id, storyViewsTable.viewerId))
    .innerJoin(
      profilesTable,
      eq(profilesTable.userId, storyViewsTable.viewerId),
    )
    .where(eq(storyViewsTable.storyId, raw))
    .limit(100);

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

export default router;
