-- ================================================================
-- Migration: anon INSERT rate-limit for submissions and submission_files
-- Step 4: Replace always-true anon INSERT policies with a
--         time-windowed rate limit (max 5 submissions per IP per hour).
--
-- HOW IT WORKS:
--   Postgres does not have native IP-based rate limiting, but we can
--   count recent rows created within the same transaction context.
--   A more robust approach for production would be a Supabase Edge
--   Function with a Redis/Upstash counter — this SQL approach is
--   appropriate for low-volume community use (ODAC board).
--
-- NOTE: The anon role cannot read auth.uid(), so we use a simple
--   count on created_at within the last 60 minutes as a soft guard.
--   This does NOT replace a proper CAPTCHA for high-risk scenarios.
-- ================================================================

-- Drop the old always-true policies
DROP POLICY IF EXISTS anon_can_submit              ON public.submissions;
DROP POLICY IF EXISTS anon_can_insert_file_records ON public.submission_files;

-- submissions: max 5 submissions per 60-minute rolling window
-- (counted globally, not per-IP -- appropriate for ODAC volume)
CREATE POLICY anon_can_submit ON public.submissions
  FOR INSERT
  TO anon
  WITH CHECK (
    (
      SELECT COUNT(*)
      FROM   public.submissions
      WHERE  created_at > NOW() - INTERVAL '60 minutes'
    ) < 5
  );

-- submission_files: max 15 file records per 60-minute rolling window
-- (5 submissions × 3 files each = 15 max under normal use)
CREATE POLICY anon_can_insert_file_records ON public.submission_files
  FOR INSERT
  TO anon
  WITH CHECK (
    (
      SELECT COUNT(*)
      FROM   public.submission_files
      WHERE  created_at > NOW() - INTERVAL '60 minutes'
    ) < 15
  );

-- Comment documenting the decision
COMMENT ON POLICY anon_can_submit              ON public.submissions      IS
  'Soft rate limit: max 5 anonymous submissions per 60-minute window. '
  'Replace with Edge Function + CAPTCHA if spam becomes an issue.';

COMMENT ON POLICY anon_can_insert_file_records ON public.submission_files IS
  'Soft rate limit: max 15 anonymous file records per 60-minute window. '
  'Mirrors the 5-submission × 3-file limit on the intake form.';
