import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

import { usersTable } from "./auth";

// ── Profiles ────────────────────────────────────────────────────────────────
export const profilesTable = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  postsCount: integer("posts_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Follows ──────────────────────────────────────────────────────────────────
export const followsTable = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("follows_following_idx").on(t.followingId),
  ],
);

// ── Posts ────────────────────────────────────────────────────────────────────
export const postMediaTypeEnum = pgEnum("post_media_type", ["image", "video"]);

export const postsTable = pgTable(
  "posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    authorId: text("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    mediaUrls: text("media_urls").array().notNull().default([]),
    mediaType: postMediaTypeEnum("media_type"),
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    sharesCount: integer("shares_count").notNull().default(0),
    channelId: text("channel_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("posts_author_idx").on(t.authorId),
    index("posts_created_at_idx").on(t.createdAt),
    index("posts_channel_idx").on(t.channelId),
  ],
);

// ── Likes ────────────────────────────────────────────────────────────────────
export const likesTable = pgTable(
  "likes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("likes_post_idx").on(t.postId),
  ],
);

// ── Saves ────────────────────────────────────────────────────────────────────
export const savesTable = pgTable(
  "saves",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("saves_post_idx").on(t.postId),
  ],
);

// ── Comments ─────────────────────────────────────────────────────────────────
export const commentsTable = pgTable(
  "comments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    authorId: text("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    postId: text("post_id").references(() => postsTable.id, {
      onDelete: "cascade",
    }),
    parentId: text("parent_id"),
    content: text("content").notNull(),
    repliesCount: integer("replies_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("comments_post_idx").on(t.postId),
    index("comments_parent_idx").on(t.parentId),
  ],
);

// ── Stories ───────────────────────────────────────────────────────────────────
export const storyMediaTypeEnum = pgEnum("story_media_type", ["image", "video"]);

export const storiesTable = pgTable(
  "stories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    authorId: text("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mediaUrl: text("media_url").notNull(),
    mediaType: storyMediaTypeEnum("media_type").notNull(),
    viewsCount: integer("views_count").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("stories_author_idx").on(t.authorId),
    index("stories_expires_idx").on(t.expiresAt),
  ],
);

// ── Story Views ───────────────────────────────────────────────────────────────
export const storyViewsTable = pgTable(
  "story_views",
  {
    storyId: text("story_id")
      .notNull()
      .references(() => storiesTable.id, { onDelete: "cascade" }),
    viewerId: text("viewer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.viewerId] }),
    index("story_views_story_idx").on(t.storyId),
  ],
);

// ── Chats ────────────────────────────────────────────────────────────────────
export const chatsTable = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user1Id: text("user1_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    user2Id: text("user2_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("chats_user1_idx").on(t.user1Id),
    index("chats_user2_idx").on(t.user2Id),
  ],
);

// ── Messages ──────────────────────────────────────────────────────────────────
export const messageMediaTypeEnum = pgEnum("message_media_type", [
  "image",
  "video",
  "audio",
  "file",
]);

export const messagesTable = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chatId: text("chat_id").references(() => chatsTable.id, {
      onDelete: "cascade",
    }),
    groupId: text("group_id"),
    senderId: text("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    mediaUrl: text("media_url"),
    mediaType: messageMediaTypeEnum("media_type"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_chat_idx").on(t.chatId),
    index("messages_group_idx").on(t.groupId),
    index("messages_created_idx").on(t.createdAt),
  ],
);

// ── Groups ────────────────────────────────────────────────────────────────────
export const groupsTable = pgTable("groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  creatorId: text("creator_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  membersCount: integer("members_count").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const groupMembersTable = pgTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    isAdmin: boolean("is_admin").notNull().default(false),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("group_members_user_idx").on(t.userId),
  ],
);

// ── Channels ──────────────────────────────────────────────────────────────────
export const channelsTable = pgTable("channels", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  creatorId: text("creator_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  subscribersCount: integer("subscribers_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const channelMembersTable = pgTable(
  "channel_members",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channelsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    isAdmin: boolean("is_admin").notNull().default(false),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.userId] }),
    index("channel_members_user_idx").on(t.userId),
  ],
);

// ── Notifications ──────────────────────────────────────────────────────────────
export const notificationTypeEnum = pgEnum("notification_type", [
  "follow",
  "like",
  "comment",
  "reply",
  "message",
  "mention",
  "channel_post",
]);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    type: notificationTypeEnum("type").notNull(),
    postId: text("post_id"),
    commentId: text("comment_id"),
    channelId: text("channel_id"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_created_idx").on(t.createdAt),
  ],
);
