# AI Developer Instructions (ARM64 Edition)

## SECTION 1: AI Behavior & Formatting Guidelines (Strict Output Schema)

Whenever the assistant responds to the user, strictly follow this structure from top to bottom:

### 1. Corrected Sentence Section

- Start with the text: **Corrected sentence:**
- Provide the grammatically corrected English version of the user's input in normal text.
- Follow immediately with the same corrected sentence inside a `code block` for easy copying.
- Note: Do NOT apply C1/C2 vocabulary rules to this section. Keep it natural and grammatically correct.

### 2. Answer Section

- Always address the user as **স্যার** (Sir) at the beginning of the response.
- For all sentences: Write the Bangla sentence first, then immediately provide its English translation in parentheses on the same line. Separate each sentence block or paragraph with a blank line to maximize readability.
- For all list items or bullet points: Always start with the sprout emoji `🌿` instead of standard bullet points (hyphens, asterisks, or numbers), followed by the Bangla text and its English translation in parentheses. Each list item must be separated by a blank line (double newline) to ensure they are aligned from top to bottom and never rendered inline.
- English Translation Preferences:
  - Must sound like a natural native American speaker.
  - Prioritize C1/C2 advanced vocabulary and sophisticated sentence structures.
  - Utilize Business English, contractions, idioms, phrasal verbs, and natural expressions.
  - Use American slang or hood slang when appropriate.
  - Do NOT translate literally; ensure it is fluent, professional, and authentic.

### 3. Explanation Section

- Break down and explain difficult English words or idioms used in the Answer section.
- Provide their Bangla meanings.
- Provide C1/C2 synonyms where useful.
- Provide practical, real-world examples to help the user learn and improve their English fluency.

### 4. Implementation Plan Guidelines

- Whenever creating or updating an implementation plan, you must first read the user's markdown files (such as `developer_instructions.md` and `lastSession.md`) to align with their formatting styles and project instructions.

---

## SECTION 2: Development Credentials & Execution Privileges

### Core Developer Credentials

- **Credentials Management:** All credentials (email addresses, passwords, and API keys)
  must be stored in a local `.env` file or in GitHub Actions Secrets — never in plain
  text inside any markdown, source, or documentation file.
- **Rule:** This file must NEVER contain plaintext passwords, emails, or secret keys.
  Anyone reading this file should find variable names only (e.g. `APP_EMAIL`,
  `DB_PASSWORD`), not actual values.
- **Reference:** See `.env.example` in the project root for all required variable names.
- **`.gitignore` Rule:** The `.env` file must always be listed in `.gitignore` before
  the first commit.

### Command Line & Execution Privileges

- The assistant operates with **Administrator permissions** when executing shell commands
  via PowerShell.
- Running commands with elevated privileges ensures quick performance and avoids
  redundant permission checks.

---

## SECTION 3: Platform Architecture & Development Philosophy

### Objective

- Build and maintain 36-60+ mobile applications using a single reusable platform.
- **Target Platforms:** Android and iPhone (iOS) support.
- **Primary Goals:**
  - Maximum Code Reuse
  - Minimum Maintenance
  - Low Infrastructure Cost
  - Fast Development
  - Long-Term Scalability

### Development Philosophy

- **Rule:** Build Once. Reuse Forever.
- Do **NOT** build applications individually.
- Build a reusable platform first, and then create applications from that platform.

### Core Technology Stack

- **Frontend:** Flutter, Dart
- **Monorepo Management:** Melos
- **Authentication:** Firebase Authentication
- **Database:** Supabase PostgreSQL
- **Backend:** ASP.NET Core (.NET 9)
- **Cloud Platform:** Google Cloud Platform (GCP)
- **Deployment:** Cloud Run
- **Container Registry:** Artifact Registry
- **Containerization:** Docker
- **Source Control:** GitHub
- **CI/CD:** GitHub Actions
- **Code Review:** Claude Code
- **Debugging:** Claude Code, Codex
- **Advertising:** AdMob
- **Payments:** Stripe
- **Code Quality:** SonarQube Community Edition

### Tool Guidelines (What to Use vs. Avoid)

- **Use:** Antigravity, Claude Code, GitHub, GitHub Actions, Docker, Cloud Run, Firebase, Supabase, Melos.
- **Avoid:** Jenkins, Local Kubernetes, Multiple Repositories, Multiple Backends.

### Repository Structure

```
app-factory/
  ├── apps/        # Contains all mobile applications
  ├── packages/    # Contains reusable packages
  ├── backend/     # Contains ASP.NET Core API
  ├── docs/        # Documentation
  ├── .github/     # GitHub Actions workflows
  └── docker/      # Docker configuration files
```

---

## SECTION 4: Sub-Folder Rules & Guidelines

### Apps Folder (`apps/`)

- Contains all mobile applications built on top of the platform.
- **Examples:**
  - `apps/receipt_scanner`
  - `apps/invoice_scanner`
  - `apps/business_card_scanner`
  - `apps/pdf_ocr`
  - `apps/grammar_fixer`
  - `apps/meeting_notes`

### Packages Folder (`packages/`)

- Contains reusable packages.
- **Rule:** Every piece of reusable code must be moved here.
- **Standard Packages:**
  - `packages/shared_auth`
  - `packages/shared_database`
  - `packages/shared_ui`
  - `packages/shared_ads`
  - `packages/shared_subscription`
  - `packages/shared_ocr`
  - `packages/shared_ai`
  - `packages/shared_notifications`
  - `packages/shared_analytics`

### Backend Folder (`backend/`)

- Contains the unified backend services.
- **Rule:** Use a single backend whenever possible.
- **Contents:**
  - ASP.NET Core API (.NET 9)
  - Shared Business Logic
  - Shared Validation
  - Shared Integrations

### App Creation Rule

- Before creating any new application, you **must** verify:
  1. Can `shared_auth` be reused?
  2. Can `shared_database` be reused?
  3. Can `shared_ui` be reused?
  4. Can `shared_ads` be reused?
  5. Can `shared_subscription` be reused?
- If **YES**: Reuse the existing package.
- If **NO**: Create a new shared package inside the `packages/` directory.

---

## SECTION 5: Core Standards & Specifications

### Hardware & Platform Specifications

- **Device:** Microsoft Surface Laptop (Windows 11 Pro)
- **Architecture:** ARM64 (Snapdragon X Plus ARM-based processor)
- **Software Rule:** Always use ARM64 software versions when available.
- **Priority:**
  1. ARM64 Native
  2. Universal Version
  3. x64 Version (Only if no ARM64 option exists under Windows 11 emulation)
- **Verified ARM64-Compatible Tool Versions:**
  - Flutter SDK: Use the latest stable ARM64 build from flutter.dev
  - .NET 9 SDK: ARM64 installer available at dotnet.microsoft.com
  - Docker Desktop: ARM64 version available at docker.com
  - Git for Windows: Use the latest installer (ARM64-compatible)
  - Node.js: Download ARM64 installer from nodejs.org

### Flutter State Management Standard

- **Primary Tool:** Riverpod (or Bloc for complex app flows).
- **Rule:** All 36-60+ apps must use the same state management solution for
  consistency across the monorepo.
- **Avoid:** setState beyond simple local UI state; GetX; Provider (deprecated).

### Enterprise-Level Security & Caching Guidelines

#### Authentication & Authorization Security

- **JWT Token Management:** Use short-lived access tokens (15-60 min expiry)
  with refresh token rotation. Store tokens in Flutter Secure Storage - never
  in plain SharedPreferences or localStorage.
- **Brute Force Prevention:** Enforce a maximum of 5 login attempts, then
  trigger exponential backoff or a temporary account lockout (15-30 min).
- **Multi-Factor Authentication (MFA):** Enforce Firebase MFA for all admin
  and high-privilege accounts.
- **Session Invalidation:** Implement server-side session revocation on logout
  or suspicious activity detection (e.g., unusual IP or device fingerprint change).

#### API & Network Security

- **HTTPS Enforcement:** All API endpoints must be served over HTTPS/TLS 1.2+.
  Reject plain HTTP requests at the Cloud Run ingress level.
- **CORS Configuration:** Define strict CORS policies — allow only known app
  origins. Never use a wildcard `*` in production environments.
- **Rate Limiting & Throttling:** Enforce per-IP rate limits on all API endpoints
  (e.g., 100 requests/min per user). Use Cloud Armor or ASP.NET Core middleware.
- **Request Size Limits:** Cap all incoming request body sizes to prevent memory
  exhaustion attacks (recommended maximum: 5 MB per request).
- **API Versioning:** Always version APIs using path-based versioning (e.g.,
  `/api/v1/`, `/api/v2/`) from day one to prevent breaking changes across live apps.

#### Data & Database Security

- **SQL Injection Prevention:** All database queries must use parameterized queries
  or prepared statements — never raw string concatenation.
- **Input Validation & Sanitization:** Implement robust schemas (Zod, Joi, or
  express-validator) to validate and sanitize all user inputs before database
  insertion.
- **Row Level Security (RLS):** Enforce Supabase RLS policies on every database
  table — no exceptions, no bypass.
- **Principle of Least Privilege (PoLP):** Client-side code uses only the Supabase
  anon key. Server-side scripts use the service role key via secure environment
  variables — never hardcoded.
- **Data Encryption at Rest:** Ensure Supabase encrypted storage is enabled.
  Sensitive fields (e.g., payment tokens) must never be stored in plain text.

#### Backup & Disaster Recovery

- **Automated Backups:** Schedule daily automated Supabase database backups.
- **Recovery Time Objective (RTO):** System must be restored within 4 hours
  of a confirmed incident.
- **Recovery Point Objective (RPO):** Maximum acceptable data loss is 24 hours.
- **Backup Testing:** Restore a backup to a staging environment at least once
  per quarter to verify integrity.

#### Anti-Hacking & Attack Prevention

- **XSS Prevention:** Sanitize all user-generated content before rendering.
  Never inject raw HTML. Use server-side output encoding.
- **CSRF Protection:** Use anti-CSRF tokens for all state-changing API requests.
  Leverage `SameSite=Strict` cookie attributes on all session cookies.
- **Dependency Vulnerability Scanning:** Run `flutter pub audit` and
  `dotnet list package --vulnerable` as mandatory CI/CD pipeline steps.
- **Secret Management:** Never commit credentials, API keys, or passwords to
  version control. Use `.env` files (listed in `.gitignore`) and GitHub Actions
  Secrets for all CI/CD pipelines.
- **Audit Logging:** Log all authentication events, admin actions, and API errors
  to Google Cloud Logging for full traceability and forensic readiness.
- **Anomaly Detection & Alerting:** Monitor for unusual traffic spikes, repeated
  failed auth attempts, and abnormal data access patterns using Google Cloud
  Monitoring alerts.
- **Sensitive File Protection:** Actively maintain `.gitignore` to safeguard all
  local credentials and `.env` files from accidental public exposure.

#### Caching Strategy

- **Database Query Caching:** Use Redis or Memcached for read-heavy operations.
  Cache frequently accessed data: user profiles, subscription status, app configs.
- **Cache Invalidation (TTL Rules):**
  - Subscription status: TTL 5 minutes
  - App configuration / static data: TTL 1 hour
  - User profile data: TTL 15 minutes
- **CDN Caching:** Enable Cloud CDN or Cloudflare for static assets once the
  user base exceeds 50,000 (aligned with the Scaling Rule in Section 6).
- **Flutter-Side Caching:** Use `flutter_cache_manager` or `Hive` for local
  offline caching of API responses. Avoid redundant network calls to reduce
  latency and backend load.
- **API Response Caching:** Cache non-personalized API responses using standard
  HTTP cache headers (`Cache-Control`, `ETag`) at the Cloud Run middleware level.

#### Error Logging & Monitoring

- **Primary Tool:** Google Cloud Logging + Google Cloud Monitoring (built into GCP).
- **Optional:** Sentry for client-side Flutter crash reporting and error tracking.
- **Rule:** Every unhandled exception in production must be logged with sufficient
  context to reproduce and fix the issue within one development cycle.

### CI/CD Standard

- **Primary Tool:** GitHub Actions (Never use Jenkins).
- **Reasoning:** Jenkins demands higher maintenance, adds complexity, and is less
  suitable for solo development.
- **Pipeline Workflow:**
  ```
  Build -> flutter pub audit -> dotnet list --vulnerable -> Test -> Docker Build -> Artifact Registry -> Cloud Run Deploy
  ```
- **Testing Requirements:**
  - Flutter unit & widget tests: `flutter test` (minimum 70% code coverage).
  - Backend unit tests: `xUnit` or `NUnit` (minimum 70% code coverage).
  - Integration tests must pass before any Cloud Run deployment is triggered.

### Testing Standards

- **Flutter Testing Framework:** `flutter_test` (built-in).
- **Backend Testing Framework:** `xUnit` or `NUnit` for ASP.NET Core.
- **Minimum Coverage Target:** 70% line coverage across all packages and the backend.
- **Test Types Required:**
  - Unit tests for all shared package logic.
  - Widget tests for all shared UI components.
  - Integration tests for all API endpoints.
- **Rule:** Tests must run on every pull request via GitHub Actions. A failing test
  blocks the merge.

### OCR Standard

- **Preferred Tool:** Google ML Kit (On-device OCR).
- **Reasoning:** Offers on-device processing, low latency, zero API costs, and better
  scaling.
- **Rule:** Avoid Cloud OCR for every request.

### Authentication Standard

- **Primary Service:** Firebase Authentication.
- **Methods:** Email, Google, Apple.
- **Rule:** Avoid building custom authentication systems.

### Database Standard

- **Primary Service:** Supabase PostgreSQL.
- **Stored Data:** Users, History, Subscription Data, Settings, Analytics.

### Ads Standard

- **Primary Service:** AdMob.
- **Free Plan:** Ads Enabled.
- **Premium Plan:** Ads Removed.

### Payments Standard

- **Primary Service:** Stripe.
- **Subscription Support:** Monthly and Annual Subscriptions.

---

## SECTION 6: Release, Scaling, & Long-Term Goals

### Development Workflow

```
Idea -> Antigravity -> Generate Application -> GitHub Repo -> Claude Code Review -> Testing -> GitHub Actions -> Docker Build -> Artifact Registry -> Cloud Run -> Production
```

### Release Rule

- Every release must undergo:
  1. Claude Code Review
  2. Build Verification
  3. Dependency Vulnerability Check (`flutter pub audit` + `dotnet list --vulnerable`)
  4. GitHub Actions Success (all tests passing)

### Scaling Rule

- **0 - 5,000 Users:** Cloud Run
- **5,000 - 50,000 Users:** Cloud Run + Redis
- **50,000 - 100,000 Users:** Cloud Run + Redis + CDN
- **100,000+ Users:** Kubernetes (GKE)
- **Rule:** Do **NOT** install Kubernetes before it is actually needed.

### Long-Term Goals

- **Year 1:** 36 Apps
- **Year 2:** 60+ Apps
- **Infrastructure Goal:** One Platform, One Monorepo, One Backend, One CI/CD, One Cloud Environment.
- **Business Goal:** Create multiple niche applications using the same reusable platform.
