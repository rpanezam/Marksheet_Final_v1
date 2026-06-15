---
name: pdf-debug
description: MarksheetGenerator-এর jsPDF marksheet PDF-এর layout, লেখা/টেবিল overlap, লোগো, watermark, QR code, ফন্ট, বা grade/GPA হিসাবের সমস্যা ঠিক করা। ব্যবহারকারী যখন "PDF ভাঙছে", "marksheet layout", "লেখা মিলছে না", "logo/watermark", "QR কাজ করছে না", "টেবিল overlap", "ফন্ট সমস্যা" সংক্রান্ত কিছু বলে তখন এই skill ব্যবহার করো।
---

# PDF (Marksheet) Debugging

মূল ফাইল: `src/lib/pdf-generator.ts`
লাইব্রেরি: **jsPDF** + **jspdf-autotable**

## আগে এই মূল বিষয়গুলো বোঝো

| বিষয়                | মান                                                                   |
| -------------------- | --------------------------------------------------------------------- |
| Page                 | A4 portrait, unit = **mm** (210 × 297 mm)                             |
| Margin               | `margin = 10` mm                                                      |
| Core render function | `renderMarksheetWithAssets(...)`                                      |
| Table                | 3-term layout: 1st / 2nd / 3rd Term (প্রতি term-এ Total/Obtain/Grade) |
| Paper color          | হালকা হলুদ `(255, 250, 220)`                                          |

## কাঠামো (উপর থেকে নিচে, এই ক্রমে আঁকা হয়)

1. Background fill + circular watermark (হালকা)
2. Outer double border
3. Logo (top-left), Bismillah (center top)
4. School name (auto-fit font shrink) + "Established 2024" + address
5. "ACADEMIC TRANSCRIPT" pill + QR (pill-এর ডানে)
6. Student info (Student ID, Class, Name, Father's, Roll No)
7. Marks table (`autoTable`) + summary foot rows
8. Status (Pass/Fail) → Section Position / Moral / Co-Curricular টেবিল
9. Teacher's Comments box
10. Grade Key টেবিল
11. Principal + Teacher signature line + ছবি
12. Watermark overlay (GState opacity দিয়ে)

## সাধারণ সমস্যা ও সমাধান

### লেখা/টেবিল একটার উপর আরেকটা (overlap)

- প্রতিটা block-এর Y position আগের block-এর শেষ থেকে হিসাব হয়।
- autoTable-এর পরের অবস্থান পেতে: `(doc as any).lastAutoTable.finalY` ব্যবহার হয়।
- কোনো block বড় হলে নিচেরগুলোর `y` ঠিকমতো বাড়ছে কিনা দেখো। নতুন কিছু যোগ
  করলে আগের `finalY` থেকে offset নাও — hardcoded Y দিও না।

### School name বড় হয়ে border ছাড়িয়ে যাচ্ছে

- নাম auto-fit হয়: `nameFont` 22 থেকে কমে যতক্ষণ না `maxNameWidth`-এ আঁটে।
- `clearSide` (logo width + gap) দুই পাশে জায়গা রাখে — এটা বদলালে logo-র
  সাথে overlap করতে পারে।

### Logo/signature-এর সাদা background থেকে যাচ্ছে

- `processLogoBlob()` corner sample করে background detect করে knock-out করে।
- threshold: `HARD = 28` (পুরো transparent), `SOFT = 75` (feather blend)।
- background না কাটলে এই দুটো মান বাড়াও; বেশি কাটলে কমাও।
- Signature: `processSignatureBlob()` — ink detect করে, `contrast`/`chroma`
  threshold দিয়ে। base64 size ছোট রাখতে `MAX = 480`।

### Watermark খুব গাঢ়/হালকা

- প্রথম পাস: alpha `× 0.46` (loadWatermarkDataUrl)।
- Overlay পাস: `GState({ opacity: 0.28 })`। এই দুটো মান টিউন করো।

### QR কাজ করছে না / ভুল link

- QR URL: `https://as-sunnah-madrasah.org/verify/{qrId}` (PUBLISHED domain)।
- `qrIdFor()` format: `{className}-{studentId}-{firstName}-{year}`।
- verify page (`src/routes/verify.$studentId.tsx`) **ঠিক এই ক্রমে** parse করে —
  format বদলালে দুই জায়গায় একসাথে বদলাতে হবে, নইলে verify ভাঙবে।

### Grade/GPA ভুল আসছে

- Grade সবসময় **percentage থেকে** compute হয় (`getGrade()` in marksheet-types.ts),
  stored grade নয় — তাই 50-marks subject-ও ঠিকমতো grade পায়।
- GPA: Excel-এ GPA থাকলে সেটা, নইলে subject GP-এর গড়।
- grade boundary বদলাতে হলে `GRADE_SCALE` (marksheet-types.ts) এডিট করো।

### Blackletter (Old English) ফন্ট আসছে না

- `ensureOldEnglishFont(doc)` কল হতে হবে set করার আগে।
- ফন্ট data: `old-english-font-data.ts` / `old-english-font.ts`।

## টেস্ট করার নিয়ম

- কোড বদলের পর `bun run dev` চালিয়ে আসল browser-এ PDF generate করে দেখো —
  jsPDF coordinate (mm) চোখে না দেখে নিশ্চিত হওয়া কঠিন।
- একাধিক student, ও লম্বা নাম/comment দিয়ে টেস্ট করো (overlap ধরতে)।
- mm unit মাথায় রাখো: 1mm ছোট মনে হলেও PDF-এ স্পষ্ট দেখা যায়।

## মনে রাখার নিয়ম

- jsPDF-এর `align: "center"` charSpace উপেক্ষা করে — তাই pill title left-align
  করে manually center করা হয়েছে। এটা ভেঙো না।
- নতুন asset (image) PNG হিসেবে `addImage(..., "FAST")` দিয়ে যোগ করো।
