-- ================================================================
-- ODAC Internal Portal — 05_social_fields.sql
-- Phase 2: fields for the "assist, don't automate" social flow,
-- removal of reviewer_notes (business rule R1), and admin read
-- access to submission files (STATUS.md proposal P-2).
--
-- IMPORTANT: Run 01 through 04 FIRST if you haven't.
--
-- HOW TO RUN THIS:
-- 1. Supabase dashboard → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click Run
-- 4. Add a LOG entry to docs/STATUS.md saying this migration ran
-- ================================================================


-- ── Social flow fields ──────────────────────────────────────────
-- The system PREPARES the posts; a human copies, pastes and
-- publishes them. Nothing is ever posted automatically (rule R3).

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS facebook_text   text,
  ADD COLUMN IF NOT EXISTS instagram_text  text,
  ADD COLUMN IF NOT EXISTS facebook_image  text,
  ADD COLUMN IF NOT EXISTS instagram_image text,
  ADD COLUMN IF NOT EXISTS published_at    timestamptz;

COMMENT ON COLUMN public.submissions.facebook_text IS
  'Suggested Facebook post text, editable by ODAC staff in the dashboard. Staff copies this and pastes it into Facebook manually.';

COMMENT ON COLUMN public.submissions.instagram_text IS
  'Suggested Instagram post text, editable by ODAC staff in the dashboard. Staff copies this and pastes it into Instagram manually.';

COMMENT ON COLUMN public.submissions.facebook_image IS
  'URL of the image adapted to Facebook''s 1.91:1 ratio, if one was prepared. May be empty.';

COMMENT ON COLUMN public.submissions.instagram_image IS
  'URL of the image adapted to Instagram''s 1:1 ratio, if one was prepared. May be empty.';

COMMENT ON COLUMN public.submissions.published_at IS
  'When ODAC staff first confirmed a publication (marked any channel as posted). Set by the dashboard, once.';


-- ── Remove reviewer_notes (rule R1: no internal notes) ──────────
-- Confirmed with Roberta on 26-jun: internal notes must not exist.
-- The column was created in 01_schema.sql and was never used by
-- any code. Any data in it is deleted permanently.

ALTER TABLE public.submissions DROP COLUMN IF EXISTS reviewer_notes;


-- ── Admins can read attached files (P-2) ────────────────────────
-- Until now, logged-in admins could read submissions but NOT the
-- submission_files records nor download the files from Storage.

DROP POLICY IF EXISTS "authenticated_can_read_file_records" ON public.submission_files;

CREATE POLICY "authenticated_can_read_file_records"
  ON public.submission_files
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_can_read_submission_files" ON storage.objects;

CREATE POLICY "authenticated_can_read_submission_files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'submission-files');


-- ── Verification query ──────────────────────────────────────────
-- After running this file, run the query below. You should see the
-- five new columns and NOT see reviewer_notes.
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'submissions'
-- ORDER BY ordinal_position;
