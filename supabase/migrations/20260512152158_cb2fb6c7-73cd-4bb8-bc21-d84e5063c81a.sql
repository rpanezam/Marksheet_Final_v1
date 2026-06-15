-- Global app settings (single-row key/value style)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated (teachers + admin) and even anon (for /verify) can read settings
CREATE POLICY "Anyone can read app settings"
ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can change
CREATE POLICY "Admins manage app settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Seed default school info
INSERT INTO public.app_settings (key, value)
VALUES ('school', '{"name":"AS SUNNAH INTERNATIONAL SCHOOL AND MADRASAH","address":"Bipulashar, Monohargonj, Cumilla","font":"times"}'::jsonb)
ON CONFLICT (key) DO NOTHING;