/**
 * share-pdf.ts — PDF ডেলিভারি হেল্পার।
 * তিনটি অপশন: Share (system share sheet), Email, Local।
 */
import { alertDialog } from "@/lib/dialog";

export type DeliverChoice = "local" | "share" | "email" | "view";

function localDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function nativeShare(blob: Blob, filename: string, opts?: { title?: string; text?: string }): Promise<boolean> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: opts?.title ?? filename, text: opts?.text ?? filename });
      return true;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return true;
      return false;
    }
  }
  return false;
}

async function shareGeneric(blob: Blob, filename: string) {
  const ok = await nativeShare(blob, filename);
  if (ok) return;
  // Fallback: just download
  localDownload(blob, filename);
}

function openMailtoOrDetectMissing(mailto: string): Promise<boolean> {
  return new Promise((resolve) => {
    let handled = false;
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
    };
    const onHide = () => { if (document.hidden) { handled = true; cleanup(); resolve(true); } };
    const onBlur = () => { handled = true; cleanup(); resolve(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    try { window.location.href = mailto; } catch { cleanup(); resolve(false); return; }
    setTimeout(() => { if (!handled) { cleanup(); resolve(false); } }, 1200);
  });
}

async function shareToEmail(blob: Blob, filename: string) {
  // Try Web Share with file — on mobile, picking Gmail/Email auto-attaches the file.
  const ok = await nativeShare(blob, filename, { title: filename, text: filename });
  if (ok) return;
  // Fallback: download file + open mailto. mailto cannot auto-attach (browser security),
  // so the file is downloaded for manual attach. If no email app handles mailto → alert.
  localDownload(blob, filename);
  const mailto = `mailto:?subject=${encodeURIComponent(filename)}&body=${encodeURIComponent(`${filename}\n\nফাইলটি ডাউনলোড হয়ে গেছে — email-এ attach করুন।`)}`;
  const opened = await openMailtoOrDetectMissing(mailto);
  if (!opened) {
    await alertDialog({
      title: "No email app found",
      message: "We couldn't find a default email app on this device. The file has been downloaded — please attach it manually.",
    });
  }
}

function pickChoice(includeView = false, includeEmail = true): Promise<DeliverChoice | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(6px);";

    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue("--card").trim() || cs.getPropertyValue("--background").trim() || "#ffffff";
    const fg = cs.getPropertyValue("--card-foreground").trim() || cs.getPropertyValue("--foreground").trim() || "#0f172a";
    const border = cs.getPropertyValue("--border").trim() || "#e5e7eb";
    const muted = cs.getPropertyValue("--muted").trim() || "#f1f5f9";
    const wrapColor = (v: string) => (v.includes("(") || v.startsWith("#") ? v : `hsl(${v})`);
    const BG = wrapColor(bg);
    const FG = wrapColor(fg);
    const BORDER = wrapColor(border);
    const MUTED = wrapColor(muted);

    const modal = document.createElement("div");
    modal.style.cssText = `background:${BG};border:1px solid ${BORDER};border-radius:16px;padding:20px;width:min(360px,90vw);box-shadow:0 20px 50px rgba(0,0,0,0.25);font-family:system-ui,sans-serif;color:${FG};`;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;";
    const title = document.createElement("h3");
    title.textContent = "PDF কোথায় সেভ করবেন?";
    title.style.cssText = "margin:0;font-size:16px;font-weight:600;text-align:center;flex:1;";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = `background:transparent;border:0;color:${FG};opacity:0.6;font-size:18px;cursor:pointer;padding:0 4px;`;
    header.appendChild(title);
    header.appendChild(close);

    const cols = (includeView ? 1 : 0) + 1 + (includeEmail ? 1 : 0) + 1;
    const grid = document.createElement("div");
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;`;

    let onPop: () => void = () => {};

    const SHARE_ICON = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="hsl(217 91% 50%)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>`;
    const EMAIL_ICON = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="hsl(0 75% 55%)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`;
    const DOWN_ICON = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="hsl(262 83% 58%)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M6 12l6 6 6-6"/><path d="M5 21h14"/></svg>`;
    const VIEW_ICON = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="hsl(150 70% 38%)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

    const makeBtn = (label: string, iconHtml: string, choice: DeliverChoice) => {
      const btn = document.createElement("button");
      btn.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 6px;background:${MUTED};border:1px solid ${BORDER};border-radius:12px;color:${FG};cursor:pointer;font-size:12px;font-weight:600;transition:transform 0.1s;`;
      btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:#fff;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,0.08);">${iconHtml}</div><div>${label}</div>`;
      btn.onclick = () => {
        document.body.removeChild(overlay);
        window.removeEventListener("popstate", onPop);
        if (window.history.state && (window.history.state as { __pdfModal?: boolean }).__pdfModal) {
          window.history.back();
        }
        resolve(choice);
      };
      return btn;
    };

    if (includeView) grid.appendChild(makeBtn("View", VIEW_ICON, "view"));
    grid.appendChild(makeBtn("Share", SHARE_ICON, "share"));
    if (includeEmail) grid.appendChild(makeBtn("Email", EMAIL_ICON, "email"));
    grid.appendChild(makeBtn("Local", DOWN_ICON, "local"));

    modal.appendChild(header);
    modal.appendChild(grid);
    overlay.appendChild(modal);

    const cancel = () => {
      if (overlay.parentNode) document.body.removeChild(overlay);
      window.removeEventListener("popstate", onPop);
      resolve(null);
    };
    onPop = () => cancel();
    try { window.history.pushState({ __pdfModal: true }, ""); } catch { /* ignore */ }
    window.addEventListener("popstate", onPop);

    const closeAndPop = () => {
      if (window.history.state && (window.history.state as { __pdfModal?: boolean }).__pdfModal) {
        window.history.back();
      } else {
        cancel();
      }
    };
    close.onclick = closeAndPop;
    overlay.onclick = (e) => { if (e.target === overlay) closeAndPop(); };

    document.body.appendChild(overlay);
  });
}

export async function deliverPdf(blob: Blob, filename: string): Promise<void> {
  const choice = await pickChoice();
  if (!choice) return;
  if (choice === "share") await shareGeneric(blob, filename);
  else if (choice === "email") await shareToEmail(blob, filename);
  else localDownload(blob, filename);
}

export async function deliverPdfWithView(blob: Blob, filename: string): Promise<void> {
  const choice = await pickChoice(true);
  if (!choice) return;
  if (choice === "view") {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else if (choice === "share") await shareGeneric(blob, filename);
  else if (choice === "email") await shareToEmail(blob, filename);
  else localDownload(blob, filename);
}

/** View / Share / Local — 3-option variant (no Email). */
export async function deliverPdfThree(blob: Blob, filename: string): Promise<void> {
  const choice = await pickChoice(true, false);
  if (!choice) return;
  if (choice === "view") {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else if (choice === "share") await shareGeneric(blob, filename);
  else localDownload(blob, filename);
}

// =====================================================================
// Generic file delivery: WhatsApp / Email / Local (used for History etc.)
// =====================================================================
export type DeliverFileChoice = "whatsapp" | "email" | "local";

async function nativeShareFile(file: File, opts?: { title?: string; text?: string }): Promise<boolean> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: opts?.title ?? file.name, text: opts?.text ?? file.name });
      return true;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return true;
      return false;
    }
  }
  return false;
}

async function shareToWhatsApp(blob: Blob, filename: string, mime: string) {
  const file = new File([blob], filename, { type: mime });
  // On mobile, share sheet lets user pick WhatsApp and the file is attached automatically.
  const ok = await nativeShareFile(file, { title: filename, text: filename });
  if (ok) return;
  // Fallback: download file + open WhatsApp with prefilled text (file must be attached manually).
  localDownload(blob, filename);
  const text = encodeURIComponent(`${filename}\n\nফাইলটি ডাউনলোড হয়েছে — WhatsApp-এ attach করুন।`);
  try { window.open(`https://wa.me/?text=${text}`, "_blank"); } catch { /* ignore */ }
}

async function shareFileToEmail(blob: Blob, filename: string, mime: string) {
  const file = new File([blob], filename, { type: mime });
  const ok = await nativeShareFile(file, { title: filename, text: filename });
  if (ok) return;
  localDownload(blob, filename);
  const mailto = `mailto:?subject=${encodeURIComponent(filename)}&body=${encodeURIComponent(`${filename}\n\nফাইলটি ডাউনলোড হয়ে গেছে — email-এ attach করুন।`)}`;
  const opened = await openMailtoOrDetectMissing(mailto);
  if (!opened) {
    await alertDialog({
      title: "No email app found",
      message: "We couldn't find a default email app on this device. The file has been downloaded — please attach it manually.",
    });
  }
}

function pickFileChoice(): Promise<DeliverFileChoice | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(6px);";

    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue("--card").trim() || cs.getPropertyValue("--background").trim() || "#ffffff";
    const fg = cs.getPropertyValue("--card-foreground").trim() || cs.getPropertyValue("--foreground").trim() || "#0f172a";
    const border = cs.getPropertyValue("--border").trim() || "#e5e7eb";
    const muted = cs.getPropertyValue("--muted").trim() || "#f1f5f9";
    const wrapColor = (v: string) => (v.includes("(") || v.startsWith("#") ? v : `hsl(${v})`);
    const BG = wrapColor(bg);
    const FG = wrapColor(fg);
    const BORDER = wrapColor(border);
    const MUTED = wrapColor(muted);

    const modal = document.createElement("div");
    modal.style.cssText = `background:${BG};border:1px solid ${BORDER};border-radius:16px;padding:20px;width:min(360px,90vw);box-shadow:0 20px 50px rgba(0,0,0,0.25);font-family:system-ui,sans-serif;color:${FG};`;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;";
    const title = document.createElement("h3");
    title.textContent = "ফাইল কোথায় পাঠাবেন?";
    title.style.cssText = "margin:0;font-size:16px;font-weight:600;text-align:center;flex:1;";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = `background:transparent;border:0;color:${FG};opacity:0.6;font-size:18px;cursor:pointer;padding:0 4px;`;
    header.appendChild(title);
    header.appendChild(close);

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:10px;";

    const WA_ICON = `<svg viewBox="0 0 24 24" width="32" height="32" fill="hsl(142 70% 45%)"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.92.5 3.79 1.45 5.43L2 22l4.78-1.55c1.58.86 3.36 1.31 5.26 1.31 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.01A9.83 9.83 0 0 0 12.04 2zm0 18.06c-1.7 0-3.36-.46-4.81-1.32l-.34-.2-2.84.92.93-2.77-.22-.36a8.17 8.17 0 0 1-1.27-4.42c0-4.51 3.67-8.18 8.18-8.18 2.18 0 4.23.85 5.78 2.4a8.13 8.13 0 0 1 2.39 5.78c0 4.51-3.67 8.17-8.17 8.17zm4.49-6.13c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.04-.38-1.99-1.22-.74-.66-1.23-1.47-1.37-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42-.14-.01-.31-.01-.47-.01-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.54.12.16 1.74 2.66 4.21 3.73 1.47.63 2.04.69 2.78.58.45-.07 1.46-.6 1.66-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg>`;
    const EMAIL_ICON = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="hsl(0 75% 55%)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`;
    const DOWN_ICON = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="hsl(262 83% 58%)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M6 12l6 6 6-6"/><path d="M5 21h14"/></svg>`;

    const makeBtn = (label: string, iconHtml: string, choice: DeliverFileChoice) => {
      const btn = document.createElement("button");
      btn.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 6px;background:${MUTED};border:1px solid ${BORDER};border-radius:12px;color:${FG};cursor:pointer;font-size:12px;font-weight:600;transition:transform 0.1s;`;
      btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:#fff;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,0.08);">${iconHtml}</div><div>${label}</div>`;
      btn.onclick = () => {
        if (overlay.parentNode) document.body.removeChild(overlay);
        resolve(choice);
      };
      return btn;
    };

    grid.appendChild(makeBtn("WhatsApp", WA_ICON, "whatsapp"));
    grid.appendChild(makeBtn("Email", EMAIL_ICON, "email"));
    grid.appendChild(makeBtn("Local", DOWN_ICON, "local"));

    modal.appendChild(header);
    modal.appendChild(grid);
    overlay.appendChild(modal);

    const cancel = () => {
      if (overlay.parentNode) document.body.removeChild(overlay);
      resolve(null);
    };
    close.onclick = cancel;
    overlay.onclick = (e) => { if (e.target === overlay) cancel(); };

    document.body.appendChild(overlay);
  });
}

export async function deliverFile(blob: Blob, filename: string, mime: string): Promise<void> {
  const choice = await pickFileChoice();
  if (!choice) return;
  if (choice === "whatsapp") await shareToWhatsApp(blob, filename, mime);
  else if (choice === "email") await shareFileToEmail(blob, filename, mime);
  else localDownload(blob, filename);
}
