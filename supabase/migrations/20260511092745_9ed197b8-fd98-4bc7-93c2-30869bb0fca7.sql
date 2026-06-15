CREATE UNIQUE INDEX IF NOT EXISTS marksheet_records_unique_idx
ON public.marksheet_records (student_id, roll_no, class_name, year_session, exam, subject);