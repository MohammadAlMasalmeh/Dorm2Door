-- ============================================================
-- Fix users SELECT policy: allow all authenticated users to read profiles
-- Required for friends, messaging, notifications, and provider lookups.
-- Matches existing pattern on providers, services, and reviews tables.
-- ============================================================

DROP POLICY IF EXISTS "users: read own" ON public.users;

CREATE POLICY "users: read all authenticated" ON public.users
  FOR SELECT USING (auth.uid() IS NOT NULL);
