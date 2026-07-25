-- ============================================================
-- FIX MESSAGING — run this in Supabase SQL Editor
-- ============================================================

-- 1. Delete orphaned group conversation (was being returned instead of a DM)
delete from public.conversation_members where conversation_id = '53cdd0e9-3a0a-45ea-8a20-2767509f2a01';
delete from public.conversations where id = '53cdd0e9-3a0a-45ea-8a20-2767509f2a01';

-- 2. Fix convos_select — add created_by escape hatch so creator can read
--    the row immediately after INSERT (before members are added)
drop policy if exists "convos_select" on public.conversations;
drop policy if exists "Members can view conversations" on public.conversations;
create policy "convos_select" on public.conversations for select using (
  auth.uid() = created_by
  or exists (
    select 1 from public.conversation_members
    where conversation_id = id and user_id = auth.uid()
  )
);

-- 3. Fix conv_members_select — must NOT be recursive (no subquery into same table)
drop policy if exists "conv_members_select" on public.conversation_members;
drop policy if exists "Members can view conversation members" on public.conversation_members;
create policy "conv_members_select" on public.conversation_members for select using (
  user_id = auth.uid()
);

-- 4. Fix conv_members_insert — allow inserting any user_id (creator adds both members)
drop policy if exists "conv_members_insert" on public.conversation_members;
drop policy if exists "Conversation creators can add members" on public.conversation_members;
create policy "conv_members_insert" on public.conversation_members for insert with check (true);

-- 5. Fix conv_members_update — remove recursive self-join
drop policy if exists "conv_members_update" on public.conversation_members;
drop policy if exists "Members can update own membership" on public.conversation_members;
create policy "conv_members_update" on public.conversation_members for update using (
  user_id = auth.uid()
);

-- 6. Replace get_dm_conversation with security definer version that bypasses RLS
create or replace function public.get_dm_conversation(user1 uuid, user2 uuid)
returns uuid language plpgsql security definer as $$
declare
  conv_id uuid;
begin
  select cm1.conversation_id into conv_id
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id
  join public.conversations c
    on c.id = cm1.conversation_id
  where cm1.user_id = user1
    and cm2.user_id = user2
    and c.type = 'dm'
  limit 1;
  return conv_id;
end;
$$;

-- 7. New RPC: get the other member's user_id in a DM (bypasses RLS)
create or replace function public.get_dm_other_user(p_conversation_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer as $$
declare
  other_id uuid;
begin
  select user_id into other_id
  from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id <> p_user_id
  limit 1;
  return other_id;
end;
$$;

-- 8. Allow audio/x-m4a in chat-media storage bucket
update storage.buckets
set allowed_mime_types = array_append(
  array_remove(allowed_mime_types, 'audio/m4a'),
  'audio/x-m4a'
)
where id = 'chat-media'
  and not ('audio/x-m4a' = any(coalesce(allowed_mime_types, '{}')));
