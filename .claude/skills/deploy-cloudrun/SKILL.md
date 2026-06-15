---
name: deploy-cloudrun
description: MarksheetGenerator কে Google Cloud Run-এ deploy করার পূর্ণ ধাপ। ব্যবহারকারী যখন "deploy", "publish", "live করো", "Cloud Run-এ পাঠাও", "production-এ দাও" বলে তখন এই skill ব্যবহার করো।
---

# Deploy to Google Cloud Run

MarksheetGenerator একটি static React SPA যা Docker (nginx) container হিসেবে
Google Cloud Run-এ চলে। নিচের ধাপগুলো ঠিক ক্রমে অনুসরণ করতে হবে।

## প্রয়োজনীয় তথ্য (Infrastructure)

| বিষয় | মান |
|------|-----|
| GCP Project ID | `gmail-and-telegram-480114` |
| Cloud Run Service | `marksheetgenerator-crs` |
| Region | `us-central1` (Iowa) |
| Container Port | `8080` (nginx) |
| Domain | `marksheet.as-sunnah-madrasah.org` |

## Deploy করার আগে যাচাই (Pre-flight checks)

১. কোডে কোনো error নেই তা নিশ্চিত করো:
```bash
bun run lint
```

২. Build সফল হয় কিনা locally পরীক্ষা করো (build output `dist/client/` এ যায়):
```bash
bun run build
```

> Build fail করলে deploy করো না — আগে error ঠিক করো।

## Deploy Command

`gcloud` নিজেই Dockerfile দিয়ে container build করে Cloud Run-এ পাঠায়
(`--source .` মানে current folder থেকে build হবে):

```bash
gcloud run deploy marksheetgenerator-crs --source . --region us-central1 --platform managed --allow-unauthenticated --port 8080 --project gmail-and-telegram-480114
```

## Deploy-এর পরে

- Terminal-এ যে **Service URL** দেখায় সেটা ব্যবহারকারীকে জানাও।
- মূল site: https://marksheet.as-sunnah-madrasah.org

## সাধারণ সমস্যা

| সমস্যা | কারণ ও সমাধান |
|--------|----------------|
| `bun run build` fail | TypeScript বা import error — আগে ঠিক করো |
| gcloud auth error | `gcloud auth login` চালাতে বলো ব্যবহারকারীকে |
| Container port mismatch | অবশ্যই `8080` — Dockerfile-এর nginx এই port-এ listen করে |
| Env var হারিয়ে গেছে | Supabase anon key Dockerfile-এ baked আছে (build-time), আলাদা করে দিতে হয় না |

## মনে রাখার নিয়ম

- এটি Flutter নয় — React + Bun প্রজেক্ট।
- Package manager **Bun**, `npm`/`pnpm` নয়।
- Deploy করার আগে ব্যবহারকারীর অনুমতি নাও (এটি production-এ live হয়)।
