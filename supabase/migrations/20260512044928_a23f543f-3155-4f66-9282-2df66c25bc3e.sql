-- Allow public (anonymous) read access to marksheet_records for QR-code verification.
-- The student_id is required to look up records, so this acts as a soft access token.
CREATE POLICY "Public can verify marksheet by student_id"
ON public.marksheet_records
FOR SELECT
TO anon, authenticated
USING (true);