---
name: business-logic
description: MarksheetGenerator-এর সমস্ত business logic-এর living document। প্রতিটি prompt-এ যেকোনো logic তৈরি বা পরিবর্তন হলে এই skill সাথে সাথে আপডেট করতে হবে। কোনো feature বা calculation সংক্রান্ত প্রশ্ন, নতুন logic বা পরিবর্তনের সময় সবার আগে এটি পড়তে হবে।
---

# Business Logic — Living Document
> শেষ আপডেট: 2026-06-15
> ⚠️ যেকোনো logic পরিবর্তন হলে এই ফাইল সাথে সাথে আপডেট করতে হবে।

---

## ১. Grading Logic
**ফাইল:** `src/lib/marksheet-types.ts` → `GRADE_SCALE`, `getGrade()`

Grade সবসময় **percentage থেকে** compute হয় — stored grade নয়।

| Percentage | Grade | GP |
|-----------|-------|-----|
| 80–100 | A+ | 5.0 |
| 70–79.99 | A | 4.0 |
| 60–69.99 | A- | 3.5 |
| 50–59.99 | B | 3.0 |
| 40–49.99 | C | 2.0 |
| 33–39.99 | D | 1.0 |
| 0–32.99 | F | 0.0 |

```
percentage = (obtained / fullMarks) × 100
```

**GPA:** Excel-এ GPA থাকলে সেটা, নইলে সব subject-এর GP-এর গড়।

---

## ২. Full Marks Logic
**ফাইল:** `src/lib/marksheet-types.ts` → `resolveFullMarks()`, `isElementaryClass()`

### Special Class Rule
- **Playgroup** বা **Nursery** → সব subject-এর full marks = **50** (exception নেই)
- অন্য সব class → নিচের subject-specific rule

### Subject-specific Defaults (100 ছাড়া)
| Subject | Full Marks |
|---------|-----------|
| Bengali 2nd Paper | 50 |
| English 2nd Paper | 50 |
| Arabic 2nd Paper | 50 |
| Kalima, Masyala and Hadith | 50 |
| Information and Communications Technology | 50 |
| Agricultural Studies | 50 |
| Arabic Spoken | 50 |
| English Spoken | 50 |
| বাকি সব | 100 |

### Match Logic
`getDefaultFullMarks()` case/whitespace-insensitive fallback দিয়ে match করে।
যেমন `"english spoken"` বা `"English  Spoken"` সবই 50 পাবে।

---

## ৩. Class List (Ordered)
**ফাইল:** `src/lib/constants.ts` → `ALL_CLASSES`

```
Playgroup → Nursery → One → Two → Three → Four →
Five → Six → Seven → Eight → Nine → Ten
```

---

## ৪. Excel Parse Logic
**ফাইল:** `src/lib/excel-parser.ts`

### দুটো Format সাপোর্ট করে (auto-detect)

**LONG format** (Subject কলাম আছে):
- এক row = এক (student, subject) pair
- Group key: `Student ID` → fallback: `Class|RollNo` → fallback: `Student Name`
- একই group-এর সব row merge করে একটি `StudentRecord` বানায়

**WIDE format** (Subject কলাম নেই):
- এক row = এক student
- Meta column বাদে বাকি সব column = subject (obtained marks)
- Full marks `resolveFullMarks()` দিয়ে auto-assign

### Column Name Tolerance
`pick()` function case/space/underscore insensitive:
- `"Student ID"` = `"StudentID"` = `"student id"` = `"STUDENT_ID"` ✅

### Required Columns (minimum)
`Student Name` বা `Roll No` — একটা না থাকলে row skip হয়।

---

## ৫. QR Code & Verify Logic
**ফাইল:** `src/lib/pdf-generator.ts` → `qrIdFor()`, `buildVerifyQr()`
**Verify page:** `src/routes/verify.$studentId.tsx`

### QR ID Format (এই ক্রম পরিবর্তন করা যাবে না)
```
{className}-{studentId}-{firstName}-{year}
```
- `firstName` = studentName-এর প্রথম শব্দ
- `studentId` খালি হলে `rollNo` ব্যবহার হয়

### QR URL
```
https://as-sunnah-madrasah.org/verify/{encodeURIComponent(qrId)}
```
⚠️ `qrIdFor()` আর verify page একসাথে বদলাতে হবে — একটা বদলালে অন্যটা verify ভাঙবে।

---

## ৬. PDF Delivery Logic
**ফাইল:** `src/lib/share-pdf.ts`

### PDF-এর জন্য ৩ ধরনের function

| Function | Options | কোথায় ব্যবহার |
|----------|---------|----------------|
| `deliverPdf()` | Share / Email / Local | সাধারণ marksheet |
| `deliverPdfWithView()` | View / Share / Email / Local | Preview সহ |
| `deliverPdfThree()` | View / Share / Local (Email নেই) | ৩-option variant |

### Share Priority
1. Native Web Share API (`navigator.share`) — mobile-এ সরাসরি share sheet খোলে
2. Fallback: local download

### Email Fallback
Mobile-এ Web Share দিয়ে Gmail/Email অ্যাপ সিলেক্ট করলে file auto-attach হয়।
Desktop-এ: file download হয় + `mailto:` link খোলে — browser security-র কারণে
auto-attach সম্ভব না।

### Generic File Delivery
`deliverFile()` — WhatsApp / Email / Local (PDF ছাড়া অন্য ফাইলের জন্য)

---

## ৭. Delete Password Protection
**ফাইল:** `src/lib/deletePassword.ts`

### উদ্দেশ্য
Accidental deletion রোধ — security layer নয় (plain text localStorage)।

### Roles
```
super_admin | admin | teacher
```

### Logic Flow
```
requireDeletePassword() call হলে:
  1. Global toggle OFF? → allow (কোনো password চাই না)
  2. Password set নেই? → allow
  3. User input নেয়
  4. Cancel? → block
  5. Wrong password? → alert + block
  6. Correct → allow
```

### Storage Keys (localStorage)
| Key | কী রাখে |
|-----|---------|
| `delete_password_v1` | password value |
| `app.currentRole` | current user role |
| `delete_password_enabled_v1` | per-role enable map |
| `delete_password_global_enabled_v1` | global toggle |

---

## ৮. App Settings Keys (Supabase)
**ফাইল:** `src/lib/constants.ts` → `APP_SETTINGS_KEYS`
**Table:** `app_settings`

| Key | কী রাখে |
|-----|---------|
| `school` | school name, address, font, logo |
| `subjects_global` | global subject list |
| `global_year_term` | current year ও exam term |

---

## ৯. Logo Processing Logic
**ফাইল:** `src/lib/pdf-generator.ts` → `processLogoBlob()`

Background auto-detect করে corner/edge sample করে knock-out:
- `HARD = 28` → পুরো transparent
- `SOFT = 75` → feather blend করে paper color-এর সাথে মেশায়
- Paper color: `(255, 250, 220)` হালকা হলুদ

### Signature Processing
`processSignatureBlob()` — ink detect করে background drop করে:
- ink = `contrast > 45` বা `(contrast > 28 && chroma > 24 && lum < 215)`
- Output: blue-black ink `(20, 25, 60)`, max 480px

---

## ১০. Multi-term Marksheet Logic
**ফাইল:** `src/lib/pdf-generator.ts` → `renderMarksheetWithAssets()`

PDF-এ ৩ term column: 1st / 2nd / 3rd Term
- Current term: `student.exam` থেকে detect (`"2nd"/"second"` → index 1, ইত্যাদি)
- অন্য term: `student.termsData[termKey][subjectName]` থেকে পড়া হয়
- Saved grade recompute হয় — stale stored grade গ্রহণ করা হয় না

---

---

## ১১. বারবার চেষ্টা করেও কাজ না হলে — Debug Protocol

### কখন এই protocol চালু হবে
একই logic ২ বা তার বেশিবার পরিবর্তন করার পরও যদি user বলে **"কাজ করছে না"**।

### তখন কী করবে (ক্রমে)

**ধাপ ১ — সংশ্লিষ্ট code block সরাসরি পড়ো**
অনুমান করো না। ফাইল Read করে আসল current code দেখো।

**ধাপ ২ — User-কে code-সহ ব্যাখ্যা দাও এই format-এ:**

```
## কোডে এখন কী আছে
[actual code block]

## এটা কীভাবে কাজ করছে (line-by-line)
- Line X: [কী করছে]
- Line Y: [কী করছে]

## সমস্যাটা কোথায় হচ্ছে বলে মনে হচ্ছে
[root cause বাংলায়]

## আমার প্রস্তাবিত সমাধান
[code + কেন এটা ঠিক করবে]
```

**ধাপ ৩ — এই skill আপডেট করো**
ঠিক হওয়া logic-টা এই ফাইলের সঠিক section-এ যোগ করো এবং
নিচের "Repeated Fix Log"-এ একটা entry দাও।

---

## Repeated Fix Log
> বারবার চেষ্টা করে ঠিক হওয়া logic এখানে রাখো — যাতে ভবিষ্যতে একই ভুল না হয়।

| তারিখ | Section | সমস্যা | Root Cause | সমাধান |
|-------|---------|--------|-----------|--------|
| — | — | — | — | — |

---

## নিয়ম: এই ফাইল কখন আপডেট করবে

যেকোনো prompt-এ নিচের যেকোনোটা হলে সাথে সাথে এই ফাইল আপডেট করো:

- নতুন calculation বা formula যোগ
- Grading scale পরিবর্তন
- Full marks rule পরিবর্তন
- নতুন subject যোগ/বাদ
- Excel column বা format পরিবর্তন
- QR format পরিবর্তন
- PDF delivery option পরিবর্তন
- Delete password logic পরিবর্তন
- App settings-এ নতুন key
- Class list পরিবর্তন
- যেকোনো নতুন business rule
