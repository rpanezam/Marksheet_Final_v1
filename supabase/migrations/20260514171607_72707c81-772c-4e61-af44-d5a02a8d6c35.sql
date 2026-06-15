
-- Auto-set uploaded_by on insert
DROP TRIGGER IF EXISTS trg_set_uploaded_by ON public.marksheet_records;
CREATE TRIGGER trg_set_uploaded_by
BEFORE INSERT ON public.marksheet_records
FOR EACH ROW EXECUTE FUNCTION public.set_uploaded_by();

-- Tighten teacher SELECT: only own-created students (still within assigned class)
DROP POLICY IF EXISTS "Teachers view own classes marksheet" ON public.marksheet_records;
CREATE POLICY "Teachers view own created marksheet"
ON public.marksheet_records
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND uploaded_by = auth.uid()
  AND (class_name IN (SELECT user_assigned_classes(auth.uid())))
);

-- Tighten teacher UPDATE/DELETE to own-created rows
DROP POLICY IF EXISTS "Teachers update own classes marksheet" ON public.marksheet_records;
CREATE POLICY "Teachers update own created marksheet"
ON public.marksheet_records
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND uploaded_by = auth.uid()
  AND (class_name IN (SELECT user_assigned_classes(auth.uid())))
)
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND uploaded_by = auth.uid()
  AND (class_name IN (SELECT user_assigned_classes(auth.uid())))
);

DROP POLICY IF EXISTS "Teachers delete own classes marksheet" ON public.marksheet_records;
CREATE POLICY "Teachers delete own created marksheet"
ON public.marksheet_records
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND uploaded_by = auth.uid()
  AND (class_name IN (SELECT user_assigned_classes(auth.uid())))
);
