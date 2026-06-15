-- =============================================================
-- Student Sheet Generator — Full Supabase Migration
-- Run this entire script in Supabase Dashboard > SQL Editor
-- =============================================================

-- ─────────────────────────────────────────────
-- 1. ENUM
-- ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────

-- active_sessions
CREATE TABLE IF NOT EXISTS public.active_sessions (
  user_id       TEXT        NOT NULL,
  session_id    TEXT        NOT NULL,
  allow_multi   BOOLEAN     NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

-- app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT        NOT NULL PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- marksheet_history
CREATE TABLE IF NOT EXISTS public.marksheet_history (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_name   TEXT        NOT NULL,
  snapshot     JSONB       NOT NULL,
  row_count    INT         NOT NULL DEFAULT 0,
  exam         TEXT,
  label        TEXT,
  year_session TEXT,
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- marksheet_records
CREATE TABLE IF NOT EXISTS public.marksheet_records (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_name     TEXT        NOT NULL,
  subject          TEXT        NOT NULL,
  class_name       TEXT,
  student_id       TEXT,
  roll_no          TEXT,
  father_name      TEXT,
  mother_name      TEXT,
  exam             TEXT,
  year_session     TEXT,
  obtained_marks   NUMERIC,
  full_marks       NUMERIC,
  highest_score    NUMERIC,
  gp               NUMERIC,
  gpa              NUMERIC,
  letter_grade     TEXT,
  section_position TEXT,
  co_curricular    TEXT,
  moral_behavior   TEXT,
  comments         TEXT,
  working_days     TEXT,
  total_present    TEXT,
  uploaded_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- teacher_classes
CREATE TABLE IF NOT EXISTS public.teacher_classes (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_name TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- teacher_passwords
CREATE TABLE IF NOT EXISTS public.teacher_passwords (
  user_id    UUID        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password   TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- user_subjects
CREATE TABLE IF NOT EXISTS public.user_subjects (
  user_id    UUID        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subjects   JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_marksheet_records_class ON public.marksheet_records(class_name);
CREATE INDEX IF NOT EXISTS idx_marksheet_records_uploaded_by ON public.marksheet_records(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_marksheet_history_created_by ON public.marksheet_history(created_by);
CREATE INDEX IF NOT EXISTS idx_teacher_classes_user ON public.teacher_classes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);


-- ─────────────────────────────────────────────
-- 4. FUNCTIONS
-- ─────────────────────────────────────────────

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- is_admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin');
$$;

-- is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT public.has_role(_user_id, 'super_admin');
$$;

-- user_assigned_classes
CREATE OR REPLACE FUNCTION public.user_assigned_classes(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT ARRAY_AGG(class_name) FROM public.teacher_classes WHERE user_id = _user_id;
$$;


-- ─────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────

ALTER TABLE public.active_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marksheet_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marksheet_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_passwords  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subjects      ENABLE ROW LEVEL SECURITY;

-- active_sessions: user sees only own row
CREATE POLICY "active_sessions_own" ON public.active_sessions
  FOR ALL USING (auth.uid()::TEXT = user_id);

-- app_settings: everyone reads; only admin writes
CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT USING (true);
CREATE POLICY "app_settings_write" ON public.app_settings
  FOR ALL USING (public.is_admin(auth.uid()));

-- marksheet_history: admin sees all; teacher sees own
CREATE POLICY "marksheet_history_select" ON public.marksheet_history
  FOR SELECT USING (
    public.is_admin(auth.uid()) OR created_by = auth.uid()
  );
CREATE POLICY "marksheet_history_insert" ON public.marksheet_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "marksheet_history_delete" ON public.marksheet_history
  FOR DELETE USING (public.is_admin(auth.uid()) OR created_by = auth.uid());

-- marksheet_records: admin sees all; teacher sees records for assigned classes
CREATE POLICY "marksheet_records_select" ON public.marksheet_records
  FOR SELECT USING (
    public.is_admin(auth.uid())
    OR uploaded_by = auth.uid()
    OR class_name = ANY(public.user_assigned_classes(auth.uid()))
  );
CREATE POLICY "marksheet_records_insert" ON public.marksheet_records
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "marksheet_records_update" ON public.marksheet_records
  FOR UPDATE USING (public.is_admin(auth.uid()) OR uploaded_by = auth.uid());
CREATE POLICY "marksheet_records_delete" ON public.marksheet_records
  FOR DELETE USING (public.is_admin(auth.uid()) OR uploaded_by = auth.uid());

-- teacher_classes: admin manages all; teacher sees own
CREATE POLICY "teacher_classes_select" ON public.teacher_classes
  FOR SELECT USING (public.is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "teacher_classes_manage" ON public.teacher_classes
  FOR ALL USING (public.is_admin(auth.uid()));

-- teacher_passwords: user manages own
CREATE POLICY "teacher_passwords_own" ON public.teacher_passwords
  FOR ALL USING (user_id = auth.uid());

-- user_roles: admin manages all; user reads own
CREATE POLICY "user_roles_read_own" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "user_roles_manage" ON public.user_roles
  FOR ALL USING (public.is_super_admin(auth.uid()));

-- user_subjects: user manages own; admin reads all
CREATE POLICY "user_subjects_own" ON public.user_subjects
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_subjects_admin_read" ON public.user_subjects
  FOR SELECT USING (public.is_admin(auth.uid()));


-- ─────────────────────────────────────────────
-- 6. AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_marksheet_records_updated_at
  BEFORE UPDATE ON public.marksheet_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_teacher_passwords_updated_at
  BEFORE UPDATE ON public.teacher_passwords
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_active_sessions_updated_at
  BEFORE UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_subjects_updated_at
  BEFORE UPDATE ON public.user_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================
-- Migration complete. All tables, RLS, functions created.
-- =============================================================
