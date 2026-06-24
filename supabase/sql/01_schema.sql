-- ================================================================
-- ODAC Internal Portal â€” 01_schema.sql
-- Phase 1: Create the submissions and submission_files tables
--
-- HOW TO RUN THIS:
-- 1. Go to your Supabase project dashboard
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Click "New query"
-- 4. Paste this entire file
-- 5. Click "Run" (or press Ctrl+Enter / Cmd+Enter)
-- ================================================================


-- â”€â”€ submissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- One row per piece of content submitted by a member group.

CREATE TABLE IF NOT EXISTS public.submissions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  group_name      text        NOT NULL,
  submitter_email text        NOT NULL,
  content_type    text        NOT NULL,
  title           text        NOT NULL,
  description     text        NOT NULL,
  status          text        NOT NULL DEFAULT 'received',
  reviewer_notes  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT submissions_pkey PRIMARY KEY (id),

  CONSTRAINT submissions_content_type_check CHECK (
    content_type IN ('event', 'exhibition', 'artwork', 'announcement')
  ),

  CONSTRAINT submissions_status_check CHECK (
    status IN ('received', 'fb_published', 'web_published', 'loop_closed')
  )
);

-- Plain-language descriptions so any admin can understand the table
-- in the Supabase dashboard (Table Editor â†’ column names show these).
COMMENT ON TABLE  public.submissions IS
  'Content submissions from ODAC member groups. Each row is one piece of content sent in for review and publication to Facebook and the ODAC website.';

COMMENT ON COLUMN public.submissions.id IS
  'Unique identifier. Generated automatically â€” do not change this.';

COMMENT ON COLUMN public.submissions.group_name IS
  'Which member group submitted this. Chosen from the dropdown on the intake form.';

COMMENT ON COLUMN public.submissions.submitter_email IS
  'Email of the person who submitted. Used to send them a confirmation and to follow up if needed.';

COMMENT ON COLUMN public.submissions.content_type IS
  'What kind of content: event, exhibition, artwork, or announcement.';

COMMENT ON COLUMN public.submissions.title IS
  'Short title, as written by the group.';

COMMENT ON COLUMN public.submissions.description IS
  'Full description, as written by the group. May be used as a Facebook caption after light editing by ODAC staff.';

COMMENT ON COLUMN public.submissions.status IS
  'Where this submission is in the workflow. Starts as "received". ODAC moves it through: fb_published â†’ web_published â†’ loop_closed.';

COMMENT ON COLUMN public.submissions.reviewer_notes IS
  'Private notes from ODAC staff. These are NEVER shown to the submitting group.';

COMMENT ON COLUMN public.submissions.created_at IS
  'When the submission was received by the system.';

COMMENT ON COLUMN public.submissions.updated_at IS
  'When this record was last changed. Updated automatically.';


-- â”€â”€ submission_files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Files (images, PDFs) attached to a submission.
-- The actual files live in the Supabase Storage bucket "submission-files".
-- This table stores the path and metadata.

CREATE TABLE IF NOT EXISTS public.submission_files (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  submission_id    uuid        NOT NULL,
  storage_path     text        NOT NULL,
  original_name    text        NOT NULL,
  file_size_bytes  integer,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT submission_files_pkey PRIMARY KEY (id),

  CONSTRAINT submission_files_submission_fk
    FOREIGN KEY (submission_id)
    REFERENCES public.submissions (id)
    ON DELETE CASCADE
);

COMMENT ON TABLE  public.submission_files IS
  'Files (images, PDFs) attached to a submission. The actual files are in Supabase Storage under the bucket "submission-files".';

COMMENT ON COLUMN public.submission_files.id IS
  'Unique identifier. Generated automatically.';

COMMENT ON COLUMN public.submission_files.submission_id IS
  'Which submission this file belongs to. If the submission is deleted, this record is also deleted automatically.';

COMMENT ON COLUMN public.submission_files.storage_path IS
  'Path to the file inside the "submission-files" storage bucket. Format: submissions/{submission_id}/{filename}';

COMMENT ON COLUMN public.submission_files.original_name IS
  'The filename exactly as the group uploaded it.';

COMMENT ON COLUMN public.submission_files.file_size_bytes IS
  'File size in bytes.';

COMMENT ON COLUMN public.submission_files.created_at IS
  'When this file record was saved.';


-- â”€â”€ Auto-update updated_at â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Every time a submission row is changed, this trigger automatically
-- sets updated_at to the current timestamp.
-- (You do not need to do this manually.)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at IS
  'Trigger function: automatically sets updated_at to now() when a row is updated.';

DROP TRIGGER IF EXISTS submissions_set_updated_at ON public.submissions;

CREATE TRIGGER submissions_set_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

