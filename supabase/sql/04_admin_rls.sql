-- ================================================================
-- ODAC Internal Portal — 04_admin_rls.sql
-- Phase 2: Row Level Security policies for the Admin Dashboard
--
-- IMPORTANT: Run 03_admin_fields.sql FIRST.
--
-- HOW TO RUN THIS:
-- 1. Supabase dashboard → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click Run
--
-- After running, create the two admin accounts manually:
-- Dashboard → Authentication → Add user → set email + password
-- for Roberta and Kelsey. There is no sign-up form in the app.
-- ================================================================


-- ── Submissions: admins can read and update, never insert/delete ──
-- Only logged-in (authenticated) users get these rights. The public
-- intake form keeps using the anon INSERT-only policy from 02_rls.sql.

DROP POLICY IF EXISTS "authenticated_can_read_submissions" ON public.submissions;

CREATE POLICY "authenticated_can_read_submissions"
  ON public.submissions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_can_update_submissions" ON public.submissions;

CREATE POLICY "authenticated_can_update_submissions"
  ON public.submissions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── Verification query ──────────────────────────────────────────
-- After running this file, run the query below to confirm both
-- policies were created. You should see 2 rows.
--
-- SELECT policyname, tablename, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND policyname LIKE 'authenticated_%'
-- ORDER BY tablename;
