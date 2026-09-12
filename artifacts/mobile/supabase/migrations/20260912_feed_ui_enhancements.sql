-- Feed engagement & UI enhancements (enhancement.md pass)
--   1. Atomic share counter (fixes lost updates from concurrent client writes)
--   2. Server-side ranked feed for the "For You" tab (engagement score, paginated)

-- 1. Atomic shares increment ---------------------------------------------------
create or replace function public.increment_post_shares(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update posts
  set shares_count = coalesce(shares_count, 0) + 1
  where id = increment_post_shares.post_id;
end;
$$;

grant execute on function public.increment_post_shares(uuid) to authenticated, anon;

-- 2. Ranked feed ("For You") ----------------------------------------------------
-- Engagement-weighted ranking computed server-side so pagination stays correct.
-- Score = likes + 2*comments + 0.5*views, decayed by age (half-life ~3 days).
create or replace function public.fetch_ranked_feed(p_user_id uuid, p_cursor_created timestamptz default null, p_limit int default 20)
returns setof posts
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from posts p
  where p.is_reel = false
    and p.visibility = 'public'
    and p.author_id not in (
      select blocked_id from blocks where blocker_id = p_user_id
      union
      select blocker_id from blocks where blocked_id = p_user_id
    )
    and (p_cursor_created is null or p.created_at < p_cursor_created)
  order by (
    (coalesce(p.likes_count, 0) + 2 * coalesce(p.comments_count, 0) + 0.5 * coalesce(p.views_count, 0))
    * power(0.5, extract(epoch from (now() - p.created_at)) / 259200.0)
  ) desc, p.created_at desc
  limit p_limit;
$$;
