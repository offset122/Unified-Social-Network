-- ============================================================
-- SocialApp — Full Supabase Schema
-- Run this entire file in Supabase → SQL Editor → Run
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================

-- UUID extension
create extension if not exists "uuid-ossp";

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- profiles (extends auth.users)
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text unique not null,
  display_name   text not null default '',
  bio            text,
  avatar_url     text,
  cover_url      text,
  followers_count int not null default 0,
  following_count int not null default 0,
  posts_count    int not null default 0,
  is_admin       boolean not null default false,
  is_banned      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- posts
create table if not exists public.posts (
  id             uuid primary key default uuid_generate_v4(),
  author_id      uuid not null references public.profiles(id) on delete cascade,
  content        text not null default '',
  media_urls     text[] not null default '{}',
  media_type     text check (media_type in ('image','video')),
  media_width    int,
  media_height   int,
  visibility     text not null default 'public' check (visibility in ('public','followers','private')),
  is_reel        boolean not null default false,
  likes_count    int not null default 0,
  comments_count int not null default 0,
  shares_count   int not null default 0,
  views_count    int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- likes
create table if not exists public.likes (
  user_id    uuid references public.profiles(id) on delete cascade,
  post_id    uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- saves
create table if not exists public.saves (
  user_id    uuid references public.profiles(id) on delete cascade,
  post_id    uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- comments
create table if not exists public.comments (
  id         uuid primary key default uuid_generate_v4(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  likes_count int not null default 0,
  parent_id  uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- follows
create table if not exists public.follows (
  follower_id  uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);

-- blocks
create table if not exists public.blocks (
  blocker_id uuid references public.profiles(id) on delete cascade,
  blocked_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- stories
create table if not exists public.stories (
  id         uuid primary key default uuid_generate_v4(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  media_url  text not null,
  media_type text check (media_type in ('image','video')) default 'image',
  caption    text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

-- notifications
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  type       text not null,
  post_id    uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- conversations
create table if not exists public.conversations (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null check (type in ('dm','group')),
  name            text,
  avatar_url      text,
  created_by      uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

-- conversation_members
create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,
  unread_count    int not null default 0,
  is_admin        boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- messages
create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null default '',
  media_url       text,
  media_type      text check (media_type in ('image','video','audio','file')),
  reply_to_id     uuid references public.messages(id) on delete set null,
  post_id         uuid references public.posts(id) on delete set null,
  is_deleted      boolean not null default false,
  created_at      timestamptz not null default now()
);

-- live_sessions
create table if not exists public.live_sessions (
  id            uuid primary key default uuid_generate_v4(),
  host_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  viewers_count int not null default 0,
  is_active     boolean not null default true,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

-- live_messages
create table if not exists public.live_messages (
  id         uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

-- ─── RPC Functions ────────────────────────────────────────────────────────────

create or replace function public.increment_post_likes(post_id uuid)
returns void language sql security definer as $$
  update public.posts set likes_count = likes_count + 1 where id = post_id;
$$;

create or replace function public.decrement_post_likes(post_id uuid)
returns void language sql security definer as $$
  update public.posts set likes_count = greatest(0, likes_count - 1) where id = post_id;
$$;

create or replace function public.increment_post_comments(post_id uuid)
returns void language sql security definer as $$
  update public.posts set comments_count = comments_count + 1 where id = post_id;
$$;

create or replace function public.decrement_post_comments(post_id uuid)
returns void language sql security definer as $$
  update public.posts set comments_count = greatest(0, comments_count - 1) where id = post_id;
$$;

create or replace function public.increment_post_views(post_id uuid)
returns void language sql security definer as $$
  update public.posts set views_count = views_count + 1 where id = post_id;
$$;

create or replace function public.increment_followers(user_id uuid)
returns void language sql security definer as $$
  update public.profiles set followers_count = followers_count + 1 where id = user_id;
$$;

create or replace function public.decrement_followers(user_id uuid)
returns void language sql security definer as $$
  update public.profiles set followers_count = greatest(0, followers_count - 1) where id = user_id;
$$;

create or replace function public.increment_following(user_id uuid)
returns void language sql security definer as $$
  update public.profiles set following_count = following_count + 1 where id = user_id;
$$;

create or replace function public.decrement_following(user_id uuid)
returns void language sql security definer as $$
  update public.profiles set following_count = greatest(0, following_count - 1) where id = user_id;
$$;

create or replace function public.get_dm_conversation(user1 uuid, user2 uuid)
returns uuid language plpgsql security definer as $$
declare conv_id uuid;
begin
  select cm1.conversation_id into conv_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where cm1.user_id = user1 and cm2.user_id = user2 and c.type = 'dm'
  limit 1;
  return conv_id;
end;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.stories enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_messages enable row level security;

-- Drop existing policies before recreating (idempotent)
do $$ declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy "profiles_select"  on public.profiles for select  using (true);
create policy "profiles_insert"  on public.profiles for insert  with check (auth.uid() = id);
create policy "profiles_update"  on public.profiles for update  using (auth.uid() = id);

-- posts (public posts visible to all; author sees own)
create policy "posts_select" on public.posts for select using (
  visibility = 'public' or auth.uid() = author_id
);
create policy "posts_insert" on public.posts for insert with check (auth.uid() = author_id);
create policy "posts_update" on public.posts for update using (auth.uid() = author_id);
create policy "posts_delete" on public.posts for delete using (auth.uid() = author_id);

-- likes
create policy "likes_select" on public.likes for select using (true);
create policy "likes_insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on public.likes for delete using (auth.uid() = user_id);

-- saves (private to owner)
create policy "saves_select" on public.saves for select using (auth.uid() = user_id);
create policy "saves_insert" on public.saves for insert with check (auth.uid() = user_id);
create policy "saves_delete" on public.saves for delete using (auth.uid() = user_id);

-- comments
create policy "comments_select" on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (auth.uid() = author_id);
create policy "comments_delete" on public.comments for delete using (auth.uid() = author_id);

-- follows
create policy "follows_select" on public.follows for select using (true);
create policy "follows_insert" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows_delete" on public.follows for delete using (auth.uid() = follower_id);

-- blocks (private to blocker)
create policy "blocks_select" on public.blocks for select using (auth.uid() = blocker_id);
create policy "blocks_insert" on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "blocks_delete" on public.blocks for delete using (auth.uid() = blocker_id);

-- stories
create policy "stories_select" on public.stories for select using (expires_at > now());
create policy "stories_insert" on public.stories for insert with check (auth.uid() = author_id);
create policy "stories_delete" on public.stories for delete using (auth.uid() = author_id);

-- notifications
create policy "notifs_select" on public.notifications for select using (auth.uid() = user_id);
create policy "notifs_insert" on public.notifications for insert with check (true);
create policy "notifs_update" on public.notifications for update using (auth.uid() = user_id);

-- conversations (members only)
create policy "convos_select" on public.conversations for select using (
  exists (select 1 from public.conversation_members where conversation_id = id and user_id = auth.uid())
);
create policy "convos_insert" on public.conversations for insert with check (auth.uid() = created_by);
create policy "convos_update" on public.conversations for update using (
  exists (select 1 from public.conversation_members where conversation_id = id and user_id = auth.uid())
);

-- conversation_members
create policy "conv_members_select" on public.conversation_members for select using (
  user_id = auth.uid() or
  exists (select 1 from public.conversation_members cm2 where cm2.conversation_id = conversation_id and cm2.user_id = auth.uid())
);
create policy "conv_members_insert" on public.conversation_members for insert with check (true);
create policy "conv_members_update" on public.conversation_members for update using (
  user_id = auth.uid() or
  exists (select 1 from public.conversation_members cm2 where cm2.conversation_id = conversation_id and cm2.user_id = auth.uid() and cm2.is_admin = true)
);
create policy "conv_members_delete" on public.conversation_members for delete using (user_id = auth.uid());

-- messages (conversation members)
create policy "messages_select" on public.messages for select using (
  exists (select 1 from public.conversation_members where conversation_id = messages.conversation_id and user_id = auth.uid())
);
create policy "messages_insert" on public.messages for insert with check (
  auth.uid() = sender_id and
  exists (select 1 from public.conversation_members where conversation_id = messages.conversation_id and user_id = auth.uid())
);
create policy "messages_update" on public.messages for update using (auth.uid() = sender_id);

-- live_sessions (public read, host write)
create policy "live_sessions_select" on public.live_sessions for select using (true);
create policy "live_sessions_insert" on public.live_sessions for insert with check (auth.uid() = host_id);
create policy "live_sessions_update" on public.live_sessions for update using (auth.uid() = host_id);
create policy "live_sessions_delete" on public.live_sessions for delete using (auth.uid() = host_id);

-- live_messages (public read, authenticated write)
create policy "live_messages_select" on public.live_messages for select using (true);
create policy "live_messages_insert" on public.live_messages for insert with check (auth.uid() = user_id);

-- ─── Auto-create profile on signup ───────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      lower(replace(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), ' ', '_'))
    ),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Realtime (enable for live features) ─────────────────────────────────────

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.live_messages;
alter publication supabase_realtime add table public.live_sessions;
alter publication supabase_realtime add table public.notifications;
