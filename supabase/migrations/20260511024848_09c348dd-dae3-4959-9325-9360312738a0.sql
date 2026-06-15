-- 1) Roles enum and table
create type public.app_role as enum ('admin', 'teacher');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- 2) Teacher class assignments
create table public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, class_name)
);

alter table public.teacher_classes enable row level security;

-- 3) Helper functions (security definer, avoid RLS recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin')
$$;

create or replace function public.user_assigned_classes(_user_id uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select class_name from public.teacher_classes where user_id = _user_id
$$;

-- 4) RLS for user_roles
create policy "Admins manage roles"
on public.user_roles
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Users see own roles"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

-- 5) RLS for teacher_classes
create policy "Admins manage teacher classes"
on public.teacher_classes
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Teachers see own class assignments"
on public.teacher_classes
for select
to authenticated
using (user_id = auth.uid());

-- 6) Replace permissive policies on marksheet_records
drop policy if exists "Public can view marksheet records" on public.marksheet_records;
drop policy if exists "Public can insert marksheet records" on public.marksheet_records;
drop policy if exists "Public can update marksheet records" on public.marksheet_records;
drop policy if exists "Public can delete marksheet records" on public.marksheet_records;

create policy "Admins full access marksheet"
on public.marksheet_records
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Teachers view own classes marksheet"
on public.marksheet_records
for select
to authenticated
using (
  public.has_role(auth.uid(), 'teacher')
  and class_name in (select public.user_assigned_classes(auth.uid()))
);

create policy "Teachers insert own classes marksheet"
on public.marksheet_records
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'teacher')
  and class_name in (select public.user_assigned_classes(auth.uid()))
);

create policy "Teachers update own classes marksheet"
on public.marksheet_records
for update
to authenticated
using (
  public.has_role(auth.uid(), 'teacher')
  and class_name in (select public.user_assigned_classes(auth.uid()))
)
with check (
  public.has_role(auth.uid(), 'teacher')
  and class_name in (select public.user_assigned_classes(auth.uid()))
);

create policy "Teachers delete own classes marksheet"
on public.marksheet_records
for delete
to authenticated
using (
  public.has_role(auth.uid(), 'teacher')
  and class_name in (select public.user_assigned_classes(auth.uid()))
);