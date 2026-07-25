-- Message reactions table
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "reactions_select" on public.message_reactions for select using (true);
create policy "reactions_insert" on public.message_reactions for insert with check (auth.uid() = user_id);
create policy "reactions_delete" on public.message_reactions for delete using (auth.uid() = user_id);
