-- ================================================================
-- ODAC Internal Portal — 06_groups.sql
-- Phase 2: "groups" table replaces the hardcoded dropdown list in
-- index.html, so ODAC staff can add or retire member groups from
-- the admin dashboard (Manage Groups section) without a code change.
--
-- IMPORTANT: Run 01 through 05 FIRST if you haven't.
--
-- HOW TO RUN THIS:
-- 1. Supabase dashboard → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click Run
-- 4. Add a LOG entry to docs/STATUS.md saying this migration ran
--
-- DO NOT modify this file's policies or add extra ones while
-- running it. This project had an incident (11-jul) where ad hoc
-- RLS edits during execution broke the public form. Run it as-is.
-- ================================================================


-- ── Table ────────────────────────────────────────────────────────
-- submissions.group_name stays free text (NOT a foreign key to this
-- table). Deactivating or renaming a group here never touches past
-- submissions — that keeps this migration low-risk and reversible.

CREATE TABLE IF NOT EXISTS public.groups (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT groups_pkey PRIMARY KEY (id),
  CONSTRAINT groups_name_unique UNIQUE (name)
);

COMMENT ON TABLE public.groups IS
  'ODAC member groups shown in the public intake form dropdown. Managed from the admin dashboard (Manage Groups section). submissions.group_name is free text, not a foreign key to this table, so changes here never affect past submissions.';

COMMENT ON COLUMN public.groups.name IS
  'Group name exactly as it should appear in the dropdown.';

COMMENT ON COLUMN public.groups.active IS
  'True = shown in the public form dropdown. False = hidden but kept for history. Never delete a row here — set active = false instead.';


-- ── Seed: the 18 groups currently hardcoded in index.html ────────

INSERT INTO public.groups (name) VALUES
  ('Artists on Main'),
  ('Best Cellar Books & Tours'),
  ('OASIS Theatre Group'),
  ('Okanagan Art Gallery'),
  ('Osoyoos Carvers'),
  ('Osoyoos Desert Centre'),
  ('Osoyoos Elks #436'),
  ('Osoyoos Festival Society'),
  ('Osoyoos Museum & Archives'),
  ('Osoyoos Music in the Park'),
  ('Osoyoos Photography Club'),
  ('Osoyoos Potters'),
  ('Osoyoos Quilters Guild'),
  ('Rock Creek Fall Fair Assn'),
  ('Rumplestiltskein Fibre Arts Guild'),
  ('The Similkameen Country Development Association'),
  ('Wayside Books & Select Art'),
  ('Wide Arts National Association (WANA)')
ON CONFLICT (name) DO NOTHING;


-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Public form: anon reads only active groups.
DROP POLICY IF EXISTS "anon_can_read_active_groups" ON public.groups;
CREATE POLICY "anon_can_read_active_groups"
  ON public.groups
  FOR SELECT
  TO anon
  USING (active = true);

-- Admin dashboard: authenticated reads every group, including
-- inactive ones, so staff can reactivate a retired group.
DROP POLICY IF EXISTS "authenticated_can_read_groups" ON public.groups;
CREATE POLICY "authenticated_can_read_groups"
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin dashboard: authenticated adds new groups.
DROP POLICY IF EXISTS "authenticated_can_insert_groups" ON public.groups;
CREATE POLICY "authenticated_can_insert_groups"
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admin dashboard: authenticated toggles active/inactive.
-- No DELETE policy for anyone — groups are retired, never deleted.
DROP POLICY IF EXISTS "authenticated_can_update_groups" ON public.groups;
CREATE POLICY "authenticated_can_update_groups"
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── Verification query ──────────────────────────────────────────
-- After running this file, run the query below. You should see
-- 18 rows, all with active = true.
--
-- SELECT name, active FROM public.groups ORDER BY name;
