-- Helper: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin')
$$;

-- Update is_admin so super_admin counts as admin too (preserves RLS access)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin')
$$;

-- Seed super_admin role for Soft.s52b@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('69760cdf-4c10-408e-8690-abf06c213921', 'super_admin')
ON CONFLICT DO NOTHING;
