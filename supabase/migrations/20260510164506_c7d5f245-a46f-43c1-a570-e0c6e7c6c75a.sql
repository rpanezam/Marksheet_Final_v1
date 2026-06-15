
-- Make uploaded_by optional
ALTER TABLE public.marksheet_records ALTER COLUMN uploaded_by DROP NOT NULL;

-- Drop existing user-based policies
DROP POLICY IF EXISTS "Users can delete their own marksheet records" ON public.marksheet_records;
DROP POLICY IF EXISTS "Users can insert their own marksheet records" ON public.marksheet_records;
DROP POLICY IF EXISTS "Users can update their own marksheet records" ON public.marksheet_records;
DROP POLICY IF EXISTS "Users can view their own marksheet records" ON public.marksheet_records;

-- Public access policies (no auth required)
CREATE POLICY "Public can view marksheet records"
ON public.marksheet_records FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public can insert marksheet records"
ON public.marksheet_records FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Public can update marksheet records"
ON public.marksheet_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete marksheet records"
ON public.marksheet_records FOR DELETE TO anon, authenticated USING (true);

-- Unique key per student-subject combination so we can upsert per row
CREATE UNIQUE INDEX IF NOT EXISTS marksheet_records_student_subject_key
ON public.marksheet_records (
  COALESCE(student_id, ''),
  COALESCE(roll_no, ''),
  COALESCE(class_name, ''),
  COALESCE(year_session, ''),
  COALESCE(exam, ''),
  subject
);
