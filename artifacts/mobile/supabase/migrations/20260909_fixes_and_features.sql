-- ============================================================
-- Migration 001 — Fixes & features (run in Supabase SQL Editor)
-- Idempotent: safe to re-run.
--
-- Adds:
--   1. profiles.location / profiles.pronouns (fixes edit-profile save bug)
--   2. reports table + RLS (real moderation queue instead of self-notify)
--   3. delete_user RPC (real account deletion)
--   4. mark_all_notifications_read RPC (atomic mark-all-read)
-- ============================================================

-- ─── 1. Missing profile columns ──────────────────────────────────────────────
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists pronouns text;

-- ─── 2. Reports ──────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id          uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete cascade,
  message_id  uuid references public.messages(id) on delete cascade,
  reason      text not null check (reason in ('spam','inappropriate','harassment','other')),
  details     text,
  status      text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.reports enable row level security;

drop policy if exists "reports_select_admin" on public.reports;
drop policy if exists "reports_insert" on public.reports;
drop policy if exists "reports_update_admin" on public.reports;

-- Anyone authenticated can file; only admins see the queue.
create policy "reports_insert" on public.reports for insert
  to authenticated with check (auth.uid() = reporter_id);

create policy "reports_select_admin" on public.reports for select
  to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "reports_update_admin" on public.reports for update
  to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ─── 3. Account deletion (cascade all owned data, then auth user) ────────────
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Owned rows with FKs to profiles cascade automatically (posts, comments,
  -- likes, saves, follows, blocks, stories, story_views, notifications,
  -- live_messages, reports, conversation_members, message_reactions).
  -- Rows with ON DELETE SET NULL need explicit cleanup first:
  delete from public.conversation_members where user_id = uid;
  delete from public.live_sessions where host_id = uid;

  delete from public.profiles where id = uid;
end;
$$;

grant execute on function public.delete_user() to authenticated;

-- ─── 4. Atomic mark-all-read ─────────────────────────────────────────────────
create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set is_read = true
  where user_id = auth.uid() and is_read = false;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;
