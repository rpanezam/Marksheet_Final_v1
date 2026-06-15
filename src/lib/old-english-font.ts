/**
 * old-english-font.ts — Registers the embedded Old English (UnifrakturMaguntia)
 * TTF with a jsPDF document. Call once per jsPDF instance before using.
 */
import type jsPDF from "jspdf";
import { OLD_ENGLISH_TTF_BASE64 } from "./old-english-font-data";

export const OLD_ENGLISH_FONT_NAME = "OldEnglish";
const FILE_NAME = "OldEnglish.ttf";
const registered = new WeakSet<jsPDF>();

export function ensureOldEnglishFont(doc: jsPDF) {
  if (registered.has(doc)) return;
  doc.addFileToVFS(FILE_NAME, OLD_ENGLISH_TTF_BASE64);
  doc.addFont(FILE_NAME, OLD_ENGLISH_FONT_NAME, "normal");
  doc.addFont(FILE_NAME, OLD_ENGLISH_FONT_NAME, "bold");
  registered.add(doc);
}
