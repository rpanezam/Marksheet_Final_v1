import { useState } from "react";
import * as XLSX from "xlsx";
import { Download, Mail, MessageCircle, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireDeletePassword } from "@/lib/deletePassword";
import { confirmDialog, promptDialog } from "@/lib/dialog";

const DEFAULT_CLASS_OPTIONS = [
  "Playgroup",
  "Nursery",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

type SaveMode = "local" | "email" | "whatsapp";

async function fetchClassRows(className: string) {
  const { data, error } = await supabase
    .from("marksheet_records")
    .select("*")
    .eq("class_name", className)
    .order("student_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

function buildXlsxBlob(rows: Record<string, unknown>[]): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Records");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open a mailto: link and detect whether an email app actually handled it.
 * If the page never loses focus / becomes hidden within ~1.2s, we assume
 * no email client is installed.
 */
function openMailtoOrDetectMissing(mailto: string): Promise<boolean> {
  return new Promise((resolve) => {
    let handled = false;
    const onHide = () => {
      if (document.hidden) {
        handled = true;
        cleanup();
        resolve(true);
      }
    };
    const onBlur = () => {
      handled = true;
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    try {
      window.location.href = mailto;
    } catch {
      cleanup();
      resolve(false);
      return;
    }
    setTimeout(() => {
      if (!handled) {
        cleanup();
        resolve(false);
      }
    }, 1200);
  });
}

interface ClassDataPanelProps {
  showRemove?: boolean;
  classOptions?: string[];
}

export function ClassDataPanel({ showRemove = false, classOptions }: ClassDataPanelProps = {}) {
  const options = classOptions && classOptions.length > 0 ? classOptions : DEFAULT_CLASS_OPTIONS;
  const [cls, setCls] = useState("");
  const [busy, setBusy] = useState<SaveMode | "remove" | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function handleSave(mode: SaveMode) {
    setErr("");
    setMsg("");
    if (!cls) {
      setErr("Class সিলেক্ট করুন");
      return;
    }
    setBusy(mode);
    try {
      const rows = await fetchClassRows(cls);
      if (rows.length === 0) {
        setErr("এই ক্লাসে কোনো ডেটা নেই");
        return;
      }
      const blob = buildXlsxBlob(rows as Record<string, unknown>[]);
      const filename = `class-${cls}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const file = new File([blob], filename, { type: blob.type });
      const summary = `Class ${cls}: ${rows.length} record${rows.length === 1 ? "" : "s"}`;

      if (mode === "local") {
        downloadBlob(blob, filename);
        setMsg(`✓ ডাউনলোড হয়েছে — ${rows.length} record`);
        return;
      }

      if (mode === "email") {
        const nav = navigator as Navigator & {
          canShare?: (d: { files: File[] }) => boolean;
          share?: (d: ShareData & { files?: File[] }) => Promise<void>;
        };
        // Try Web Share API with the actual xlsx file first
        const tryShare = async (f: File) => {
          if (!nav.share) return false;
          try {
            if (nav.canShare && !nav.canShare({ files: [f] })) return false;
            await nav.share({ files: [f], title: summary, text: summary });
            return true;
          } catch (shareErr) {
            if ((shareErr as Error)?.name === "AbortError") return true;
            return false;
          }
        };
        if (await tryShare(file)) {
          setMsg(`✓ Share menu খোলা হয়েছে`);
          return;
        }
        // Retry as a generic binary (some browsers reject xlsx mime in canShare)
        const genericFile = new File([blob], filename, { type: "application/octet-stream" });
        if (await tryShare(genericFile)) {
          setMsg(`✓ Share menu খোলা হয়েছে`);
          return;
        }
        // Last resort: download + open mailto (mailto cannot auto-attach files per spec)
        downloadBlob(blob, filename);
        const mailto = `mailto:?subject=${encodeURIComponent(summary)}&body=${encodeURIComponent(`${summary}\n\nফাইলটি ডাউনলোড হয়ে গেছে — email-এ manually attach করুন: ${filename}`)}`;
        const opened = await openMailtoOrDetectMissing(mailto);
        if (!opened) {
          setErr("No email setup.");
        } else {
          setMsg(`✓ ফাইল ডাউনলোড হয়েছে — email-এ ${filename} attach করুন`);
        }
        return;
      }

      if (mode === "whatsapp") {
        const nav = navigator as Navigator & {
          canShare?: (d: { files: File[] }) => boolean;
          share?: (d: ShareData & { files?: File[] }) => Promise<void>;
        };
        if (nav.canShare?.({ files: [file] }) && nav.share) {
          try {
            await nav.share({ files: [file], title: summary, text: summary });
            setMsg(`✓ WhatsApp/share menu খোলা হয়েছে`);
            return;
          } catch {
            /* fallback */
          }
        }
        // Fallback: download + open wa.me text
        downloadBlob(blob, filename);
        const phone =
          (await promptDialog({
            title: "WhatsApp number",
            message:
              "Enter WhatsApp number with country code (e.g. 8801XXXXXXXXX). Leave blank to just open the share screen.",
            placeholder: "8801XXXXXXXXX",
            confirmText: "Open WhatsApp",
          })) ?? "";
        const wa = `https://wa.me/${encodeURIComponent(phone.trim())}?text=${encodeURIComponent(`${summary}\n\nফাইলটি ডাউনলোড হয়ে গেছে — চ্যাটে attach করুন: ${filename}`)}`;
        window.open(wa, "_blank");
        setMsg(`✓ ফাইল ডাউনলোড + WhatsApp খোলা হয়েছে — file টি attach করুন`);
        return;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setErr("");
    setMsg("");
    if (!cls) {
      setErr("Class সিলেক্ট করুন");
      return;
    }
    if (
      !(await confirmDialog({
        title: `Delete all records for ${cls}?`,
        message: `Every marksheet record under class "${cls}" will be permanently deleted. This cannot be undone.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    if (!(await requireDeletePassword(`Enter password to delete all data for class "${cls}":`)))
      return;
    setBusy("remove");
    try {
      const { error, count } = await supabase
        .from("marksheet_records")
        .delete({ count: "exact" })
        .eq("class_name", cls);
      if (error) throw new Error(error.message);
      setMsg(`✓ ${count ?? 0} record delete হয়েছে`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] space-y-2.5">
      <select
        value={cls}
        onChange={(e) => {
          setCls(e.target.value);
          setMsg("");
          setErr("");
        }}
        className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${cls ? "" : "text-muted-foreground"}`}
      >
        <option value="">Class সিলেক্ট করুন</option>
        {options.map((c) => (
          <option key={c} value={c} className="text-foreground">
            {c}
          </option>
        ))}
      </select>

      {showRemove && (
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={!!busy || !cls}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-2 text-[11px] font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
        >
          {busy === "remove" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Remove Class Data
        </button>
      )}

      {msg && <p className="text-[11px] text-primary font-medium">{msg}</p>}
      {err && <p className="text-[11px] text-destructive">{err}</p>}
    </section>
  );
}
