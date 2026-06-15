CREATE TABLE public.user_subjects (
  user_id uuid NOT NULL PRIMARY KEY,
  subjects jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subjects"
  ON public.user_subjects FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own subjects"
  ON public.user_subjects FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own subjects"
  ON public.user_subjects FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own subjects"
  ON public.user_subjects FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage all user subjects"
  ON public.user_subjects FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subjects;