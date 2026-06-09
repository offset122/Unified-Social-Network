import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  postsTable,
  groupsTable,
  channelsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/search", async (req, res): Promise<void> => {
  const q = (req.query.q as string ?? "").trim();
  const type = (req.query.type as string) ?? "all";
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  const pattern = `%${q}%`;
  const viewerId = req.isAuthenticated() ? req.user.id : null;

  const [users, posts, groups, channels] = await Promise.all([
    type === "all" || type === "users"
      ? db
          .select({ user: usersTable, profile: profilesTable })
          .from(profilesTable)
          .innerJoin(usersTable, sql`${usersTable.id} = ${profilesTable.userId}`)
          .where(sql`${profilesTable.username} ILIKE ${pattern} OR ${profilesTable.displayName} ILIKE ${pattern}`)
          .limit(10)
      : Promise.resolve([]),
    type === "all" || type === "posts"
      ? db
          .select()
          .from(postsTable)
          .where(sql`${postsTable.content} ILIKE ${pattern} AND ${postsTable.channelId} IS NULL`)
          .orderBy(sql`${postsTable.createdAt} DESC`)
          .limit(10)
      : Promise.resolve([]),
    type === "all" || type === "groups"
      ? db
          .select()
          .from(groupsTable)
          .where(sql`${groupsTable.name} ILIKE ${pattern}`)
          .limit(10)
      : Promise.resolve([]),
    type === "all" || type === "channels"
      ? db
          .select()
          .from(channelsTable)
          .where(sql`${channelsTable.name} ILIKE ${pattern}`)
          .orderBy(sql`${channelsTable.subscribersCount} DESC`)
          .limit(10)
      : Promise.resolve([]),
  ]);

  res.json({
    users: (users as { user: typeof usersTable.$inferSelect; profile: typeof profilesTable.$inferSelect }[]).map((r) => ({
      id: r.user.id,
      username: r.profile.username,
      displayName: r.profile.displayName,
      avatarUrl: r.profile.avatarUrl ?? r.user.profileImageUrl ?? null,
      isFollowing: false,
    })),
    posts: (posts as typeof postsTable.$inferSelect[]).map((p) => ({
      id: p.id,
      author: { id: p.authorId, username: "unknown", displayName: "Unknown", avatarUrl: null, isFollowing: false },
      content: p.content,
      mediaUrls: p.mediaUrls ?? [],
      mediaType: p.mediaType ?? null,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      sharesCount: p.sharesCount,
      isLiked: false,
      isSaved: false,
      channelId: p.channelId ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    groups: (groups as typeof groupsTable.$inferSelect[]).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description ?? null,
      avatarUrl: g.avatarUrl ?? null,
      membersCount: g.membersCount,
      members: [],
      isAdmin: false,
      lastMessage: null,
      unreadCount: 0,
      createdAt: g.createdAt.toISOString(),
    })),
    channels: (channels as typeof channelsTable.$inferSelect[]).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      avatarUrl: c.avatarUrl ?? null,
      subscribersCount: c.subscribersCount,
      isSubscribed: false,
      isAdmin: false,
      createdAt: c.createdAt.toISOString(),
    })),
    nextCursor: null,
  });
});

export default router;
