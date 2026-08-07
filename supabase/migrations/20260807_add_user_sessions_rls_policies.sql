-- ============================================================
-- USER SESSIONS RLS POLICIES + SCHEMA HARDENING
-- Fix 400 Bad Request errors on user_sessions PATCH (heartbeat)
--
-- The app authenticates against the custom `users` table using
-- the Supabase anon key, not Supabase Auth. Therefore policies
-- must permit both `anon` and `authenticated` roles so session
-- create / read / update / delete work for the app.
--
-- Also defensively adds the `updated_at` column (used by the
-- heartbeat PATCH) in case the live DB is out of sync with
-- schema.sql.
-- ============================================================

-- 1. Defensively ensure the heartbeat column exists.
--    The heartbeat sends `{"updated_at": "<iso>"}`; if this column is
--    missing in the live DB, PostgREST returns 400 PGRST204.
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Enable Row Level Security (idempotent).
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- 3. Policies (drop first so re-running the migration is safe).
DROP POLICY IF EXISTS "Allow anon & authenticated session read" ON public.user_sessions;
CREATE POLICY "Allow anon & authenticated session read" ON public.user_sessions
  FOR SELECT USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow anon & authenticated session insert" ON public.user_sessions;
CREATE POLICY "Allow anon & authenticated session insert" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow anon & authenticated session update" ON public.user_sessions;
CREATE POLICY "Allow anon & authenticated session update" ON public.user_sessions
  FOR UPDATE USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow anon & authenticated session delete" ON public.user_sessions;
CREATE POLICY "Allow anon & authenticated session delete" ON public.user_sessions
  FOR DELETE USING (auth.role() = 'anon' OR auth.role() = 'authenticated');