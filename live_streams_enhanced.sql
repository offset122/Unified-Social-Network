-- ============================================================
-- Live Streaming Enhanced Features — Database Migration
-- ============================================================
-- Run this in Supabase → SQL Editor after the base schema.
-- Adds: likes tracking, camera/mic state, viewer roster,
--       join requests, and supporting indexes/RLS/realtime.
-- Safe to re-run: uses IF NOT EXISTS plus idempotent DDL.
-- ============================================================

-- ─── live_sessions enhancements ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name   = 'live_sessions'
                   AND column_name  = 'likes_count') THEN
    ALTER TABLE public.live_sessions
      ADD COLUMN likes_count   INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name   = 'live_sessions'
                   AND column_name  = 'is_camera_on') THEN
    ALTER TABLE public.live_sessions
      ADD COLUMN is_camera_on  BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name   = 'live_sessions'
                   AND column_name  = 'is_mic_on') THEN
    ALTER TABLE public.live_sessions
      ADD COLUMN is_mic_on     BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ─── live_viewers ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_viewers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS live_viewers_session_idx
  ON public.live_viewers(session_id);
CREATE INDEX IF NOT EXISTS live_viewers_user_idx
  ON public.live_viewers(user_id);

-- ─── live_join_requests ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_join_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_join_req_session_idx
  ON public.live_join_requests(session_id, status);
CREATE INDEX IF NOT EXISTS live_join_req_requester_idx
  ON public.live_join_requests(requester_id);

-- ─── RPC Functions ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_live_likes(session_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.live_sessions
     SET likes_count = GREATEST(0, likes_count + 1)
   WHERE id = session_id
     AND is_active = true;
END;$$;

CREATE OR REPLACE FUNCTION public.decrement_live_likes(session_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.live_sessions
     SET likes_count = GREATEST(0, likes_count - 1)
   WHERE id = session_id
     AND is_active = true;
END;$$;

CREATE OR REPLACE FUNCTION public.upsert_live_viewer(p_session_id UUID, p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.live_viewers (session_id, user_id)
  VALUES (p_session_id, p_user_id)
  ON CONFLICT (session_id, user_id) DO NOTHING;
END;$$;

CREATE OR REPLACE FUNCTION public.remove_live_viewer(p_session_id UUID, p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.live_viewers
   WHERE session_id = p_session_id
     AND user_id    = p_user_id;
END;$$;

CREATE OR REPLACE FUNCTION public.accept_join_request(p_request_id UUID, p_session_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.live_join_requests
     SET status = 'accepted'
   WHERE id        = p_request_id
     AND session_id = p_session_id;
END;$$;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_request_id UUID, p_session_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.live_join_requests
     SET status = 'rejected'
   WHERE id        = p_request_id
     AND session_id = p_session_id;
END;$$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.live_viewers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_join_requests ENABLE ROW LEVEL SECURITY;

-- live_viewers: public read; viewers manage own rows
DROP POLICY IF EXISTS live_viewers_select ON public.live_viewers;
DROP POLICY IF EXISTS live_viewers_insert ON public.live_viewers;
DROP POLICY IF EXISTS live_viewers_delete ON public.live_viewers;

CREATE POLICY "live_viewers_select"
  ON public.live_viewers FOR SELECT USING (true);

CREATE POLICY "live_viewers_insert"
  ON public.live_viewers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "live_viewers_delete"
  ON public.live_viewers FOR DELETE
  USING (auth.uid() = user_id);

-- live_join_requests: public read; viewers request; host manages
DROP POLICY IF EXISTS live_join_requests_select   ON public.live_join_requests;
DROP POLICY IF EXISTS live_join_requests_insert    ON public.live_join_requests;
DROP POLICY IF EXISTS live_join_requests_update    ON public.live_join_requests;

CREATE POLICY "live_join_requests_select"
  ON public.live_join_requests FOR SELECT USING (true);

CREATE POLICY "live_join_requests_insert"
  ON public.live_join_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "live_join_requests_update"
  ON public.live_join_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions
       WHERE id = session_id
         AND host_id = auth.uid()
    )
  );

-- ─── Realtime Publications ───────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_viewers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_join_requests;

-- ============================================================
-- Done!
-- ============================================================
SELECT 'Live streaming enhancements applied successfully!' AS status;
