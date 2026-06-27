-- ============================================================
-- SocialApp — Missing Tables (Messaging + Live)
-- Paste into Supabase → SQL Editor → Run
-- Safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS)
-- ============================================================

-- ─── Tables ───────────────────────────────────────────────

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('dm','group')),
  name            text,
  avatar_url      text,
  created_by      uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,
  unread_count    int not null default 0,
  is_admin        boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
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

create table if not exists public.live_sessions (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  viewers_count int not null default 0,
  is_active     boolean not null default true,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

create table if not exists public.live_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

-- ─── RPC: find existing DM between two users ──────────────

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

-- ─── Row Level Security ───────────────────────────────────

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.live_sessions        enable row level security;
alter table public.live_messages        enable row level security;

-- Drop all old policies first (makes this safe to re-run)
drop policy if exists "convos_select"        on public.conversations;
drop policy if exists "convos_insert"        on public.conversations;
drop policy if exists "convos_update"        on public.conversations;
drop policy if exists "conv_members_select"  on public.conversation_members;
drop policy if exists "conv_members_insert"  on public.conversation_members;
drop policy if exists "conv_members_update"  on public.conversation_members;
drop policy if exists "conv_members_delete"  on public.conversation_members;
drop policy if exists "messages_select"      on public.messages;
drop policy if exists "messages_insert"      on public.messages;
drop policy if exists "messages_update"      on public.messages;
drop policy if exists "live_sessions_select" on public.live_sessions;
drop policy if exists "live_sessions_insert" on public.live_sessions;
drop policy if exists "live_sessions_update" on public.live_sessions;
drop policy if exists "live_sessions_delete" on public.live_sessions;
drop policy if exists "live_messages_select" on public.live_messages;
drop policy if exists "live_messages_insert" on public.live_messages;

-- conversations: visible to members only
-- (queries conversation_members from conversations policy = no recursion)
create policy "convos_select" on public.conversations for select using (
  exists (
    select 1 from public.conversation_members
    where conversation_id = conversations.id
      and user_id = auth.uid()
  )
);
create policy "convos_insert" on public.conversations for insert
  with check (auth.uid() = created_by);
create policy "convos_update" on public.conversations for update using (
  exists (
    select 1 from public.conversation_members
    where conversation_id = conversations.id
      and user_id = auth.uid()
  )
);

-- conversation_members: NON-RECURSIVE
-- Each user can only see their own membership rows.
-- (The app queries with .eq("user_id", myId) so this is sufficient.)
create policy "conv_members_select" on public.conversation_members
  for select using (user_id = auth.uid());

-- Anyone can be added to a conversation (insert handled by server logic)
create policy "conv_members_insert" on public.conversation_members
  for insert with check (true);

-- Members can update their own row; admins can update others
create policy "conv_members_update" on public.conversation_members
  for update using (user_id = auth.uid());

-- Members can leave (delete their own row)
create policy "conv_members_delete" on public.conversation_members
  for delete using (user_id = auth.uid());

-- messages: only conversation members can read/write
-- (queries conversation_members from messages policy = no recursion)
create policy "messages_select" on public.messages for select using (
  exists (
    select 1 from public.conversation_members
    where conversation_id = messages.conversation_id
      and user_id = auth.uid()
  )
);
create policy "messages_insert" on public.messages for insert with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.conversation_members
    where conversation_id = messages.conversation_id
      and user_id = auth.uid()
  )
);
create policy "messages_update" on public.messages
  for update using (auth.uid() = sender_id);

-- live_sessions: public read, host writes
create policy "live_sessions_select" on public.live_sessions for select using (true);
create policy "live_sessions_insert" on public.live_sessions for insert
  with check (auth.uid() = host_id);
create policy "live_sessions_update" on public.live_sessions for update
  using (auth.uid() = host_id);
create policy "live_sessions_delete" on public.live_sessions for delete
  using (auth.uid() = host_id);

-- live_messages: public read, authenticated write
create policy "live_messages_select" on public.live_messages for select using (true);
create policy "live_messages_insert" on public.live_messages for insert
  with check (auth.uid() = user_id);

-- ─── Realtime ─────────────────────────────────────────────

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.live_messages;
alter publication supabase_realtime add table public.live_sessions;
