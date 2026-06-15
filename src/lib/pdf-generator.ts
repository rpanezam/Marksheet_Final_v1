/**
 * ============================================================
 * pdf-generator.ts — A4 মার্কশিট PDF তৈরির পুরো লজিক
 * ============================================================
 * jsPDF + jspdf-autotable লাইব্রেরি ব্যবহার করে প্রতি স্টুডেন্টের
 * জন্য একটা সুন্দর সার্টিফিকেট-স্টাইল মার্কশিট আঁকা হয়।
 *
 * প্রধান ফাংশনগুলো:
 *  • processLogoBlob()        — আপলোড করা লোগোর সাদা ব্যাকগ্রাউন্ড
 *                               কেটে কাগজের রঙের সাথে ব্লেন্ড করে
 *  • renderMarksheet()        — এক পেজে একজন স্টুডেন্টের সম্পূর্ণ
 *                               মার্কশিট আঁকে (বর্ডার, লোগো, হেডার,
 *                               সাবজেক্ট টেবিল, সামারি, কমেন্ট,
 *                               গ্রেড স্কেল, সিগনেচার)
 *  • generateMarksheetsPDF()  — অনেক স্টুডেন্টকে এক PDF-এ একসাথে
 *  • generateSingleMarksheetPDF() — শুধু একজন স্টুডেন্টের PDF
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { getGrade, type SchoolInfo, type StudentRecord } from "./marksheet-types";
import schoolLogoUrl from "@/assets/school-logo.jpg";
import bismillahUrl from "@/assets/bismillah.png";
import { ensureOldEnglishFont, OLD_ENGLISH_FONT_NAME } from "./old-english-font";

let cachedLogoDataUrl: string | null = null;
async function loadLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const res = await fetch(schoolLogoUrl);
  const blob = await res.blob();
  cachedLogoDataUrl = await processLogoBlob(blob);
  return cachedLogoDataUrl;
}

let cachedWatermarkDataUrl: string | null = null;
async function loadWatermarkDataUrl(customLogoDataUrl?: string): Promise<string> {
  if (cachedWatermarkDataUrl && !customLogoDataUrl) return cachedWatermarkDataUrl;
  const srcUrl = customLogoDataUrl || schoolLogoUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = srcUrl;
  });
  const size = 600;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Circular clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  // Fit logo centered
  const scale = Math.min(size / img.width, size / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  ctx.restore();
  // Convert to faint grayscale watermark
  const data = ctx.getImageData(0, 0, size, size);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2],
      a = d[i + 3];
    if (a === 0) continue;
    // Treat near-white as fully transparent (drop background)
    if (r > 235 && g > 235 && b > 235) {
      d[i + 3] = 0;
      continue;
    }
    // Grayscale
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    d[i] = gray;
    d[i + 1] = gray;
    d[i + 2] = gray;
    // Faint watermark: keep enough alpha so it remains visible through overlay
    d[i + 3] = Math.round(a * 0.46);
  }
  ctx.putImageData(data, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (!customLogoDataUrl) cachedWatermarkDataUrl = url;
  return url;
}

let cachedBismillahDataUrl: string | null = null;
async function loadBismillahDataUrl(): Promise<string> {
  if (cachedBismillahDataUrl) return cachedBismillahDataUrl;
  const res = await fetch(bismillahUrl);
  const blob = await res.blob();
  cachedBismillahDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return cachedBismillahDataUrl;
}

/**
 * Process any image blob/file into a paper-blended transparent PNG data URL
 * suitable for placing on the marksheet.
 */
export async function processLogoBlob(blob: Blob): Promise<string> {
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - dw) / 2, (size - dh) / 2, dw, dh);
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  // Paper color (matches PAPER_COLOR below): light yellow
  const PR = 255,
    PG = 250,
    PB = 220;
  // Auto-detect the source background by sampling the four corners + edges.
  // This makes the knock-out work whether the upload has a white, off-white,
  // grey, cream, or even a colored solid background.
  const sample: Array<[number, number, number]> = [];
  const pushPx = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    if (d[i + 3] < 8) return;
    sample.push([d[i], d[i + 1], d[i + 2]]);
  };
  const step = 6;
  for (let k = 0; k < size; k += step) {
    pushPx(k, 0);
    pushPx(k, size - 1);
    pushPx(0, k);
    pushPx(size - 1, k);
  }
  let bgR = 255,
    bgG = 255,
    bgB = 255;
  if (sample.length) {
    sample.sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2]));
    // median of the brightest half = robust paper estimate
    const top = sample.slice(0, Math.max(1, Math.floor(sample.length * 0.5)));
    bgR = top.reduce((s, p) => s + p[0], 0) / top.length;
    bgG = top.reduce((s, p) => s + p[1], 0) / top.length;
    bgB = top.reduce((s, p) => s + p[2], 0) / top.length;
  }
  // Distance thresholds (in RGB space) for knock-out + feather.
  const HARD = 28; // <= => fully transparent (matches detected bg)
  const SOFT = 75; // <= => feathered blend toward paper color
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const dr = r - bgR,
      dg = g - bgG,
      db = b - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= HARD) {
      d[i + 3] = 0;
      continue;
    }
    if (dist <= SOFT) {
      // Feather: blend pixel toward paper color and fade alpha, so the logo
      // edges merge cleanly into the marksheet paper (no halo / hard cutout).
      const t = 1 - (dist - HARD) / (SOFT - HARD); // 1 at HARD, 0 at SOFT
      d[i] = Math.round(r * (1 - t) + PR * t);
      d[i + 1] = Math.round(g * (1 - t) + PG * t);
      d[i + 2] = Math.round(b * (1 - t) + PB * t);
      d[i + 3] = Math.round(d[i + 3] * (1 - t * 0.7));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Process a photographed signature: detect dark ink strokes, drop the paper
 * background entirely (transparent), and keep ink as near-black so it sits
 * cleanly on the marksheet's paper color. 100% local — no external API.
 */
export async function processSignatureBlob(blob: Blob): Promise<string> {
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
  // Preserve aspect ratio; cap longest side. Keep this modest so the
  // base64-encoded PNG fits comfortably inside an app_settings JSON row
  // (PostgREST default body limit is ~1MB and we also store the school
  // logo in the same row).
  const MAX = 480;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const W = Math.max(1, Math.round(bitmap.width * scale));
  const H = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, W, H);
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;

  // Use the photo's own bright-paper level as the background reference, then
  // keep only pixels that are clearly darker/ink-like. This removes shadows,
  // paper texture, and visible rectangular borders without any external API.
  const lumSamples: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 12) continue;
    lumSamples.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }
  lumSamples.sort((a, b) => a - b);
  const paperLum = lumSamples.length ? lumSamples[Math.floor(lumSamples.length * 0.9)] : 245;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const contrast = paperLum - lum;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const isInk = contrast > 45 || (contrast > 28 && chroma > 24 && lum < 215);
    if (!isInk) {
      d[i + 3] = 0;
    } else {
      const t = Math.max(0, Math.min(1, (contrast - 25) / 95));
      const alpha = Math.round(d[i + 3] * Math.min(1, 0.25 + t * 0.85));
      d[i] = 20;
      d[i + 1] = 25;
      d[i + 2] = 60; // subtle blue-black ink tone
      d[i + 3] = alpha;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Trim transparent margins so signature scales nicely to its line
  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL("image/png");
  const pad = 4;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(W - cx, maxX - minX + pad * 2);
  const ch = Math.min(H - cy, maxY - minY + pad * 2);
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
  return out.toDataURL("image/png");
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Render one student's marksheet onto the current PDF page.
 */
function renderMarksheet(
  doc: jsPDF,
  student: StudentRecord,
  school: SchoolInfo,
  logoDataUrl: string,
) {
  return renderMarksheetWithAssets(doc, student, school, logoDataUrl, null, null, null, null, null);
}

function renderMarksheetWithAssets(
  doc: jsPDF,
  student: StudentRecord,
  school: SchoolInfo,
  logoDataUrl: string,
  bismillahDataUrl: string | null,
  watermarkDataUrl: string | null,
  qrDataUrl: string | null,
  principalSigDataUrl: string | null,
  teacherSigDataUrl: string | null,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const innerLeft = margin + 4;
  const innerRight = pageW - margin - 4;

  // হালকা হলুদ ব্যাকগ্রাউন্ড
  doc.setFillColor(255, 250, 220);
  doc.rect(0, 0, pageW, pageH, "F");

  // Faint circular watermark logo — drawn before borders/content so all text
  // sits on top. Kept very light so readability is not affected.
  if (watermarkDataUrl) {
    const wmSize = 132;
    const wmX = (pageW - wmSize) / 2;
    const wmY = (pageH - wmSize) / 2;
    doc.addImage(watermarkDataUrl, "PNG", wmX, wmY, wmSize, wmSize, undefined, "FAST");
  }

  // আউটার বর্ডার — হালকা হলুদ
  doc.setDrawColor(200, 175, 60);
  doc.setLineWidth(1.2);
  doc.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
  doc.setLineWidth(0.4);
  doc.rect(margin + 2, margin + 2, pageW - margin * 2 - 4, pageH - margin * 2 - 4);

  // Logo (top-left) — transparent PNG already blended to paper color, so we
  // just drop it in without a clipping circle or border ring.
  const logoSize = 28;
  const logoX = innerLeft;
  const logoY = margin + 4;
  doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize, undefined, "FAST");

  // (QR is rendered later, aligned beside the ACADEMIC TRANSCRIPT pill.)

  // Bismillah calligraphy — centered at top above school name
  if (bismillahDataUrl) {
    const bW = 42;
    const bH = 9;
    doc.addImage(bismillahDataUrl, "PNG", (pageW - bW) / 2, margin + 2, bW, bH, undefined, "FAST");
  }

  // Header — school name (international certificate style: serif bold italic with letter spacing)
  let y = margin + 15;
  const schoolFontPref = school.font || "times";
  if (schoolFontPref === "blackletter") ensureOldEnglishFont(doc);
  const schoolFont = schoolFontPref === "blackletter" ? OLD_ENGLISH_FONT_NAME : schoolFontPref;
  doc.setFont(schoolFont, "bold");
  doc.setTextColor(0, 0, 0);
  const nameText = school.name.toUpperCase();
  // Auto-fit: keep clear-space around the logo on both sides so the title
  // never overlaps it and never runs to the page edge.
  const clearSide = logoSize + 6; // logo width + gap on each side of center
  const maxNameWidth = pageW - margin * 2 - clearSide * 2;
  let nameFont = 22;
  let charSpace = 0.6;
  // Shrink font (and tighten letter-spacing) until it fits.
  while (nameFont > 9) {
    doc.setFontSize(nameFont);
    const w = doc.getTextWidth(nameText) + nameText.length * charSpace;
    if (w <= maxNameWidth) break;
    nameFont -= 0.5;
    if (nameFont < 14) charSpace = 0.3;
    if (nameFont < 11) charSpace = 0;
  }
  doc.setFontSize(nameFont);
  doc.text(nameText, pageW / 2, y, { align: "center", charSpace } as never);
  doc.setTextColor(20, 20, 20);

  // Established 2024 — centered between school name and address
  y += 5;
  doc.setFont("times", "bolditalic");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text("Established 2024", pageW / 2, y, { align: "center" });
  doc.setTextColor(20, 20, 20);

  y += 5;
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.text(school.address, pageW / 2, y, { align: "center" });

  // ACADEMIC TRANSCRIPT — bold title pill
  y += 8;
  const transcriptFontPref = school.transcriptFont || schoolFontPref;
  if (transcriptFontPref === "blackletter") ensureOldEnglishFont(doc);
  const transcriptFont =
    transcriptFontPref === "blackletter" ? OLD_ENGLISH_FONT_NAME : transcriptFontPref;
  doc.setFont(transcriptFont, "bold");
  const titleFontSize = school.transcriptFontSize ?? 9.9;
  doc.setFontSize(titleFontSize);
  doc.setTextColor(0, 0, 0);
  const titleText = "ACADEMIC TRANSCRIPT";
  const titleCharSpace = 1.2;
  const titleTextW = doc.getTextWidth(titleText) + titleText.length * titleCharSpace;
  const titleTextH = titleFontSize * 0.3528;
  const pillPadX = 9;
  const pillPadY = 3.2;
  const pillW = titleTextW + pillPadX * 2;
  const pillH = titleTextH + pillPadY * 2;
  const pillX = (pageW - pillW) / 2;
  const pillY = y;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(pillX, pillY, pillW, pillH);
  doc.setLineWidth(0.15);
  doc.rect(pillX + 1, pillY + 1, pillW - 2, pillH - 2);
  // Use jsPDF's middle baseline so the title stays fully inside the double border.
  const textBaselineY = pillY + pillH / 2;
  // jsPDF's align:"center" ignores charSpace, which pushes the text right.
  // Use left-align starting at the inner padding so the text sits truly centered
  // within the pill.
  doc.text(titleText, pillX + pillPadX, textBaselineY, {
    baseline: "middle",
    charSpace: titleCharSpace,
  } as never);
  doc.setTextColor(0, 0, 0);

  // QR code — placed in the empty space to the right of the ACADEMIC
  // TRANSCRIPT pill, vertically centered with it. Size auto-adjusts to fit
  // the available whitespace so it never overlaps the pill or the border.
  if (qrDataUrl) {
    // Center the QR horizontally between the transcript pill's right border
    // and the left edge of the "Class : ..." text on the row below.
    const qrSize = Math.max(8, pillH * 1.6 * 0.95); // 5% smaller
    // Compute where the "C" of Class : <value> starts (drawKVRight anchors at innerRight)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const labelW = doc.getTextWidth("Class : ");
    doc.setFont("helvetica", "bold");
    const valueW = doc.getTextWidth(student.className || "-");
    const classCx = innerRight - (labelW + valueW);
    doc.setFont("helvetica", "normal");

    const pillRight = pillX + pillW;
    const gapMidX = (pillRight + classCx) / 2;
    const qrX = gapMidX - qrSize / 2;
    const qrY = pillY + (pillH - qrSize) / 2;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");
  }

  // Grade scale box rendered later at bottom-left (see below)

  // Student info block — pushed below the transcript pill with breathing room
  y = pillY + pillH + 7;
  doc.setFontSize(9);
  const labelX = innerLeft;
  const colonX = innerLeft + 30;
  const valueX = innerLeft + 33;
  const rightLabelX = pageW / 2 + 10;
  const rightColonX = rightLabelX + 22;
  const rightValueX = rightLabelX + 25;

  // Header info — image-style: Adm No | Class on row 1; Name | Father's | QID on row 2;
  // then a small Mother / Exam / Year line below.
  doc.setFont("helvetica", "normal");
  const drawKV = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "normal");
    doc.text(`${label} :`, x, yy);
    const lw = doc.getTextWidth(`${label} : `);
    doc.setFont("helvetica", "bold");
    doc.text(value || "-", x + lw, yy);
    doc.setFont("helvetica", "normal");
  };
  // Right-aligned KV: anchors the whole "Label : value" string to xRight.
  const drawKVRight = (label: string, value: string, xRight: number, yy: number) => {
    doc.setFont("helvetica", "normal");
    const labelStr = `${label} : `;
    const labelW = doc.getTextWidth(labelStr);
    doc.setFont("helvetica", "bold");
    const valueStr = value || "-";
    const valueW = doc.getTextWidth(valueStr);
    const totalW = labelW + valueW;
    const startX = xRight - totalW;
    doc.setFont("helvetica", "normal");
    doc.text(labelStr, startX, yy);
    doc.setFont("helvetica", "bold");
    doc.text(valueStr, startX + labelW, yy);
    doc.setFont("helvetica", "normal");
  };
  // Row 1: Student ID on the left, Class flush to the right border
  drawKV("Student ID", student.studentId, innerLeft, y);
  drawKVRight("Class", student.className, innerRight, y);
  // Row 2: Name | Father's Name | Roll No (Roll flush to right border)
  drawKV("Name", student.studentName, innerLeft, y + 5);
  drawKV("Father's Name", student.fatherName, pageW / 2 - 25, y + 5);
  drawKVRight("Roll No", student.rollNo, innerRight, y + 5);

  // Marks table — 3-term layout (First / Second / Third)
  const tableY = y + 11;

  let totalFull = 0;
  let totalObtained = 0;
  let totalGP = 0;
  let failed = 0;

  // Determine which term column the current in-memory data represents.
  const examToIdx = (ex: string) => {
    const e = (ex || "").toLowerCase();
    if (e.includes("2nd") || e.includes("second")) return 1;
    if (e.includes("3rd") || e.includes("third")) return 2;
    return 0;
  };
  const currentTermIdx = examToIdx(student.exam || "");
  const termKeys = ["1st", "2nd", "3rd"] as const;

  const body = student.subjects.map((s) => {
    const obtained = s.obtained ?? 0;
    const pct = s.fullMarks ? (obtained / s.fullMarks) * 100 : 0;
    const computed = getGrade(pct);
    // Always compute grade from percentage so different full-marks (e.g. 50) grade correctly.
    const grade = computed.grade;
    const gp = computed.gp;
    totalFull += s.fullMarks;
    totalObtained += obtained;
    totalGP += gp;
    if (grade === "F") failed += 1;
    // Build all 3 term columns. Current term uses in-memory data.
    // Other terms use saved termsData if available.
    const cells: string[] = ["", "", "", "", "", "", "", "", ""];
    for (let t = 0; t < 3; t++) {
      if (t === currentTermIdx) {
        cells[t * 3 + 0] = String(s.fullMarks);
        cells[t * 3 + 1] = fmt(s.obtained);
        cells[t * 3 + 2] = grade;
      } else {
        const saved = student.termsData?.[termKeys[t]]?.[s.name];
        if (saved && saved.obtained != null) {
          cells[t * 3 + 0] = String(saved.fullMarks);
          cells[t * 3 + 1] = fmt(saved.obtained);
          // Recompute grade from saved obtained/full so any stale stored grade is corrected.
          const sPct = saved.fullMarks ? (saved.obtained / saved.fullMarks) * 100 : 0;
          cells[t * 3 + 2] = getGrade(sPct).grade;
        }
      }
    }
    return [s.name, ...cells];
  });

  // Use Excel-provided GPA if present, else average of subject GPs
  const gpa = student.gpa ?? (student.subjects.length ? totalGP / student.subjects.length : 0);
  const overallPct = totalFull ? (totalObtained / totalFull) * 100 : 0;
  const overallGrade = getGrade(overallPct).grade;

  // Summary row — auto-computed values span all 9 term cells for clean display
  const summaryRow = (label: string, value: string) => [
    {
      content: label,
      styles: {
        halign: "left" as const,
        fontStyle: "bold" as const,
        fillColor: [240, 240, 240] as [number, number, number],
      },
    },
    {
      content: value,
      colSpan: 9,
      styles: { halign: "center" as const, fontStyle: "bold" as const },
    },
  ];

  autoTable(doc, {
    startY: tableY,
    margin: { left: margin + 2, right: margin + 2 },
    head: [
      [
        { content: "Subjects", rowSpan: 2, styles: { valign: "middle" } },
        { content: "1st Term", colSpan: 3 },
        { content: "2nd Term", colSpan: 3 },
        { content: "3rd Term", colSpan: 3 },
      ],
      ["Total", "Obtain", "Grade", "Total", "Obtain", "Grade", "Total", "Obtain", "Grade"],
    ],
    body,
    foot: [
      summaryRow("Marks Obtained:", `${totalObtained.toFixed(0)} / ${totalFull}`),
      summaryRow("Percentage:", `${overallPct.toFixed(2)} %`),
      summaryRow("Position:", student.sectionPosition || "-"),
      summaryRow("Grade:", overallGrade),
      summaryRow("GPA:", gpa.toFixed(2)),
    ],
    styles: {
      fontSize: 7.5,
      cellPadding: 1,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      halign: "center",
    },
    headStyles: {
      fillColor: [225, 235, 250],
      textColor: 0,
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    footStyles: { fillColor: [255, 255, 255], textColor: 0 },
    columnStyles: { 0: { halign: "left", cellWidth: 36, fontStyle: "bold" } },
    theme: "grid",
  });

  // Status: Pass / Fail — right aligned just under the table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTableY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const status = failed === 0 && totalObtained > 0 ? "Pass" : totalObtained === 0 ? "-" : "Fail";
  doc.text("Status:", innerRight - 22, afterTableY);
  doc.setTextColor(0, 0, 180);
  doc.text(status, innerRight - 2, afterTableY, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  const extrasY = afterTableY + 4;

  const moralOptions = ["Best", "Better"];
  // ব্যবহারকারী যা লিখেছে শুধু সেগুলোই দেখাব — কমা দিয়ে আলাদা রো
  const ccItems = student.coCurricular
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  autoTable(doc, {
    startY: extrasY,
    margin: { left: margin + 2 },
    tableWidth: (pageW - margin * 2 - 4) / 3,
    body: [
      ["Section Position", student.sectionPosition],
      ["Failed Subject (s)", String(failed)],
      ["Total Present", student.totalPresent],
    ],
    styles: { fontSize: 8, cellPadding: 1.2, lineColor: [0, 0, 0], lineWidth: 0.2 },
    bodyStyles: { fillColor: [255, 255, 255] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 35 } },
    theme: "grid",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum1End = (doc as any).lastAutoTable.finalY;

  const middleX = margin + 2 + (pageW - margin * 2 - 4) / 3;
  autoTable(doc, {
    startY: extrasY,
    margin: { left: middleX },
    tableWidth: (pageW - margin * 2 - 4) / 3,
    head: [[{ content: "Moral & Behavior Evaluation", colSpan: 1 }]],
    body: moralOptions.map((opt) => [
      {
        content: opt,
        styles:
          opt === student.moralBehavior ? { fontStyle: "bold", fillColor: [225, 225, 225] } : {},
      },
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      halign: "center",
    },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
    bodyStyles: { fillColor: [255, 255, 255] },
    theme: "grid",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moralEnd = (doc as any).lastAutoTable.finalY;

  const rightX = middleX + (pageW - margin * 2 - 4) / 3;
  autoTable(doc, {
    startY: extrasY,
    margin: { left: rightX },
    tableWidth: (pageW - margin * 2 - 4) / 3,
    head: [[{ content: "Co-Curricular Activities", colSpan: 1 }]],
    // Moral টেবিলের সমান উচ্চতা রাখতে — বাকি রো খালি কিন্তু বর্ডার সহ
    body: Array.from({ length: Math.max(moralOptions.length, ccItems.length) }, (_, i) => [
      ccItems[i] ?? " ",
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      halign: "center",
    },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
    bodyStyles: { fillColor: [255, 255, 255] },
    theme: "grid",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ccEnd = (doc as any).lastAutoTable.finalY;

  // Teacher's Comments বক্স — সামারি টেবিলগুলোর আরও নিচে
  const commentsY = Math.max(sum1End, moralEnd, ccEnd) + 2;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Teacher's Comments:", innerLeft, commentsY + 4);
  doc.setFont("helvetica", "normal");
  const commentBoxX = innerLeft + 34;
  doc.rect(commentBoxX, commentsY, innerRight - commentBoxX, 7);
  if (student.comments) {
    doc.text(student.comments, commentBoxX + 2, commentsY + 5, {
      maxWidth: innerRight - commentBoxX - 4,
    });
  }

  // Grade Key — horizontal layout, spans full page width (matches marks table).
  const gradeStartY = commentsY + 10;
  const gradeLeft = margin + 2;
  const gradeTableWidth = pageW - (margin + 2) * 2;
  autoTable(doc, {
    startY: gradeStartY,
    margin: { left: gradeLeft, right: margin + 2 },
    tableWidth: gradeTableWidth,
    body: [
      [
        {
          content: "Grade Key",
          rowSpan: 2,
          styles: {
            fontStyle: "bold",
            valign: "middle",
            halign: "center",
            fillColor: [240, 240, 240],
          },
        },
        "80% to 100%",
        "70% to 79.99%",
        "60% to 69.99%",
        "50% to 59.99%",
        "40% to 49.99%",
        "33% to 39.99%",
        "Below 33%",
      ],
      [
        { content: "A+", styles: { fontStyle: "bold" } },
        { content: "A", styles: { fontStyle: "bold" } },
        { content: "A-", styles: { fontStyle: "bold" } },
        { content: "B", styles: { fontStyle: "bold" } },
        { content: "C", styles: { fontStyle: "bold" } },
        { content: "D", styles: { fontStyle: "bold" } },
        { content: "F", styles: { fontStyle: "bold" } },
      ],
    ],
    styles: {
      fontSize: 6,
      cellPadding: 0.8,
      halign: "center",
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 18 } },
    theme: "grid",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradeEndY = (doc as any).lastAutoTable?.finalY ?? gradeStartY + 10;

  // Principal signature — centered below the grade key, neatly aligned.
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.3);
  const sigLineW = 50;
  const sigRightX = innerRight;
  const sigLeftX = sigRightX - sigLineW;
  // Anchor signature just above the footer so it stays visible.
  const footerY = pageH - margin - 3;
  const sigY = Math.min(gradeEndY + 30, footerY - 10);
  doc.line(sigLeftX, sigY, sigRightX, sigY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Principal", sigLeftX + sigLineW / 2, sigY + 8, { align: "center" });
  doc.setFont("helvetica", "normal");

  // Teacher signature — mirrored on the left, aligned with Principal.
  const teacherLeftX = innerLeft;
  const teacherRightX = teacherLeftX + sigLineW;
  doc.line(teacherLeftX, sigY, teacherRightX, sigY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Teacher", teacherLeftX + sigLineW / 2, sigY + 8, { align: "center" });
  doc.setFont("helvetica", "normal");

  // Place uploaded signature images just above each signature line
  const drawSig = (dataUrl: string | null, lineX1: number, lineX2: number) => {
    if (!dataUrl) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props: any = (doc as any).getImageProperties?.(dataUrl);
      const aspect = props && props.width && props.height ? props.width / props.height : 3;
      // Height = label text size (9pt ≈ 3.175mm) × 1.3
      const labelH = (9 / 72) * 25.4;
      const targetH = labelH * 1.3 * 1.7 * 1.5;
      // Box: width = signature line width (with small padding),
      // height = vertical space above the line down to the previous block.
      const maxW = lineX2 - lineX1 - 2;
      const maxH = Math.max(4, Math.min(sigY - gradeEndY - 2, 18));
      let h = Math.min(targetH, maxH);
      let w = h * aspect;
      if (w > maxW) {
        w = maxW;
        h = w / aspect;
      }
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      const cx = (lineX1 + lineX2) / 2;
      const x = cx - w / 2;
      const y = sigY - h - 0.5;
      doc.addImage(dataUrl, "PNG", x, y, w, h, undefined, "FAST");
    } catch {
      /* ignore */
    }
  };
  drawSig(principalSigDataUrl, sigLeftX, sigRightX);
  drawSig(teacherSigDataUrl, teacherLeftX, teacherRightX);

  // Overlay watermark on top of the white table rows so it remains lightly
  // visible above all content. Uses a very low opacity GState to preserve
  // row text readability.
  if (watermarkDataUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const GState = (doc as any).GState;

      const gsOverlay = GState ? new GState({ opacity: 0.28 }) : null;

      const gsReset = GState ? new GState({ opacity: 1 }) : null;
      if (gsOverlay) (doc as any).setGState(gsOverlay);
      const wmSize = 132;
      const wmX = (pageW - wmSize) / 2;
      const wmY = (pageH - wmSize) / 2;
      doc.addImage(watermarkDataUrl, "PNG", wmX, wmY, wmSize, wmSize, undefined, "FAST");
      if (gsReset) (doc as any).setGState(gsReset);
    } catch {
      /* ignore if GState unsupported */
    }
  }
}

export async function generateMarksheetsPDF(
  students: StudentRecord[],
  school: SchoolInfo,
  onProgress?: (done: number, total: number) => void,
  customLogoDataUrl?: string,
  verifyBaseUrl?: string,
  principalSigDataUrl?: string,
  teacherSigDataUrl?: string,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const logoDataUrl = customLogoDataUrl || (await loadLogoDataUrl());
  const bismillahDataUrl = await loadBismillahDataUrl();
  const watermarkDataUrl = await loadWatermarkDataUrl(customLogoDataUrl);
  for (let i = 0; i < students.length; i++) {
    if (i > 0) doc.addPage();
    const qrDataUrl = await buildVerifyQr(qrIdFor(students[i]), verifyBaseUrl);
    renderMarksheetWithAssets(
      doc,
      students[i],
      school,
      logoDataUrl,
      bismillahDataUrl,
      watermarkDataUrl,
      qrDataUrl,
      principalSigDataUrl ?? null,
      teacherSigDataUrl ?? null,
    );
    onProgress?.(i + 1, students.length);
    // Yield to UI thread every 10 students to keep mobile responsive
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return doc.output("blob");
}

export async function generateSingleMarksheetPDF(
  student: StudentRecord,
  school: SchoolInfo,
  customLogoDataUrl?: string,
  verifyBaseUrl?: string,
  principalSigDataUrl?: string,
  teacherSigDataUrl?: string,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logoDataUrl = customLogoDataUrl || (await loadLogoDataUrl());
  const bismillahDataUrl = await loadBismillahDataUrl();
  const watermarkDataUrl = await loadWatermarkDataUrl(customLogoDataUrl);
  const qrDataUrl = await buildVerifyQr(qrIdFor(student), verifyBaseUrl);
  renderMarksheetWithAssets(
    doc,
    student,
    school,
    logoDataUrl,
    bismillahDataUrl,
    watermarkDataUrl,
    qrDataUrl,
    principalSigDataUrl ?? null,
    teacherSigDataUrl ?? null,
  );
  return doc.output("blob");
}

/**
 * Build a composite unique identifier for the QR using
 * class + studentId + firstName + year — so every QR is unique per student
 * per year, even if studentId is reused or missing.
 * Format: "{className}-{studentId}-{firstName}-{year}"
 * The verify page parses this exact order.
 */
function qrIdFor(s: StudentRecord): string {
  const firstName = (s.studentName || "").trim().split(/\s+/)[0] || "";
  const className = (s.className || "").trim();
  const studentId = (s.studentId || "").trim() || (s.rollNo || "").trim();
  const year = (s.year || "").trim();
  const parts = [className, studentId, firstName, year].filter(Boolean);
  return parts.join("-") || "unknown";
}

/**
 * Generate a QR-code PNG data URL pointing at the public verification page
 * for the given student. Returns null if the student has no ID.
 */
async function buildVerifyQr(studentId: string, baseUrl?: string): Promise<string | null> {
  if (!studentId) return null;
  // Default to the published domain so QR codes printed from any environment
  // (preview, localhost, etc.) still resolve to the live verification page.
  const PUBLISHED = "https://as-sunnah-madrasah.org";
  const origin = (baseUrl || PUBLISHED).replace(/\/$/, "");
  const url = `${origin}/verify/${encodeURIComponent(studentId)}`;
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 256, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}
