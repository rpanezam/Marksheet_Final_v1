/**
 * certificate-generator.ts — Certificate of Achievement PDF for a single student.
 *
 * Uses the ornate template image as a full-page background and overlays the
 * dynamic fields (student name, class, date, year, result) on top, masking
 * the placeholder text in the template with paper-coloured rectangles.
 */
import jsPDF from "jspdf";
import type { SchoolInfo, StudentRecord } from "./marksheet-types";
import certificateBgUrl from "@/assets/certificate-bg.jpg";
import certificateLogoUrl from "@/assets/certificate-logo.jpg";

let cachedBg: string | null = null;
let cachedSwatch: string | null = null;
const polishedSignatureCache = new Map<string, string>();
const polishedLogoCache = new Map<string, string>();
const staticLogoCache = new Map<string, string>();

export type LogoPolishOptions = {
  /** Color distance from sampled paper above which a pixel is kept. Default 46. */
  bgThreshold?: number;
  /** Multiplier applied to the kept-pixel strength → alpha. Higher = bolder. Default 1.65. */
  featherStrength?: number;
  /** Edge fade radius in color-distance units. Default 74. */
  featherRadius?: number;
};

export const DEFAULT_LOGO_POLISH: Required<LogoPolishOptions> = {
  bgThreshold: 46,
  featherStrength: 1.65,
  featherRadius: 74,
};

async function loadBackground(): Promise<string> {
  if (cachedBg) return cachedBg;
  const res = await fetch(certificateBgUrl);
  const blob = await res.blob();
  cachedBg = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return cachedBg;
}

/**
 * Extract a clean parchment swatch from the certificate template so the
 * uploaded signature can be stamped over the printed placeholder signature
 * with perfect texture/color match (no flat-color rectangle visible).
 * Source region (850,800,200,70) on the 1448x1086 template was measured to
 * have std<2 across RGB — pure blank parchment with no print.
 */
async function loadSignatureSwatch(): Promise<string | null> {
  if (cachedSwatch) return cachedSwatch;
  try {
    const bg = await loadBackground();
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = bg;
    });
    const sx = 850,
      sy = 800,
      sw = 200,
      sh = 70;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    cachedSwatch = canvas.toDataURL("image/jpeg", 0.92);
    return cachedSwatch;
  } catch {
    return null;
  }
}

async function polishSignatureForCertificate(dataUrl: string): Promise<string> {
  const cached = polishedSignatureCache.get(dataUrl);
  if (cached) return cached;
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const maxSide = 1000;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    const bright: number[] = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 12) continue;
      bright.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    bright.sort((a, b) => a - b);
    const bgLum = bright.length ? bright[Math.floor(bright.length * 0.9)] : 245;

    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const alpha = d[idx + 3];
        if (alpha < 12) continue;
        const r = d[idx],
          g = d[idx + 1],
          b = d[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const contrast = bgLum - lum;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const isInk = contrast > 42 || (chroma > 28 && contrast > 28 && lum < 210);
        if (!isInk) {
          d[idx + 3] = 0;
          continue;
        }
        const strength = Math.max(0, Math.min(1, (contrast - 28) / 90));
        d[idx] = 18;
        d[idx + 1] = 26;
        d[idx + 2] = 62;
        d[idx + 3] = Math.round(alpha * Math.max(0.35, strength));
        if (d[idx + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    if (maxX < 0) return dataUrl;
    const pad = 8;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(w - sx, maxX - minX + pad * 2);
    const sh = Math.min(h - sy, maxY - minY + pad * 2);
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const polished = out.toDataURL("image/png");
    polishedSignatureCache.set(dataUrl, polished);
    return polished;
  } catch {
    return dataUrl;
  }
}

async function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  return { width: img.width || 1, height: img.height || 1 };
}

/**
 * Prepare the bundled school crest for the certificate: remove the white
 * paper background, soften the saturation, and warm the palette slightly so
 * the multicoloured logo sits naturally on the parchment without looking
 * like a sticker. Original hues are preserved (no flat recolour).
 */
async function prepareStaticLogoForCertificate(srcUrl: string): Promise<string> {
  const cached = staticLogoCache.get(srcUrl);
  if (cached) return cached;
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = srcUrl;
    });
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return srcUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    // Estimate background colour from the border pixels (logo sits on white).
    let sr = 0,
      sg = 0,
      sb = 0,
      n = 0;
    const sample = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 12) return;
      sr += d[i];
      sg += d[i + 1];
      sb += d[i + 2];
      n++;
    };
    const sx = Math.max(1, Math.floor(w / 48));
    const sy = Math.max(1, Math.floor(h / 48));
    for (let x = 0; x < w; x += sx) {
      sample(x, 0);
      sample(x, h - 1);
    }
    for (let y = 0; y < h; y += sy) {
      sample(0, y);
      sample(w - 1, y);
    }
    if (!n) return srcUrl;
    const br = sr / n,
      bg = sg / n,
      bb = sb / n;
    const bgLum = 0.299 * br + 0.587 * bg + 0.114 * bb;
    if (bgLum < 200) {
      staticLogoCache.set(srcUrl, srcUrl);
      return srcUrl;
    }

    // Parchment tint (matches the certificate paper) for warmth blending.
    const paperR = 248,
      paperG = 244,
      paperB = 228;
    // Tunables: edge feather + how strongly we tint toward parchment.
    const removeBelow = 38; // dist <= this → fully transparent
    const featherTo = 78; // dist >= this → fully opaque
    const tintAmount = 0.1; // 10% pull toward parchment for warmth
    const desaturate = 0.08; // 8% desaturation toward luminance

    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a0 = d[i + 3];
        if (a0 < 8) {
          d[i + 3] = 0;
          continue;
        }
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        const dist = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
        if (dist <= removeBelow) {
          d[i + 3] = 0;
          continue;
        }

        // Smooth feather between removeBelow → featherTo.
        let alphaMul = 1;
        if (dist < featherTo) {
          const t = (dist - removeBelow) / (featherTo - removeBelow);
          alphaMul = t * t * (3 - 2 * t);
        }

        // Desaturate slightly + warm-tint toward parchment.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const dr = r + (lum - r) * desaturate;
        const dg = g + (lum - g) * desaturate;
        const db = b + (lum - b) * desaturate;
        d[i] = Math.round(dr + (paperR - dr) * tintAmount);
        d[i + 1] = Math.round(dg + (paperG - dg) * tintAmount);
        d[i + 2] = Math.round(db + (paperB - db) * tintAmount);
        d[i + 3] = Math.round(a0 * alphaMul);

        if (d[i + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    if (maxX < 0) return srcUrl;
    const pad = 8;
    const cx = Math.max(0, minX - pad);
    const cy = Math.max(0, minY - pad);
    const cw = Math.min(w - cx, maxX - minX + pad * 2);
    const ch = Math.min(h - cy, maxY - minY + pad * 2);
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    const result = out.toDataURL("image/png");
    staticLogoCache.set(srcUrl, result);
    return result;
  } catch {
    return srcUrl;
  }
}

/**
 * Remove paper/white background from an uploaded logo so it blends with the
 * parchment certificate. The remaining logo artwork is recoloured to the
 * certificate emerald ink and transparent whitespace is cropped away.
 */
async function polishLogoForCertificate(
  dataUrl: string,
  opts: LogoPolishOptions = {},
): Promise<string> {
  const bgThreshold = Math.max(0, opts.bgThreshold ?? DEFAULT_LOGO_POLISH.bgThreshold);
  const featherStrength = Math.max(
    0.1,
    opts.featherStrength ?? DEFAULT_LOGO_POLISH.featherStrength,
  );
  const featherRadius = Math.max(1, opts.featherRadius ?? DEFAULT_LOGO_POLISH.featherRadius);
  const cacheKey = `${dataUrl}|${bgThreshold.toFixed(2)}|${featherStrength.toFixed(2)}|${featherRadius.toFixed(2)}`;
  const cached = polishedLogoCache.get(cacheKey);
  if (cached) return cached;
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    // Sample the outside border to estimate the logo's paper/white background.
    let sr = 0,
      sg = 0,
      sb = 0,
      n = 0;
    const sample = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 12) return;
      sr += d[i];
      sg += d[i + 1];
      sb += d[i + 2];
      n++;
    };
    const stepX = Math.max(1, Math.floor(w / 36));
    const stepY = Math.max(1, Math.floor(h / 36));
    for (let x = 0; x < w; x += stepX) {
      sample(x, 0);
      sample(x, h - 1);
    }
    for (let y = 0; y < h; y += stepY) {
      sample(0, y);
      sample(w - 1, y);
    }
    if (!n) return dataUrl;
    const br = sr / n,
      bg = sg / n,
      bb = sb / n;
    const bgLum = 0.299 * br + 0.587 * bg + 0.114 * bb;
    // Only treat as a removable background if corners are bright (paper/white).
    if (bgLum < 200) {
      polishedLogoCache.set(dataUrl, dataUrl);
      return dataUrl;
    }

    // Certificate emerald ink — match the headline/body color used elsewhere
    // in this generator so the logo reads as part of the printed template.
    const inkR = 15,
      inkG = 86,
      inkB = 50;
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 12) {
          d[i + 3] = 0;
          continue;
        }
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        const dist = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const darkness = Math.max(0, (bgLum - lum - 16) / 120);
        const saturation = Math.max(0, (chroma - 18) / 95);
        const separation = Math.max(0, (dist - bgThreshold) / Math.max(1, featherRadius * 1.25));
        const strength = Math.max(darkness, saturation, separation);
        const paperBand = bgThreshold + featherRadius * 0.8;
        const likelyPaper = lum > 188 && chroma < 38 && dist < paperBand;
        if (dist < bgThreshold || strength < 0.08 || likelyPaper) {
          d[i + 3] = 0;
          continue;
        }
        // Recolor every visible pixel to certificate ink; never keep a minimum
        // alpha for pale pixels, otherwise the removed paper appears as a haze.
        let alpha = Math.round(d[i + 3] * Math.min(1, strength * featherStrength));
        const featherEnd = bgThreshold + featherRadius;
        if (dist < featherEnd) {
          const t = Math.max(0, Math.min(1, (dist - bgThreshold) / featherRadius));
          alpha = Math.round(alpha * (t * t * (3 - 2 * t)));
        }
        d[i] = inkR;
        d[i + 1] = inkG;
        d[i + 2] = inkB;
        d[i + 3] = alpha;
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    if (maxX < 0) return dataUrl;
    const pad = 10;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(w - sx, maxX - minX + pad * 2);
    const sh = Math.min(h - sy, maxY - minY + pad * 2);
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const polished = out.toDataURL("image/png");
    polishedLogoCache.set(cacheKey, polished);
    return polished;
  } catch {
    return dataUrl;
  }
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fitTextToWidth(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
): { text: string; size: number } {
  let size = startSize;
  while (size > minSize) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= maxWidth) return { text, size };
    size -= 0.2;
  }

  doc.setFontSize(minSize);
  if (doc.getTextWidth(text) <= maxWidth) return { text, size: minSize };

  const ellipsis = "…";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}${ellipsis}`;
    if (doc.getTextWidth(candidate) <= maxWidth) low = mid;
    else high = mid - 1;
  }

  return { text: `${text.slice(0, low).trimEnd()}${ellipsis}`, size: minSize };
}

export async function generateCertificatePDF(
  student: StudentRecord,
  school: SchoolInfo,
  _logoDataUrl?: string,
  _principalSigDataUrl?: string,
  _logoPolish?: LogoPolishOptions,
): Promise<Blob> {
  // Page format chosen to match the background image's native aspect ratio
  // (1070×800 → 297mm × 222.06mm) so nothing distorts.
  const pageW = 297;
  const pageH = 222.06;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [pageW, pageH] });

  const bg = await loadBackground();
  // "NONE" → jsPDF embeds the original JPEG bytes without recompression,
  // preserving full template detail for print.
  doc.addImage(bg, "JPEG", 0, 0, pageW, pageH, undefined, "NONE");

  // px-to-mm helper based on background image
  const mm = (px: number) => (px * pageW) / 1070;

  // Paper colour to mask template placeholder text underneath the dynamic
  // overlays. Sampled directly from the background near the signature/logo
  // areas so the masks blend cleanly with the parchment.
  const paper: [number, number, number] = [248, 248, 246];
  const drawMask = (x: number, y: number, w: number, h: number) => {
    doc.setFillColor(paper[0], paper[1], paper[2]);
    doc.rect(x, y, w, h, "F");
  };

  const centerX = pageW / 2;
  const ink: [number, number, number] = [15, 86, 50]; // deep emerald, matches template

  // ---- Student name (replaces "Student Name Here") ----
  drawMask(mm(220), mm(258), mm(630), mm(58));
  doc.setFont("helvetica", "bold");
  doc.setTextColor(ink[0], ink[1], ink[2]);
  const nameMaxWidth = mm(600);
  const studentName = (student.studentName || "").trim() || "—";
  const fittedName = fitTextToWidth(doc, studentName, nameMaxWidth, 26, 3);
  doc.setFontSize(fittedName.size);
  doc.text(fittedName.text, centerX, mm(287), {
    align: "center",
    baseline: "middle",
    maxWidth: nameMaxWidth,
  });

  // ---- Class name (replaces "CLASS NAME HERE") ----
  drawMask(mm(280), mm(345), mm(560), mm(48));
  const classText = (student.className || "").toUpperCase();
  let classSize = 24;
  const classMaxWidth = mm(540);
  while (classSize > 12) {
    doc.setFontSize(classSize);
    if (doc.getTextWidth(classText) <= classMaxWidth) break;
    classSize -= 0.5;
  }
  doc.setFontSize(classSize);
  doc.text(classText, centerX, mm(370), { align: "center", baseline: "middle" });
  // NOTE: template-এ school name আগে থেকেই printed আছে — duplicate overlay বাদ।

  // ---- Date / Year values (drawn next to template labels) ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  const today = formatDate(new Date());
  doc.text(today, mm(180), mm(693), { baseline: "middle" });
  doc.text(student.year || String(new Date().getFullYear()), mm(180), mm(733), {
    baseline: "middle",
  });

  // NOTE: নতুন certificate template-এ school crest ও principal signature
  // আগে থেকেই বিল্ট-ইন আছে। তাই static logo overlay ও uploaded signature
  // stamping logic ইচ্ছাকৃতভাবে বাদ দেওয়া হয়েছে — শুধু dynamic field
  // (নাম / ক্লাস / স্কুল / তারিখ / বছর) overlay হবে।

  return doc.output("blob");
}
