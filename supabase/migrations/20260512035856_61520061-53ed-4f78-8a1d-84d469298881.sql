
CREATE TABLE public.teacher_passwords (
  user_id uuid PRIMARY KEY,
  password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_passwords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all teacher passwords"
ON public.teacher_passwords
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Teachers view own password"
ON public.teacher_passwords
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Teachers insert own password"
ON public.teacher_passwords
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Teachers update own password"
ON public.teacher_passwords
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER teacher_passwords_set_updated_at
BEFORE UPDATE ON public.teacher_passwords
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
