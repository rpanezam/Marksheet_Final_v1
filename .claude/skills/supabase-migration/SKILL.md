---
name: supabase-migration
description: MarksheetGenerator-এর Supabase PostgreSQL database-এ table তৈরি/পরিবর্তন, RLS policy, বা নতুন migration বানানো ও apply করার নিয়ম। ব্যবহারকারী যখন "database পরিবর্তন", "নতুন table", "column যোগ", "migration", "RLS policy", "supabase push" সংক্রান্ত কিছু বলে তখন এই skill ব্যবহার করো।
---

# Supabase Database Migration

MarksheetGenerator-এর database হলো Supabase PostgreSQL। সব schema পরিবর্তন
অবশ্যই **migration ফাইলের মাধ্যমে** করতে হবে — সরাসরি dashboard-এ হাত দিয়ে নয়।
এতে সব পরিবর্তনের ইতিহাস version control-এ থাকে।

## আসল চালু database (production)

- **Project Ref:** `lepbljtyhscjcaoveiom` ("rpanezam's Project") ✅
- **URL:** `https://lepbljtyhscjcaoveiom.supabase.co`
- `supabase/config.toml`-এও এই সঠিক id সেট করা আছে।

> push করার আগে নিশ্চিত করো link করা project হলো `lepbljtyhscjcaoveiom`।
> যাচাই: `supabase projects list` অথবা `supabase/.temp/linked-project.json` দেখো।

## বর্তমান Tables

| Table               | কাজ                                     |
| ------------------- | --------------------------------------- |
| `marksheet_records` | প্রতি student-এর subject-wise marks     |
| `marksheet_history` | পুরো class-এর snapshot                  |
| `user_roles`        | admin / teacher role (enum: `app_role`) |
| `teacher_classes`   | কোন teacher কোন class দেখবে             |
| `teacher_passwords` | teacher-এর custom password              |
| `active_sessions`   | multi-login control                     |
| `app_settings`      | key-value JSON settings                 |

> Table-এর পূর্ণ column টাইপ দেখতে: `src/integrations/supabase/types.ts`

## ধাপ ১ — Project link নিশ্চিত করো

```bash
supabase link --project-ref lepbljtyhscjcaoveiom
```

## ধাপ ২ — নতুন migration ফাইল তৈরি

```bash
supabase migration new <descriptive_name>
```

এটি `supabase/migrations/<timestamp>_<descriptive_name>.sql` ফাইল বানায়।
এই ফাইলে SQL লেখো (CREATE TABLE / ALTER TABLE / policy ইত্যাদি)।

## ধাপ ৩ — RLS বাধ্যতামূলক

প্রতিটি নতুন table-এ অবশ্যই Row Level Security চালু ও policy দিতে হবে।
উদাহরণ প্যাটার্ন:

```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- teacher শুধু নিজের data দেখবে
CREATE POLICY "teachers read own"
  ON public.my_table FOR SELECT
  USING (auth.uid() = user_id);

-- admin সব দেখবে
CREATE POLICY "admin full access"
  ON public.my_table FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

## ধাপ ৪ — Production-এ push

```bash
supabase db push
```

## ধাপ ৫ — TypeScript টাইপ আপডেট (গুরুত্বপূর্ণ)

schema বদলালে frontend-এর টাইপ regenerate করতে হবে, নইলে কোড DB-এর সাথে
মিলবে না:

```bash
supabase gen types typescript --project-id lepbljtyhscjcaoveiom > src/integrations/supabase/types.ts
```

## নিয়মাবলি

- কখনো পুরোনো migration ফাইল edit করো না — সবসময় **নতুন** migration বানাও।
- Destructive পরিবর্তন (DROP / column মুছে ফেলা) করার আগে ব্যবহারকারীর অনুমতি নাও।
- Migration apply-এর আগে ব্যবহারকারীকে জানাও (এটি live data-তে প্রভাব ফেলে)।
- Client শুধু anon key ব্যবহার করে — service role key কখনো frontend-এ দিও না।
