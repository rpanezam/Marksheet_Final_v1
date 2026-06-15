# MarksheetGenerator — CLAUDE.MD

# এই ফাইল প্রতি session শুরুতে পড়তে হবে। এখানে পুরো প্রজেক্টের সঠিক তথ্য আছে।

---

## প্রজেক্ট পরিচিতি

- **নাম:** MarksheetGenerator
- **উদ্দেশ্য:** As-Sunnah Madrasah-এর শিক্ষার্থীদের মার্কশিট PDF তৈরি করা
- **ওয়েবসাইট:** https://marksheet.as-sunnah-madrasah.org
- **ধরন:** Web App (PWA — Progressive Web App, ইনস্টলযোগ্য)

---

## Technology Stack (সত্যিকার, hallucination নয়)

| Layer              | Technology                                       |
| ------------------ | ------------------------------------------------ |
| Frontend Framework | React 19 + TypeScript                            |
| Routing            | TanStack Router v1 (file-based routing)          |
| Server/Build       | TanStack Start + Vite 7 + Nitro                  |
| Package Manager    | **Bun** (bun.lock আছে, npm নয়)                  |
| Styling            | Tailwind CSS v4                                  |
| UI Components      | Lucide React icons, Sonner (toast)               |
| State/Data         | TanStack Query v5                                |
| Database           | **Supabase PostgreSQL**                          |
| Auth               | Supabase Auth (email/password)                   |
| PDF Generation     | jsPDF + jsPDF-AutoTable                          |
| Excel Parsing      | xlsx (SheetJS)                                   |
| QR Code            | qrcode                                           |
| Deployment         | **Docker → Google Cloud Run**                    |
| Web Server         | **nginx:alpine** (static SPA serving, port 8080) |
| Container Stage    | Multi-stage Docker: bun builder → nginx runner   |

> ⚠️ **এটি Flutter প্রজেক্ট নয়।** `developer_instructions.md`-এ Flutter/Dart লেখা আছে কিন্তু এই নির্দিষ্ট প্রজেক্টটি React Web App।

---

## Supabase Database Tables

| Table               | কাজ                                                           |
| ------------------- | ------------------------------------------------------------- |
| `marksheet_records` | প্রতিটি student-এর subject-wise marks (প্রতি subject = ১ row) |
| `marksheet_history` | পুরো class-এর snapshot সেভ করা হয়                            |
| `user_roles`        | admin / teacher role management                               |
| `teacher_classes`   | কোন teacher কোন class দেখতে পারবে                             |
| `teacher_passwords` | teacher-এর custom password                                    |
| `active_sessions`   | session management (multi-login control)                      |
| `app_settings`      | key-value settings (JSON)                                     |

**Supabase Project ID:** `lepbljtyhscjcaoveiom`
**URL:** `https://lepbljtyhscjcaoveiom.supabase.co`

---

## Roles (app_role enum)

- `admin` — সব কিছু access করতে পারে
- `teacher` — শুধু নিজের assigned class দেখতে পারে

---

## ফাইল স্ট্রাকচার (গুরুত্বপূর্ণ ফাইল)

```
src/
  components/
    MarksheetGenerator.tsx   # মূল UI — Excel upload, student list, PDF generate
    AdminPanel.tsx           # Admin dashboard — teachers, settings
    ClassDataPanel.tsx       # Class-wise data view
    SplashScreen.tsx         # App loading screen (bismillah audio সহ)
  lib/
    marksheet-types.ts       # সব TypeScript types + grading scale
    pdf-generator.ts         # jsPDF দিয়ে marksheet PDF বানায়
    excel-parser.ts          # Excel থেকে student data parse করে
    certificate-generator.ts # Certificate PDF generator
    auth-context.tsx         # React auth context
    constants.ts             # App-wide constants
    share-pdf.ts             # PDF share করার logic
    useRealtimeTables.ts     # Supabase realtime subscription hooks
    dialog.tsx               # Custom dialog component
  integrations/supabase/
    client.ts                # Browser-side Supabase client
    client.server.ts         # Server-side Supabase client
    types.ts                 # Auto-generated DB types
    auth-attacher.ts         # Auth middleware helper
    auth-middleware.ts       # Route auth protection
  routes/
    __root.tsx               # Root layout
    index.tsx                # Main page (/)
    login.tsx                # Login page (/login)
    verify.$studentId.tsx    # QR verify page (/verify/:studentId)
  router.tsx                 # Router config
  server.ts                  # Server entry
  start.ts                   # App entry point
assets/
  bismillah.png              # Header image
  certificate-bg.jpg         # Certificate background
  school-logo.jpg            # School logo
public/
  sw.js                      # Service Worker (PWA)
  manifest.json              # PWA manifest
  audio/bismillah.mp3        # Splash screen audio
supabase/
  migrations/                # DB migration files
  functions/manage-teachers/ # Edge function for teacher management
```

---

## Grading Scale (Bangladesh Standard)

| Percentage | Grade | GP  |
| ---------- | ----- | --- |
| 80–100     | A+    | 5.0 |
| 70–79.99   | A     | 4.0 |
| 60–69.99   | A-    | 3.5 |
| 50–59.99   | B     | 3.0 |
| 40–49.99   | C     | 2.0 |
| 33–39.99   | D     | 1.0 |
| 0–32.99    | F     | 0.0 |

**Special Classes:** Playgroup ও Nursery-তে সব subject-এর full marks = 50।

---

## Build ও Run Commands

```bash
# Development
bun run dev

# Production Build
bun run build

# Lint
bun run lint

# Format
bun run format
```

## Docker Build (Local Test)

```bash
docker build -t marksheet-generator .
docker run -p 8080:8080 marksheet-generator
```

---

## Environment Setup Status (এই PC-তে)

### Required Tools + যাচাই করার Command

এই তালিকা কখনো পুরোনো হয় না — সন্দেহ হলে নিজে চালিয়ে যাচাই করো:

| Tool         | দরকার কেন                             | Check Command        |
| ------------ | ------------------------------------- | -------------------- |
| **Bun**      | Package manager + build (বাধ্যতামূলক) | `bun --version`      |
| Node.js      | Bun না থাকলে fallback runtime         | `node --version`     |
| Docker       | Container build (deploy-এর আগে)       | `docker --version`   |
| gcloud       | Cloud Run-এ deploy                    | `gcloud --version`   |
| Supabase CLI | DB migration push                     | `supabase --version` |
| Git          | Version control                       | `git --version`      |

### Verified Status — যাচাই করা হয়েছে: 2026-06-15

> ⚠️ এটি ওই তারিখের snapshot। install state বদলাতে পারে — কোনো tool নিয়ে
> সন্দেহ হলে উপরের check command চালিয়ে নিশ্চিত হও, অন্ধভাবে বিশ্বাস করো না।

| Tool         | অবস্থা     | Version       |
| ------------ | ---------- | ------------- |
| **Bun**      | ✅ আছে     | 1.3.14        |
| Node.js      | ✅ আছে     | v22.22.2      |
| npm          | ✅ আছে     | 10.9.7        |
| Docker       | ✅ আছে     | 29.5.2        |
| gcloud       | ✅ আছে     | 571.0.0 (SDK) |
| Supabase CLI | ❌ **নেই** | —             |
| Git          | ✅ আছে     | 2.54.0        |

### ⚠️ এখনই গুরুত্বপূর্ণ (Action দরকার)

1. **Supabase CLI নেই** — migration push করতে দরকার হবে। install:
   `scoop install supabase` অথবা `bunx supabase`।

---

## Environment Variables (.env ফাইলে থাকে)

```
VITE_SUPABASE_URL=https://lepbljtyhscjcaoveiom.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=lepbljtyhscjcaoveiom
```

> Dockerfile-এ public anon key hardcoded আছে (Vite build-time bake) — এটি intentional কারণ anon key public-facing।

---

## Artifact Registry — Image Cleanup Policy (গুরুত্বপূর্ণ, চার্জ এড়াতে)

### নিয়ম: সর্বোচ্চ ৩টি image রাখতে হবে
> আগে অনেক image জমে $11 চার্জ হয়েছিল। এই নিয়ম না মানলে আবার চার্জ আসবে।

| রাখব | কারণ |
|------|------|
| Latest (current) | এখন live যেটা চলছে |
| Previous (1টি) | Rollback দরকার হলে |
| One before (1টি) | Emergency backup |
| বাকি সব | ❌ Delete করতে হবে |

### প্রতিটি Deploy-এর পরে করণীয়
পুরোনো image মুছে রাখতে **GCP Console-এ Cleanup Policy** সেট করো:
1. GCP Console → Artifact Registry → `cloud-run-source-deploy`
2. Repository details → **Cleanup Policies** tab
3. **Add Policy** → "Keep most recent versions" → **Count: 3**
4. Save

এটা একবার সেট করলে GCP নিজেই পুরোনো image auto-delete করবে।

### Manual Delete (দরকার হলে)
```powershell
# Image list দেখতে
gcloud artifacts docker images list us-central1-docker.pkg.dev/gmail-and-telegram-480114/cloud-run-source-deploy/marksheetgenerator-crs --include-tags --sort-by="~createTime"

# নির্দিষ্ট image delete করতে (digest দিয়ে)
gcloud artifacts docker images delete us-central1-docker.pkg.dev/gmail-and-telegram-480114/cloud-run-source-deploy/marksheetgenerator-crs@sha256:DIGEST --delete-tags
```

### ⚠️ Claude-এর বাধ্যতামূলক নিয়ম (প্রতিটি deploy-এর পরে)
- সর্বোচ্চ **৩টি** image রাখতে হবে — এর বেশি রাখা যাবে না।
- Deploy শেষ হলে Claude অবশ্যই বলবে: "স্যার, Artifact Registry-তে ৩টির বেশি image থাকলে পুরোনোগুলো delete করুন।"
- এটা skip করা যাবে না — আগে $11 চার্জ এসেছিল।

---

## শেষ Deploy তথ্য

| বিষয় | মান |
|------|-----|
| তারিখ | 2026-06-15 |
| Revision | `marksheetgenerator-crs-00058-4f5` |
| Service URL | https://marksheetgenerator-crs-210083243076.us-central1.run.app |
| Custom Domain | https://marksheet.as-sunnah-madrasah.org |
| Status | ✅ 100% traffic serving |

---

## Deployment Flow

```
Code Push → GitHub → Docker Build → Google Artifact Registry → Cloud Run → Production
```

- **Cloud Run port:** 8080 (nginx serve করে)
- **Static SPA fallback:** সব route → `_shell.html` (TanStack Router client-side routing)

---

## PWA Features

- Service Worker (`public/sw.js`) — offline support
- Web App Manifest (`public/manifest.json`) — installable
- Icons: 192px ও 512px (maskable + standard)
- Splash audio: `bismillah.mp3` plays on app start

---

## Subject Full Marks Defaults

বেশিরভাগ subject = 100 marks। নিচেরগুলো = 50:

- Bengali 2nd Paper, English 2nd Paper, Arabic 2nd Paper
- Kalima, Masyala and Hadith
- Information and Communications Technology
- Agricultural Studies, Arabic Spoken, English Spoken

---

## Business Logic Rule (বাধ্যতামূলক)

- **প্রতিটি prompt শুরুতে:** `.claude/skills/business-logic/SKILL.md` পড়তে হবে।
- **Logic তৈরি বা পরিবর্তন হলে:** সেই prompt শেষে সাথে সাথে skill আপডেট করতে হবে।
- এটি skip করা যাবে না — এটিই hallucination-মুক্ত কাজের মূল ভিত্তি।

---

## ভুল করা যাবে না (Anti-Hallucination Rules)

1. এটি **Flutter নয়** — React TypeScript Web App
2. Package manager **Bun** — `npm` বা `yarn` নয়
3. Routing — **TanStack Router** (file-based), Next.js নয়
4. Build output → `dist/client/` (nginx serve করে)
5. Auth — **Supabase Auth**, Firebase নয়
6. Supabase table types দেখতে `src/integrations/supabase/types.ts` পড়ো
7. নতুন কোনো package add করার আগে `package.json` চেক করো — হয়তো আগেই আছে
