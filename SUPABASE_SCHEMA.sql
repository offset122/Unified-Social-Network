-- ============================================================
-- SOCIALAPP SUPABASE SCHEMA
-- Run this in Supabase SQL Editor (Database → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique,
  display_name text not null,
  bio          text,
  avatar_url   text,
  cover_url    text,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  posts_count     integer not null default 0,
  is_admin     boolean not null default false,
  is_banned    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1) || '_' || substring(new.id::text, 1, 6)
    ),
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Posts ─────────────────────────────────────────────────────────────────────
create table if not exists posts (
  id           uuid primary key default uuid_generate_v4(),
  author_id    uuid not null references auth.users(id) on delete cascade,
  content      text not null default '',
  media_urls   text[] not null default '{}',
  media_type   text check (media_type in ('image', 'video')),
  media_width  integer,
  media_height integer,
  likes_count     integer not null default 0,
  comments_count  integer not null default 0,
  shares_count    integer not null default 0,
  views_count     integer not null default 0,
  is_reel      boolean not null default false,
  visibility   text not null default 'public' check (visibility in ('public', 'followers', 'private')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists posts_author_idx on posts(author_id);
create index if not exists posts_created_at_idx on posts(created_at desc);
create index if not exists posts_is_reel_idx on posts(is_reel);

-- ── Likes ─────────────────────────────────────────────────────────────────────
create table if not exists likes (
  user_id  uuid not null references auth.users(id) on delete cascade,
  post_id  uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists likes_post_idx on likes(post_id);

-- ── Saves ─────────────────────────────────────────────────────────────────────
create table if not exists saves (
  user_id  uuid not null references auth.users(id) on delete cascade,
  post_id  uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ── Comments ──────────────────────────────────────────────────────────────────
create table if not exists comments (
  id         uuid primary key default uuid_generate_v4(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  likes_count integer not null default 0,
  parent_id  uuid references comments(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on comments(post_id);
create index if not exists comments_author_idx on comments(author_id);

-- ── Follows ───────────────────────────────────────────────────────────────────
create table if not exists follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);
create index if not exists follows_following_idx on follows(following_id);

-- ── Blocks ───────────────────────────────────────────────────────────────────
create table if not exists blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- ── Stories ───────────────────────────────────────────────────────────────────
create table if not exists stories (
  id          uuid primary key default uuid_generate_v4(),
  author_id   uuid not null references auth.users(id) on delete cascade,
  media_url   text not null,
  media_type  text not null check (media_type in ('image', 'video')),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  views_count integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists stories_author_idx on stories(author_id);
create index if not exists stories_expires_idx on stories(expires_at);

create table if not exists story_views (
  story_id   uuid not null references stories(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

-- ── Conversations ─────────────────────────────────────────────────────────────
create table if not exists conversations (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null default 'dm' check (type in ('dm', 'group')),
  name            text,
  avatar_url      text,
  created_by      uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  is_admin        boolean not null default false,
  is_muted        boolean not null default false,
  unread_count    integer not null default 0,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conv_members_user_idx on conversation_members(user_id);

-- Helper function: get existing DM conversation between two users
create or replace function get_dm_conversation(user1 uuid, user2 uuid)
returns uuid language sql security definer as $$
  select cm1.conversation_id
  from conversation_members cm1
  join conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  join conversations c on c.id = cm1.conversation_id
  where cm1.user_id = user1
    and cm2.user_id = user2
    and c.type = 'dm'
  limit 1;
$$;

-- ── Messages ──────────────────────────────────────────────────────────────────
create table if not exists messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  content         text not null default '',
  media_url       text,
  media_type      text check (media_type in ('image', 'video', 'audio', 'file')),
  reply_to_id     uuid references messages(id) on delete set null,
  post_id         uuid references posts(id) on delete set null,
  is_deleted      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists messages_convo_idx on messages(conversation_id, created_at desc);
create index if not exists messages_sender_idx on messages(sender_id);

-- ── Notifications ─────────────────────────────────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  type       text not null check (type in ('follow', 'like', 'comment', 'reply', 'message', 'mention', 'live')),
  post_id    uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications(user_id, is_read) where is_read = false;

-- ── Live Sessions ─────────────────────────────────────────────────────────────
create table if not exists live_sessions (
  id            uuid primary key default uuid_generate_v4(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null default 'Live',
  viewers_count integer not null default 0,
  is_active     boolean not null default true,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists live_active_idx on live_sessions(is_active) where is_active = true;

-- ── Counter RPC functions ─────────────────────────────────────────────────────

create or replace function increment_post_likes(post_id uuid)
returns void language sql security definer as $$
  update posts set likes_count = likes_count + 1 where id = post_id;
$$;

create or replace function decrement_post_likes(post_id uuid)
returns void language sql security definer as $$
  update posts set likes_count = greatest(0, likes_count - 1) where id = post_id;
$$;

create or replace function increment_post_comments(post_id uuid)
returns void language sql security definer as $$
  update posts set comments_count = comments_count + 1 where id = post_id;
$$;

create or replace function increment_posts_count(user_id uuid)
returns void language sql security definer as $$
  update profiles set posts_count = posts_count + 1 where id = user_id;
$$;

create or replace function increment_followers(user_id uuid)
returns void language sql security definer as $$
  update profiles set followers_count = followers_count + 1 where id = user_id;
$$;

create or replace function decrement_followers(user_id uuid)
returns void language sql security definer as $$
  update profiles set followers_count = greatest(0, followers_count - 1) where id = user_id;
$$;

create or replace function increment_following(user_id uuid)
returns void language sql security definer as $$
  update profiles set following_count = following_count + 1 where id = user_id;
$$;

create or replace function decrement_following(user_id uuid)
returns void language sql security definer as $$
  update profiles set following_count = greatest(0, following_count - 1) where id = user_id;
$$;

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table posts enable row level security;
alter table likes enable row level security;
alter table saves enable row level security;
alter table comments enable row level security;
alter table follows enable row level security;
alter table blocks enable row level security;
alter table stories enable row level security;
alter table story_views enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table live_sessions enable row level security;

-- Profiles: public read, own write
create policy "Profiles are publicly readable" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Posts: public read, own write
create policy "Public posts are readable" on posts for select using (visibility = 'public' or auth.uid() = author_id);
create policy "Users can create posts" on posts for insert with check (auth.uid() = author_id);
create policy "Users can update own posts" on posts for update using (auth.uid() = author_id);
create policy "Users can delete own posts" on posts for delete using (auth.uid() = author_id);

-- Likes: public read, own write
create policy "Likes are readable" on likes for select using (true);
create policy "Users can like" on likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike" on likes for delete using (auth.uid() = user_id);

-- Saves: own access only
create policy "Users can view own saves" on saves for select using (auth.uid() = user_id);
create policy "Users can save" on saves for insert with check (auth.uid() = user_id);
create policy "Users can unsave" on saves for delete using (auth.uid() = user_id);

-- Comments: public read, own write
create policy "Comments are readable" on comments for select using (true);
create policy "Users can comment" on comments for insert with check (auth.uid() = author_id);
create policy "Users can delete own comments" on comments for delete using (auth.uid() = author_id);

-- Follows: public read, own write
create policy "Follows are readable" on follows for select using (true);
create policy "Users can follow" on follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow" on follows for delete using (auth.uid() = follower_id);

-- Blocks: own access
create policy "Users can view own blocks" on blocks for select using (auth.uid() = blocker_id);
create policy "Users can block" on blocks for insert with check (auth.uid() = blocker_id);
create policy "Users can unblock" on blocks for delete using (auth.uid() = blocker_id);

-- Stories: public read, own write
create policy "Stories are readable" on stories for select using (expires_at > now());
create policy "Users can create stories" on stories for insert with check (auth.uid() = author_id);
create policy "Users can delete own stories" on stories for delete using (auth.uid() = author_id);

-- Story views
create policy "Story views readable" on story_views for select using (true);
create policy "Users can view stories" on story_views for insert with check (auth.uid() = viewer_id);

-- Conversations: members only
create policy "Conversation members can read" on conversations for select
  using (exists (select 1 from conversation_members where conversation_id = id and user_id = auth.uid()));
create policy "Users can create conversations" on conversations for insert with check (auth.uid() = created_by);
create policy "Admins can update conversations" on conversations for update
  using (exists (select 1 from conversation_members where conversation_id = id and user_id = auth.uid() and is_admin = true));

-- Conversation members
create policy "Members can read membership" on conversation_members for select
  using (exists (select 1 from conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));
create policy "Users can join conversations" on conversation_members for insert with check (true);
create policy "Members can update own membership" on conversation_members for update using (auth.uid() = user_id);

-- Messages: members only
create policy "Members can read messages" on messages for select
  using (exists (select 1 from conversation_members where conversation_id = messages.conversation_id and user_id = auth.uid()));
create policy "Members can send messages" on messages for insert
  with check (auth.uid() = sender_id and exists (select 1 from conversation_members where conversation_id = messages.conversation_id and user_id = auth.uid()));
create policy "Users can soft-delete own messages" on messages for update using (auth.uid() = sender_id);

-- Notifications: own only
create policy "Users can read own notifications" on notifications for select using (auth.uid() = user_id);
create policy "System can create notifications" on notifications for insert with check (true);
create policy "Users can mark own notifications read" on notifications for update using (auth.uid() = user_id);

-- Live sessions: public read, own write
create policy "Live sessions are readable" on live_sessions for select using (is_active = true);
create policy "Hosts can create sessions" on live_sessions for insert with check (auth.uid() = host_id);
create policy "Hosts can update sessions" on live_sessions for update using (auth.uid() = host_id);

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable realtime on key tables (run in Supabase Dashboard → Database → Replication)
-- Or via SQL:
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table
    posts, messages, notifications, live_sessions, conversation_members, likes, follows;
commit;

-- ── Storage Buckets ───────────────────────────────────────────────────────────
-- Run these to create storage buckets (or do it in Dashboard → Storage):
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 104857600, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']),
  ('chat-media', 'chat-media', true, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/ogg','audio/webm','application/pdf']),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Storage RLS
create policy "Anyone can view public media" on storage.objects for select using (bucket_id in ('media', 'chat-media', 'avatars'));
create policy "Authenticated users can upload media" on storage.objects for insert with check (auth.role() = 'authenticated' and bucket_id in ('media', 'chat-media', 'avatars'));
create policy "Users can delete own media" on storage.objects for delete using (auth.uid() = owner);

