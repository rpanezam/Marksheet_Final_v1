import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Trash2,
  Plus,
  X,
  Loader2,
  Pencil,
  Eraser,
  ChevronDown,
  Eye,
  EyeOff,
  LogOut,
  Shield,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import { requireDeletePassword } from "@/lib/deletePassword";
import { confirmDialog } from "@/lib/dialog";
import { ClassDataPanel } from "@/components/ClassDataPanel";
import { processLogoBlob } from "@/lib/pdf-generator";
import { processSignatureBlob } from "@/lib/pdf-generator";
import { useRealtimeTables } from "@/lib/useRealtimeTables";
import { APP_SETTINGS_KEYS, ALL_CLASSES } from "@/lib/constants";

type SchoolFont = "times" | "helvetica" | "courier" | "blackletter";
const FONT_OPTIONS: { value: SchoolFont; label: string }[] = [
  { value: "times", label: "Times Roman (Serif)" },
  { value: "helvetica", label: "Helvetica (Sans-serif)" },
  { value: "courier", label: "Courier (Mono)" },
  { value: "blackletter", label: "Old English Text MT" },
];

const TRANSCRIPT_SIZE_OPTIONS = [8, 9, 9.9, 11, 12, 13, 14, 16];

const TERM_OPTIONS = ["First Term", "Second Term", "Third Term"];

function YearTermPanel() {
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => String(currentYear - 5 + i));
  const [year, setYear] = useState<string>(String(currentYear));
  const [term, setTerm] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTINGS_KEYS.GLOBAL_YEAR_TERM)
        .maybeSingle();
      const v = (data?.value ?? {}) as { year?: string; term?: string };
      if (v.year) setYear(v.year);
      if (v.term) setTerm(v.term);
      setLoading(false);
    })();
  }, []);

  async function handleSave(yr: string = year, tVal: string = term) {
    setMsg("");
    if (!tVal) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("app_settings").upsert(
        {
          key: APP_SETTINGS_KEYS.GLOBAL_YEAR_TERM,
          value: { year: yr, term: tVal },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw new Error(error.message);
      setMsg("✓ Saved globally — সকল ক্লাসের জন্য আপডেট হয়েছে");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-center text-[10px] font-medium text-muted-foreground">
            Year
          </label>
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              void handleSave(e.target.value, term);
            }}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-center text-[10px] font-medium text-muted-foreground">
            Term
          </label>
          <select
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              void handleSave(year, e.target.value);
            }}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="">Select term</option>
            {TERM_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(msg || saving) && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] font-medium text-primary">{saving ? "Saving…" : msg}</span>
        </div>
      )}
    </div>
  );
}

function SchoolInfoPanel() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [font, setFont] = useState<SchoolFont>("times");
  const [transcriptFont, setTranscriptFont] = useState<SchoolFont>("helvetica");
  const [transcriptFontSize, setTranscriptFontSize] = useState<number>(9.9);
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTINGS_KEYS.SCHOOL)
        .maybeSingle();
      const v = (data?.value ?? {}) as {
        name?: string;
        address?: string;
        font?: string;
        transcriptFont?: string;
        transcriptFontSize?: number;
        logoDataUrl?: string;
      };
      setName(v.name ?? "");
      setAddress(v.address ?? "");
      if (
        v.font === "times" ||
        v.font === "helvetica" ||
        v.font === "courier" ||
        v.font === "blackletter"
      )
        setFont(v.font);
      if (
        v.transcriptFont === "times" ||
        v.transcriptFont === "helvetica" ||
        v.transcriptFont === "courier" ||
        v.transcriptFont === "blackletter"
      )
        setTranscriptFont(v.transcriptFont);
      if (typeof v.transcriptFontSize === "number") setTranscriptFontSize(v.transcriptFontSize);
      if (typeof v.logoDataUrl === "string") setLogoDataUrl(v.logoDataUrl);
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    setMsg("");
    setSaving(true);
    try {
      const { error } = await supabase.from("app_settings").upsert(
        {
          key: "school",
          value: {
            name: name.trim(),
            address: address.trim(),
            font,
            transcriptFont,
            transcriptFontSize,
            logoDataUrl: logoDataUrl || undefined,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw new Error(error.message);
      setMsg("✓ Saved globally — সকল টিচারের জন্য আপডেট হয়েছে");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-2.5">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground">School name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground">School address</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground">School name font</label>
        <select
          value={font}
          onChange={(e) => setFont(e.target.value as SchoolFont)}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        >
          {FONT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">
            Academic Transcript font
          </label>
          <select
            value={transcriptFont}
            onChange={(e) => setTranscriptFont(e.target.value as SchoolFont)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Font size</label>
          <select
            value={transcriptFontSize}
            onChange={(e) => setTranscriptFontSize(parseFloat(e.target.value))}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            {TRANSCRIPT_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} pt{s === 9.9 ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-center pt-1">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save globally
        </button>
      </div>
      {msg && <p className="text-[11px] text-primary font-medium">{msg}</p>}
    </div>
  );
}

// ALL_CLASSES imported from @/lib/constants — একটাই source of truth
const CLASS_OPTIONS = ALL_CLASSES as unknown as string[];

/**
 * Student Data Restore — Admin আপলোড করা Excel (ClassDataPanel থেকে
 * ডাউনলোডকৃত) থেকে marksheet_records টেবিলে ডেটা পুনরুদ্ধার করে।
 * একই id থাকলে upsert হয়, না থাকলে নতুন row তৈরি হয়।
 */
function StudentDataRestorePanel() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const ALLOWED = new Set([
    "id",
    "student_name",
    "father_name",
    "mother_name",
    "student_id",
    "class_name",
    "roll_no",
    "exam",
    "year_session",
    "subject",
    "full_marks",
    "highest_score",
    "obtained_marks",
    "letter_grade",
    "gp",
    "gpa",
    "section_position",
    "working_days",
    "total_present",
    "moral_behavior",
    "co_curricular",
    "comments",
    // NOTE: "uploaded_by" intentionally excluded — always set server-side
  ]);
  const NUMERIC = new Set(["full_marks", "highest_score", "obtained_marks", "gp", "gpa"]);

  // Map common human-readable / variant headers → DB column names
  const HEADER_ALIAS: Record<string, string> = {
    "student name": "student_name",
    studentname: "student_name",
    name: "student_name",
    "father's name": "father_name",
    "fathers name": "father_name",
    "father name": "father_name",
    fathername: "father_name",
    "mother's name": "mother_name",
    "mothers name": "mother_name",
    "mother name": "mother_name",
    mothername: "mother_name",
    "student id": "student_id",
    studentid: "student_id",
    "id no": "student_id",
    class: "class_name",
    "class name": "class_name",
    classname: "class_name",
    roll: "roll_no",
    "roll no": "roll_no",
    rollno: "roll_no",
    exam: "exam",
    term: "exam",
    year: "year_session",
    session: "year_session",
    "year session": "year_session",
    "year/session": "year_session",
    subject: "subject",
    "full marks": "full_marks",
    fullmarks: "full_marks",
    full: "full_marks",
    highest: "highest_score",
    "highest score": "highest_score",
    obtained: "obtained_marks",
    "obtained marks": "obtained_marks",
    obt: "obtained_marks",
    marks: "obtained_marks",
    grade: "letter_grade",
    "letter grade": "letter_grade",
    gp: "gp",
    gpa: "gpa",
    "section position": "section_position",
    position: "section_position",
    "working days": "working_days",
    "total present": "total_present",
    present: "total_present",
    moral: "moral_behavior",
    "moral behavior": "moral_behavior",
    "co curricular": "co_curricular",
    "co-curricular": "co_curricular",
    cc: "co_curricular",
    comments: "comments",
    comment: "comments",
  };
  function normHeader(k: string): string {
    const key = String(k || "").trim();
    if (!key) return "";
    if (ALLOWED.has(key)) return key;
    const low = key.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (HEADER_ALIAS[low]) return HEADER_ALIAS[low];
    const snake = low.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (ALLOWED.has(snake)) return snake;
    return "";
  }
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function handleFile(file: File) {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!raw.length) {
        setErr("File-এ কোনো row পাওয়া যায়নি");
        return;
      }

      const rows = raw
        .map((r) => {
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(r)) {
            const col = normHeader(k);
            if (!col) continue;
            const v = r[k];
            if (v === "" || v === null || v === undefined) continue;
            if (col === "id") {
              const s = String(v).trim();
              if (UUID_RE.test(s)) out[col] = s;
              continue;
            }
            if (col === "uploaded_by") {
              const s = String(v).trim();
              if (UUID_RE.test(s)) out[col] = s;
              continue;
            }
            if (NUMERIC.has(col)) {
              const n = Number(v);
              if (!isNaN(n)) out[col] = n;
            } else {
              out[col] = String(v);
            }
          }
          return out;
        })
        .filter((r) => r.student_name && r.subject);

      if (!rows.length) {
        setErr("সঠিক format-এর row পাওয়া যায়নি (student_name + subject লাগবে)");
        return;
      }
      const MAX_ROWS = 10_000;
      if (rows.length > MAX_ROWS) {
        setErr(`File এ ${rows.length} rows আছে — সর্বোচ্চ ${MAX_ROWS} rows restore করা যাবে।`);
        return;
      }

      // Split rows: those with valid id → upsert; others → insert
      const withId = rows.filter((r) => r.id);
      const withoutId = rows.filter((r) => !r.id);
      let inserted = 0;
      const chunkSize = 500;
      for (let i = 0; i < withId.length; i += chunkSize) {
        const chunk = withId.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("marksheet_records")
          .upsert(chunk as never, { onConflict: "id" });
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }
      for (let i = 0; i < withoutId.length; i += chunkSize) {
        const chunk = withoutId.slice(i, i + chunkSize);
        const { error } = await supabase.from("marksheet_records").insert(chunk as never);
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }
      setMsg(`✓ Restore সম্পন্ন — ${inserted} record`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Class Data থেকে ডাউনলোড করা Excel ফাইল আপলোড করলে সব student data ফেরত আসবে।
      </p>
      <label className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-[11px] font-semibold cursor-pointer hover:bg-secondary/40 disabled:opacity-40">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {busy ? "Restoring…" : "Upload Excel to Restore"}
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            await handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {msg && <p className="text-[11px] text-primary font-medium">{msg}</p>}
      {err && <p className="text-[11px] text-destructive">{err}</p>}
    </div>
  );
}

function SignaturesPanel() {
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [principalSigDataUrl, setPrincipalSigDataUrl] = useState<string>("");
  const [teacherSigDataUrl, setTeacherSigDataUrl] = useState<string>("");
  const [busy, setBusy] = useState<"none" | "logo" | "principal" | "teacher">("none");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [other, setOther] = useState<Record<string, unknown>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTINGS_KEYS.SCHOOL)
        .maybeSingle();
      const v = (data?.value ?? {}) as Record<string, unknown>;
      setOther(v);
      if (typeof v.logoDataUrl === "string") setLogoDataUrl(v.logoDataUrl);
      if (typeof v.principalSigDataUrl === "string") setPrincipalSigDataUrl(v.principalSigDataUrl);
      if (typeof v.teacherSigDataUrl === "string") setTeacherSigDataUrl(v.teacherSigDataUrl);
      setLoading(false);
    })();
  }, []);

  async function persist(next: {
    logoDataUrl?: string;
    principalSigDataUrl?: string;
    teacherSigDataUrl?: string;
  }) {
    setMsg("");
    setSaving(true);
    try {
      const merged = {
        ...other,
        logoDataUrl: (next.logoDataUrl ?? logoDataUrl) || undefined,
        principalSigDataUrl: (next.principalSigDataUrl ?? principalSigDataUrl) || undefined,
        teacherSigDataUrl: (next.teacherSigDataUrl ?? teacherSigDataUrl) || undefined,
      };
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key: "school", value: merged, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw new Error(error.message);
      setOther(merged);
      setMsg("✓ Saved globally — সকল ডিভাইসে আপডেট হয়েছে");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg("⚠ Save failed: " + m);
      try {
        alert("Signature/Logo সেভ হয়নি:\n" + m);
      } catch {
        /* ignore */
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await persist({});
  }

  async function processFile(f: File, kind: "logo" | "principal" | "teacher") {
    setBusy(kind);
    try {
      const url = kind === "logo" ? await processLogoBlob(f) : await processSignatureBlob(f);
      if (kind === "logo") setLogoDataUrl(url);
      else if (kind === "principal") setPrincipalSigDataUrl(url);
      else setTeacherSigDataUrl(url);
      // Auto-save immediately so signatures show up on the marksheet
      // without requiring the user to remember to click "Save globally".
      await persist(
        kind === "logo"
          ? { logoDataUrl: url }
          : kind === "principal"
            ? { principalSigDataUrl: url }
            : { teacherSigDataUrl: url },
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("none");
    }
  }

  function Slot({
    label,
    value,
    kind,
    onClear,
    accept,
  }: {
    label: string;
    value: string;
    kind: "logo" | "principal" | "teacher";
    onClear: () => void;
    accept: string;
  }) {
    return (
      <div className="flex flex-col items-center">
        <label className="text-[11px] font-semibold tracking-wide text-foreground/80 text-center mb-1.5">
          {label}
        </label>
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-20 rounded-lg border border-input bg-background flex items-center justify-center overflow-hidden">
            {value ? (
              <img src={value} alt={label} className="h-full w-full object-contain" />
            ) : (
              <span className="text-[9px] text-muted-foreground">None</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-[11px] font-semibold cursor-pointer hover:bg-secondary/40">
              {busy === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {value ? "Change" : "Upload"}
              <input
                type="file"
                accept={accept}
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await processFile(f, kind);
                  e.target.value = "";
                }}
              />
            </label>
            {value && (
              <button
                type="button"
                onClick={async () => {
                  if (
                    await requireDeletePassword(`Enter password to remove ${label.toLowerCase()}:`)
                  )
                    onClear();
                }}
                className="inline-flex items-center justify-center rounded-lg border border-destructive/40 bg-background px-2 py-2 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      <Slot
        label="School logo"
        value={logoDataUrl}
        kind="logo"
        accept="image/*"
        onClear={() => {
          setLogoDataUrl("");
          void persist({ logoDataUrl: "" });
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Slot
          label="Principal signature"
          value={principalSigDataUrl}
          kind="principal"
          accept="image/*"
          onClear={() => {
            setPrincipalSigDataUrl("");
            void persist({ principalSigDataUrl: "" });
          }}
        />
        <Slot
          label="Teacher signature"
          value={teacherSigDataUrl}
          kind="teacher"
          accept="image/*"
          onClear={() => {
            setTeacherSigDataUrl("");
            void persist({ teacherSigDataUrl: "" });
          }}
        />
      </div>
      <div className="flex justify-center pt-1">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save globally
        </button>
      </div>
      {msg && <p className="text-[11px] text-primary font-medium">{msg}</p>}
    </div>
  );
}

interface Teacher {
  id: string;
  email: string | null;
  classes: string[];
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
      >
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/80">
          {title}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-border">{children}</div>}
    </section>
  );
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("manage-teachers", {
    body: { action, ...payload },
  });
  // supabase-js sets `error` for any non-2xx; the real message is inside `data`
  if (data?.error) throw new Error(data.error);
  if (error) {
    type FnErr = { context?: { json?: () => Promise<{ error?: string }> } };
    const ctx = (error as unknown as FnErr).context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch {
        /* fall through */
      }
    }
    throw new Error(error.message);
  }
  return data;
}

export function AdminPanel() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [activeSessions, setActiveSessions] = useState<
    Record<string, { updated_at: string; allow_multi: boolean }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<"student" | "teacher">("student");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newClasses, setNewClasses] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState("");

  const [forcingOut, setForcingOut] = useState(false);
  const [settingPasswordId, setSettingPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [forceOutMsg, setForceOutMsg] = useState("");

  async function handleForceLogoutAll() {
    setForceOutMsg("");
    if (!(await requireDeletePassword("Enter password to force-logout all teachers:"))) return;
    if (
      !(await confirmDialog({
        title: "Force logout all teachers?",
        message: "সকল টিচারের চলমান সেশন বন্ধ হয়ে যাবে। তারা পুনরায় লগইন করতে পারবেন।",
        confirmText: "Logout all",
        destructive: true,
      }))
    )
      return;
    setForcingOut(true);
    try {
      // Rotate session_id for every non-admin row → triggers realtime sign-out on those devices
      const { data: rows } = await supabase.from("active_sessions").select("user_id, allow_multi");
      const targets = (rows ?? []).filter((r) => !r.allow_multi);
      // Parallel updates — no sequential await loop
      await Promise.all(
        targets.map((r) =>
          supabase
            .from("active_sessions")
            .update({ session_id: crypto.randomUUID() })
            .eq("user_id", r.user_id),
        ),
      );
      setForceOutMsg(`✓ ${targets.length} জন টিচারকে লগআউট করা হয়েছে`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setForcingOut(false);
    }
  }

  async function handleCleanAll() {
    setCleanMsg("");
    setError(null);
    if (
      !(await requireDeletePassword(
        "Enter password to clear all marksheet data (backup history is kept):",
      ))
    )
      return;
    if (
      !(await confirmDialog({
        title: "Clear all marksheet records?",
        message:
          "All marksheet records will be permanently deleted. Backup history will remain intact.",
        confirmText: "Continue",
        destructive: true,
      }))
    )
      return;
    if (
      !(await confirmDialog({
        title: "Final warning",
        message: "This action cannot be undone. Are you sure you want to proceed?",
        confirmText: "Yes, delete everything",
        destructive: true,
      }))
    )
      return;
    setCleaning(true);
    try {
      const { error: e1, count: c1 } = await supabase
        .from("marksheet_records")
        .delete({ count: "exact" })
        .not("id", "is", null);
      if (e1) throw new Error(e1.message);
      setCleanMsg(`✓ Cleaned — ${c1 ?? 0} records (history অক্ষত)`);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning(false);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await call("list");
      const fetchedTeachers: (Teacher & { password?: string })[] = data.teachers ?? [];
      setTeachers(fetchedTeachers);
      // Passwords — separate try/catch so a failed get_passwords
      // never blocks the teacher list from showing.
      try {
        const pwData = await call("get_passwords");
        const map: Record<string, string> = pwData.passwords ?? {};
        fetchedTeachers.forEach((t) => {
          if (t.password && !map[t.id]) map[t.id] = t.password;
        });
        setPasswords(map);
      } catch {
        // Fallback: use passwords from list response only
        const map: Record<string, string> = {};
        fetchedTeachers.forEach((t) => {
          if (t.password) map[t.id] = t.password;
        });
        setPasswords(map);
      }
      const { data: sessRows } = await supabase
        .from("active_sessions")
        .select("user_id, updated_at, allow_multi");
      const sessMap: Record<string, { updated_at: string; allow_multi: boolean }> = {};
      (sessRows ?? []).forEach(
        (r: { user_id: string; updated_at: string; allow_multi: boolean }) => {
          sessMap[r.user_id] = { updated_at: r.updated_at, allow_multi: r.allow_multi };
        },
      );
      setActiveSessions(sessMap);
      const { data: adminRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      setAdminIds(new Set((adminRows ?? []).map((r: { user_id: string }) => r.user_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Realtime: auto-refresh teacher list / passwords / classes / admin roles
  // when any device makes a change.
  useRealtimeTables(
    ["user_roles", "teacher_classes", "teacher_passwords", "active_sessions"],
    () => {
      void refresh();
    },
  );

  async function handleCreate() {
    if (!username.trim() || !password) {
      setError("Username ar password lagbe");
      return;
    }
    if (password.length < 6) {
      setError("Password minimum 6 character hote hobe");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await call("create", { username: username.trim(), password, classes: newClasses });
      setUsername("");
      setPassword("");
      setNewClasses([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleClassToggle(t: Teacher, cls: string) {
    const next = t.classes.includes(cls) ? t.classes.filter((c) => c !== cls) : [...t.classes, cls];
    setTeachers((prev) => prev.map((p) => (p.id === t.id ? { ...p, classes: next } : p)));
    try {
      await call("update_classes", { user_id: t.id, classes: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void refresh();
    }
  }

  async function handleDelete(t: Teacher) {
    const teacherLabel = (t.email ?? "").replace(/@teachers\.local$/, "");
    if (!(await requireDeletePassword(`Enter password to delete teacher ${teacherLabel}:`))) return;
    if (
      !(await confirmDialog({
        title: "Delete teacher",
        message: `Delete teacher ${teacherLabel}? This cannot be undone.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    try {
      await call("delete", { user_id: t.id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSetPassword(t: Teacher) {
    if (!newPassword || newPassword.length < 6) {
      setError("Password minimum 6 character hote hobe");
      return;
    }
    try {
      await call("set_password", { user_id: t.id, password: newPassword });
      setPasswords((p) => ({ ...p, [t.id]: newPassword }));
      setSettingPasswordId(null);
      setNewPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeletePassword(t: Teacher) {
    const teacherLabel = (t.email ?? "").replace(/@teachers\.local$/, "");
    if (
      !(await requireDeletePassword(`Enter password to delete ${teacherLabel}'s saved password:`))
    )
      return;
    if (
      !(await confirmDialog({
        title: "Delete saved password",
        message: `Remove the saved password for ${teacherLabel}? The teacher's login will still work — only the stored copy is removed.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    try {
      const { error: e } = await supabase.from("teacher_passwords").delete().eq("user_id", t.id);
      if (e) throw new Error(e.message);
      setPasswords((p) => {
        const n = { ...p };
        delete n[t.id];
        return n;
      });
      setShown((s) => {
        const n = { ...s };
        delete n[t.id];
        return n;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleReleaseSession(t: Teacher) {
    const label = (t.email ?? "").replace(/@teachers\.local$/, "");
    if (
      !(await confirmDialog({
        title: "Release session?",
        message: `${label}-এর চলমান সেশনটি ছেড়ে দেওয়া হবে। তিনি পুনরায় লগইন করতে পারবেন।`,
        confirmText: "Release",
        destructive: true,
      }))
    )
      return;
    try {
      const { error: e } = await supabase.from("active_sessions").delete().eq("user_id", t.id);
      if (e) throw new Error(e.message);
      setActiveSessions((p) => {
        const n = { ...p };
        delete n[t.id];
        return n;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handlePromoteAdmin(t: Teacher) {
    const label = (t.email ?? "").replace(/@teachers\.local$/, "");
    const isAdmin = adminIds.has(t.id);
    if (isAdmin) {
      if (!(await requireDeletePassword(`Enter password to unassign admin from ${label}:`))) return;
      if (
        !(await confirmDialog({
          title: "Unassign admin?",
          message: `${label}-এর admin access সরিয়ে দেওয়া হবে। তিনি আর admin panel-এ access পাবেন না। নিশ্চিত?`,
          confirmText: "Unassign",
          destructive: true,
        }))
      )
        return;
      try {
        await call("unassign_admin", { user_id: t.id });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    if (!(await requireDeletePassword(`Enter password to promote ${label} to admin:`))) return;
    if (
      !(await confirmDialog({
        title: "Make admin?",
        message: `${label}-কে admin বানানো হবে। তিনি এই admin panel-এ পূর্ণ access পাবেন (সব টিচার, ডেটা ও সেটিংস ম্যানেজ করতে পারবেন)। নিশ্চিত?`,
        confirmText: "Make admin",
        destructive: true,
      }))
    )
      return;
    try {
      await call("promote_admin", { user_id: t.id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-full border border-border bg-card p-1 grid grid-cols-2 gap-1 shadow-[var(--shadow-card)]">
        <button
          type="button"
          onClick={() => setAdminTab("student")}
          className={`rounded-full py-2 text-xs font-semibold transition-colors ${adminTab === "student" ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          Students Panel
        </button>
        <button
          type="button"
          onClick={() => setAdminTab("teacher")}
          className={`rounded-full py-2 text-xs font-semibold transition-colors ${adminTab === "teacher" ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          Teachers Panel
        </button>
      </div>

      {adminTab === "student" && (
        <div className="space-y-3">
          <Collapsible title="School Configuration">
            <div className="space-y-3">
              <YearTermPanel />
              <SchoolInfoPanel />
            </div>
          </Collapsible>

          <Collapsible title="School Logo & Signatures">
            <SignaturesPanel />
          </Collapsible>

          <Collapsible title="Student/Class Cleanup">
            <div className="space-y-3">
              <Collapsible title="Clean Data">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => void handleCleanAll()}
                    disabled={cleaning}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-2 text-[11px] font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                  >
                    {cleaning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eraser className="h-3.5 w-3.5" />
                    )}
                    Clean All Data
                  </button>
                  {cleanMsg && <p className="text-[11px] text-primary font-medium">{cleanMsg}</p>}
                </div>
              </Collapsible>
              <Collapsible title="Class Data">
                <ClassDataPanel showRemove />
              </Collapsible>
              <Collapsible title="Student Data Restore">
                <StudentDataRestorePanel />
              </Collapsible>
            </div>
          </Collapsible>
        </div>
      )}

      {adminTab === "teacher" && (
        <div className="space-y-3">
          <Collapsible title="Teacher Access Control">
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="username"
                  autoComplete="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <input
                  type="password"
                  placeholder="Password"
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">
                  Assigned classes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CLASS_OPTIONS.map((c) => {
                    const on = newClasses.includes(c);
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() =>
                          setNewClasses((p) => (on ? p.filter((x) => x !== c) : [...p, c]))
                        }
                        className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover:bg-secondary"}`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 disabled:opacity-60"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Create teacher
                </button>
              </div>
            </div>
          </Collapsible>

          <Collapsible title={`Teacher Credentials (${teachers.length})`}>
            <div className="space-y-2.5">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {teachers.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground">
                  Kono teacher nai. Upor theke add korun.
                </p>
              )}
              <ul className="space-y-2">
                {teachers.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border bg-background p-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-foreground truncate flex-shrink-0 max-w-[40%]">
                        {(t.email ?? t.id).replace(/@teachers\.local$/, "")}
                      </p>
                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        {t.classes.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">No class</span>
                        ) : (
                          t.classes.map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-medium"
                            >
                              {c}
                            </span>
                          ))
                        )}
                      </div>
                      <button
                        onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                        className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-secondary flex-shrink-0"
                        aria-label="Edit classes"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handlePromoteAdmin(t)}
                        className={`rounded p-1 flex-shrink-0 ${adminIds.has(t.id) ? "text-primary bg-primary/10 hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                        aria-label={adminIds.has(t.id) ? "Unassign admin" : "Make admin"}
                        title={adminIds.has(t.id) ? "Unassign admin" : "Make admin"}
                      >
                        <Shield
                          className={`h-3.5 w-3.5 ${adminIds.has(t.id) ? "fill-primary/20" : ""}`}
                        />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        aria-label="Delete teacher"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editingId === t.id && (
                      <div className="mt-2 flex flex-wrap gap-1 pt-2 border-t border-border">
                        {CLASS_OPTIONS.map((c) => {
                          const on = t.classes.includes(c);
                          return (
                            <button
                              type="button"
                              key={c}
                              onClick={() => handleClassToggle(t, c)}
                              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary"}`}
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Password
                        </span>
                        <code className="flex-1 truncate rounded bg-secondary/60 px-2 py-0.5 text-[11px] font-mono text-foreground">
                          {passwords[t.id] ? (
                            shown[t.id] ? (
                              passwords[t.id]
                            ) : (
                              "•".repeat(Math.min(10, passwords[t.id].length))
                            )
                          ) : (
                            <span className="italic text-muted-foreground">not stored</span>
                          )}
                        </code>
                        {passwords[t.id] ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setShown((s) => ({ ...s, [t.id]: !s[t.id] }))}
                              className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-secondary"
                              aria-label="Toggle password"
                            >
                              {shown[t.id] ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePassword(t)}
                              className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              aria-label="Delete saved password"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSettingPasswordId(t.id);
                              setNewPassword("");
                            }}
                            className="rounded px-2 py-0.5 text-[10px] font-semibold border border-primary/40 text-primary hover:bg-primary/10"
                          >
                            Set
                          </button>
                        )}
                      </div>
                      {settingPasswordId === t.id && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New password (min 6)"
                            className="flex-1 rounded border border-input bg-background px-2 py-1 text-[11px] font-mono outline-none focus:border-primary"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleSetPassword(t);
                              if (e.key === "Escape") setSettingPasswordId(null);
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void handleSetPassword(t)}
                            className="rounded px-2 py-1 text-[10px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettingPasswordId(null)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {(() => {
                      const sess = activeSessions[t.id];
                      const isLive =
                        sess && Date.now() - new Date(sess.updated_at).getTime() < 90_000;
                      return (
                        <div className="mt-2 flex items-center gap-2 pt-2 border-t border-border">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Session
                          </span>
                          <span
                            className={`flex-1 text-[11px] font-medium ${isLive ? "text-primary" : "text-muted-foreground"}`}
                          >
                            {isLive ? "● Logged in" : sess ? "○ Idle" : "○ Free"}
                          </span>
                          {sess && (
                            <button
                              type="button"
                              onClick={() => handleReleaseSession(t)}
                              className="rounded px-2 py-0.5 text-[10px] font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10"
                            >
                              <LogOut className="h-3 w-3 inline mr-1" />
                              Release
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </div>
          </Collapsible>

          <Collapsible title="Teacher Login Sessions">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleForceLogoutAll()}
                disabled={forcingOut}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-2 text-[11px] font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
              >
                {forcingOut ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                Force logout all teachers
              </button>
              {forceOutMsg && <p className="text-[11px] text-primary font-medium">{forceOutMsg}</p>}
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
