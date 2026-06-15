
CREATE TABLE public.marksheet_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_by UUID NOT NULL,
  student_name TEXT NOT NULL,
  father_name TEXT,
  mother_name TEXT,
  student_id TEXT,
  class_name TEXT,
  roll_no TEXT,
  exam TEXT,
  year_session TEXT,
  subject TEXT NOT NULL,
  full_marks NUMERIC,
  highest_score NUMERIC,
  obtained_marks NUMERIC,
  letter_grade TEXT,
  gp NUMERIC,
  gpa NUMERIC,
  section_position TEXT,
  working_days TEXT,
  total_present TEXT,
  moral_behavior TEXT,
  co_curricular TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marksheet_records_uploaded_by ON public.marksheet_records(uploaded_by);
CREATE INDEX idx_marksheet_records_student ON public.marksheet_records(uploaded_by, student_id);
CREATE INDEX idx_marksheet_records_class ON public.marksheet_records(uploaded_by, class_name, year_session);

ALTER TABLE public.marksheet_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own marksheet records"
  ON public.marksheet_records FOR SELECT
  TO authenticated
  USING (auth.uid() = uploaded_by);

CREATE POLICY "Users can insert their own marksheet records"
  ON public.marksheet_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update their own marksheet records"
  ON public.marksheet_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = uploaded_by)
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete their own marksheet records"
  ON public.marksheet_records FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_marksheet_records_updated_at
  BEFORE UPDATE ON public.marksheet_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
