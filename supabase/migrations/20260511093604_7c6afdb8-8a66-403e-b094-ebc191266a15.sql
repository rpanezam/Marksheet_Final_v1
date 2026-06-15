CREATE TABLE IF NOT EXISTS public.marksheet_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID,
  class_name TEXT NOT NULL,
  year_session TEXT,
  exam TEXT,
  label TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marksheet_history_class_idx
  ON public.marksheet_history (class_name, created_at DESC);

ALTER TABLE public.marksheet_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access history"
ON public.marksheet_history
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Teachers view own classes history"
ON public.marksheet_history
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND class_name IN (SELECT user_assigned_classes(auth.uid()))
);

CREATE POLICY "Teachers insert own classes history"
ON public.marksheet_history
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND class_name IN (SELECT user_assigned_classes(auth.uid()))
);