CREATE OR REPLACE FUNCTION public.set_uploaded_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.uploaded_by IS NULL THEN
    NEW.uploaded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marksheet_records_set_uploaded_by ON public.marksheet_records;
CREATE TRIGGER trg_marksheet_records_set_uploaded_by
BEFORE INSERT ON public.marksheet_records
FOR EACH ROW
EXECUTE FUNCTION public.set_uploaded_by();