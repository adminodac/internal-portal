-- ================================================================
-- ODAC Internal Portal — 03_admin_fields.sql
-- Phase 2: Fields needed by the Admin Dashboard
--
-- IMPORTANT: Run 01_schema.sql and 02_rls.sql FIRST if you haven't.
--
-- HOW TO RUN THIS:
-- 1. Supabase dashboard → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click Run
-- ================================================================


-- ── New columns ─────────────────────────────────────────────────

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS event_date       date,
  ADD COLUMN IF NOT EXISTS expire_date      date,
  ADD COLUMN IF NOT EXISTS posted_facebook  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_website   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_instagram boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.submissions.event_date IS
  'Date the event takes place. Entered by the submitting group, only when Content Type = Event. NULL for exhibition/artwork/announcement.';

COMMENT ON COLUMN public.submissions.expire_date IS
  'Date after which ODAC staff should remove this from the website. Set manually by an admin in the dashboard — never calculated automatically. NULL means no expiry has been set.';

COMMENT ON COLUMN public.submissions.posted_facebook IS
  'True once ODAC staff has marked this as posted to Facebook.';

COMMENT ON COLUMN public.submissions.posted_website IS
  'True once ODAC staff has marked this as posted to the website.';

COMMENT ON COLUMN public.submissions.posted_instagram IS
  'True once ODAC staff has marked this as posted to Instagram.';


-- ── Simplify status ─────────────────────────────────────────────
-- Per-channel progress now lives in posted_facebook/website/instagram,
-- so `status` only needs to distinguish "still open" from "done".
-- Map existing values first so no row violates the new constraint.

UPDATE public.submissions SET status = 'closed'   WHERE status = 'loop_closed';
UPDATE public.submissions SET status = 'received' WHERE status IN ('fb_published', 'web_published');

ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE public.submissions ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('received', 'closed'));

COMMENT ON COLUMN public.submissions.status IS
  'Workflow state: "received" (still open, needs posting) or "closed" (all requested channels have been marked posted).';
