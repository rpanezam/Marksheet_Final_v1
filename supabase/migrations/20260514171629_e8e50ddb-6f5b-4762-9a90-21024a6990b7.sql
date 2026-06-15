
DROP POLICY IF EXISTS "Public can verify marksheet by student_id" ON public.marksheet_records;
CREATE POLICY "Public can verify marksheet by student_id"
ON public.marksheet_records
FOR SELECT
TO anon
USING (true);
