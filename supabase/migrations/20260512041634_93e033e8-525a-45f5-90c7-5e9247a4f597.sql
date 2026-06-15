CREATE TABLE public.active_sessions (
  user_id uuid PRIMARY KEY,
  session_id text NOT NULL,
  allow_multi boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all sessions"
ON public.active_sessions FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view own session"
ON public.active_sessions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users insert own session"
ON public.active_sessions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own session"
ON public.active_sessions FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER active_sessions_set_updated_at
BEFORE UPDATE ON public.active_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.active_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_sessions;