-- ============================================================
-- Migration 003 — Security & RLS Hardening
-- Safe, idempotent migration for Supabase SQL Editor.
-- Fixes privilege escalation, open RLS inserts, missing tables/buckets,
-- and unauthenticated SECURITY DEFINER RPCs.
-- ============================================================

-- ─── 1. Protect privileged/denormalized profile columns ─────────────────────
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean := false;
begin
  -- Service role / SQL editor (no JWT claim or service_role) is allowed.
  if auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if auth.uid() is not null then
    select coalesce(is_admin, false) into caller_is_admin
    from public.profiles
    where id = auth.uid();
  end if;

  if not caller_is_admin then
    new.is_admin := old.is_admin;
    new.is_banned := old.is_banned;
    new.followers_count := old.followers_count;
    new.following_count := old.following_count;
    new.posts_count := old.posts_count;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileged_columns on public.profiles;
create trigger trg_protect_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- Admin RLS policies for user moderation & content moderation
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile" on public.profiles
  for update to authenticated
  using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "Users or admins can delete posts" on public.posts;
create policy "Users or admins can delete posts" on public.posts
  for delete to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ─── 2. Fix posts SELECT visibility (followers & block enforcement) ─────────
drop policy if exists "Public posts are viewable by everyone" on public.posts;
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select
  using (
    (
      visibility = 'public'
      or auth.uid() = author_id
      or (
        visibility = 'followers'
        and auth.uid() is not null
        and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.following_id = author_id
        )
      )
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
    )
    and (
      auth.uid() is null
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = author_id)
           or (b.blocker_id = author_id and b.blocked_id = auth.uid())
      )
    )
  );

-- ─── 3. Fix open conversation_members & conversations policies ──────────────
drop policy if exists "conv_members_insert" on public.conversation_members;
drop policy if exists "Members can join conversations" on public.conversation_members;
create policy "conv_members_insert" on public.conversation_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = auth.uid() and cm.is_admin = true
    )
  );

drop policy if exists "convos_update" on public.conversations;
create policy "convos_update" on public.conversations
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id and cm.user_id = auth.uid() and cm.is_admin = true
    )
  );

-- ─── 4. Restrict notifications INSERT (prevent anonymous/spoofed spam) ─────
drop policy if exists "System can insert notifications" on public.notifications;
drop policy if exists "notifs_insert" on public.notifications;
create policy "notifs_insert" on public.notifications
  for insert to authenticated
  with check (
    auth.uid() = actor_id
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = user_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = user_id)
    )
  );

-- Restrict message_reactions SELECT to conversation members
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'message_reactions') then
    execute 'drop policy if exists "reactions_select" on public.message_reactions';
    execute 'create policy "reactions_select" on public.message_reactions for select to authenticated using (
      exists (
        select 1 from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id
        where m.id = message_reactions.message_id and cm.user_id = auth.uid()
      )
    )';
  end if;
end $$;

-- ─── 5. Missing tables & storage bucket referenced by client code ───────────
create table if not exists public.story_views (
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
alter table public.story_views enable row level security;
drop policy if exists "story_views_select" on public.story_views;
drop policy if exists "story_views_insert" on public.story_views;
create policy "story_views_select" on public.story_views
  for select to authenticated
  using (
    viewer_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
  );
create policy "story_views_insert" on public.story_views
  for insert to authenticated
  with check (auth.uid() = viewer_id);

create table if not exists public.live_likes (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.live_likes enable row level security;
drop policy if exists "live_likes_select" on public.live_likes;
drop policy if exists "live_likes_insert" on public.live_likes;
drop policy if exists "live_likes_delete" on public.live_likes;
create policy "live_likes_select" on public.live_likes for select using (true);
create policy "live_likes_insert" on public.live_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "live_likes_delete" on public.live_likes for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists "Public read media" on storage.objects;
drop policy if exists "Authenticated upload media" on storage.objects;
drop policy if exists "storage_select" on storage.objects;
drop policy if exists "storage_insert" on storage.objects;
create policy "storage_select" on storage.objects
  for select using (bucket_id in ('media', 'chat-media', 'avatars'));
create policy "storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('media', 'chat-media', 'avatars'));

-- ─── 6. Harden SECURITY DEFINER RPCs (search_path + auth.uid() checks) ─────
create or replace function public.upsert_live_viewer(p_session_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized';
  end if;
  insert into public.live_viewers (session_id, user_id)
  values (p_session_id, auth.uid())
  on conflict (session_id, user_id) do nothing;
end;
$$;

create or replace function public.remove_live_viewer(p_session_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized';
  end if;
  delete from public.live_viewers where session_id = p_session_id and user_id = auth.uid();
end;
$$;

create or replace function public.accept_join_request(p_request_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.live_sessions ls
    where ls.id = p_session_id and ls.host_id = auth.uid()
  ) then
    raise exception 'Only the host can accept join requests';
  end if;
  update public.live_join_requests
  set status = 'accepted'
  where id = p_request_id and session_id = p_session_id;
end;
$$;

create or replace function public.reject_join_request(p_request_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.live_sessions ls
    where ls.id = p_session_id and ls.host_id = auth.uid()
  ) then
    raise exception 'Only the host can reject join requests';
  end if;
  update public.live_join_requests
  set status = 'rejected'
  where id = p_request_id and session_id = p_session_id;
end;
$$;

create or replace function public.get_dm_conversation(user1 uuid, user2 uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare conv_id uuid;
begin
  if auth.uid() is null or (auth.uid() <> user1 and auth.uid() <> user2) then
    raise exception 'Unauthorized';
  end if;
  select cm1.conversation_id into conv_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where cm1.user_id = user1 and cm2.user_id = user2 and c.type = 'dm'
  limit 1;
  return conv_id;
end;
$$;

create or replace function public.get_dm_other_user(p_conversation_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare other_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
  ) then
    raise exception 'Not a conversation member';
  end if;
  select user_id into other_id
  from public.conversation_members
  where conversation_id = p_conversation_id and user_id <> auth.uid()
  limit 1;
  return other_id;
end;
$$;

create or replace function public.fetch_ranked_feed(p_user_id uuid default null, p_cursor_created timestamptz default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with effective_user as (
    select auth.uid() as uid
  ),
  blocked as (
    select blocked_id as uid from public.blocks, effective_user where blocker_id = effective_user.uid
    union
    select blocker_id as uid from public.blocks, effective_user where blocked_id = effective_user.uid
  )
  select coalesce(jsonb_agg(row_to_json(ranked) order by ranked.score desc, ranked.created_at desc), '[]'::jsonb)
  from (
    select
      p.*,
      row_to_json(pr) as profiles,
      (
        coalesce(p.likes_count, 0) * 3.0 +
        coalesce(p.comments_count, 0) * 4.0 +
        coalesce(p.shares_count, 0) * 5.0 +
        coalesce(p.views_count, 0) * 0.1
      ) / power(greatest(extract(epoch from (now() - p.created_at)) / 3600.0, 0.5) + 2.0, 1.5) as score
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    where p.is_reel = false
      and p.visibility = 'public'
      and p.author_id not in (select uid from blocked)
      and (p_cursor_created is null or p.created_at < p_cursor_created)
    order by score desc, p.created_at desc
    limit 20
  ) ranked;
$$;
