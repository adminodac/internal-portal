-- ================================================================
-- ODAC Internal Portal â€” 02_rls.sql
-- Phase 1: Row Level Security policies
--
-- IMPORTANT: Run 01_schema.sql FIRST, then run this file.
--
-- HOW TO RUN THIS:
-- 1. Supabase dashboard â†’ SQL Editor â†’ New query
-- 2. Paste this entire file
-- 3. Click Run
-- ================================================================


-- â”€â”€ Enable RLS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- With RLS enabled, NO access is allowed unless a matching policy
-- explicitly permits it. This is the safe default.

ALTER TABLE public.submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;


-- â”€â”€ Submissions: public INSERT only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The public intake form uses the "anon" role (no login required).
-- We allow anonymous users to INSERT new submissions only.
-- They cannot read, edit, or delete any submissions â€” not even their own.
-- Phase 2 will add authenticated admin policies for reading and updating.

DROP POLICY IF EXISTS "anon_can_submit" ON public.submissions;

CREATE POLICY "anon_can_submit"
  ON public.submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);


-- â”€â”€ Submission Files: public INSERT only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Same rule for file metadata records: anon can insert, nothing else.

DROP POLICY IF EXISTS "anon_can_insert_file_records" ON public.submission_files;

CREATE POLICY "anon_can_insert_file_records"
  ON public.submission_files
  FOR INSERT
  TO anon
  WITH CHECK (true);


-- â”€â”€ Storage: public upload to submission-files bucket â”€â”€â”€â”€â”€â”€â”€â”€
-- This policy lives on storage.objects (Supabase's internal storage table).
-- It allows anonymous users to upload files to the "submission-files" bucket.
-- Run this AFTER creating the bucket in Storage â†’ Buckets â†’ New bucket.

DROP POLICY IF EXISTS "anon_can_upload_submission_files" ON storage.objects;

CREATE POLICY "anon_can_upload_submission_files"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'submission-files');


-- â”€â”€ Verification query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- After running this file, run the query below to confirm all
-- three policies were created. You should see 3 rows.
--
-- SELECT policyname, tablename, cmd, roles
-- FROM pg_policies
-- WHERE schemaname IN ('public', 'storage')
--   AND policyname LIKE 'anon_%'
-- ORDER BY tablename;

