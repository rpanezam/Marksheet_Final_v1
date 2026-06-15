/**
 * ============================================================
 * MarksheetGenerator.tsx — পুরো অ্যাপের প্রধান UI কম্পোনেন্ট
 * ============================================================
 * এই ফাইলে অ্যাপের সব বড় ফিচার একসাথে আছে:
 *
 *  • Settings ট্যাব  — স্কুলের নাম, ঠিকানা, লোগো, ক্লাস, বছর সেট
 *  • Home ট্যাব     — Excel আপলোড / স্যাম্পল ডাউনলোড / সাবজেক্ট তালিকা
 *                      এডিট, প্রতি স্টুডেন্টের নাম্বার এন্ট্রি ফর্ম
 *  • View ট্যাব     — সংরক্ষিত (Supabase) মার্কশিটগুলো ব্রাউজ ও সার্চ
 *
 * বাটনের কাজ:
 *  - View / Save  : Supabase-এ মার্কশিট সেভ ও পরে দেখা
 *  - PDF         : শুধু বর্তমান স্টুডেন্টের PDF ডাউনলোড
 *  - All N       : সব স্টুডেন্টকে এক PDF-এ একত্রে ডাউনলোড
 *
 * State organization:
 *  - school/class/year ইত্যাদি সেটিংস তথ্য টপ-লেভেলে
 *  - students[] হলো মূল ডেটা সোর্স; currentIndex দিয়ে কোনটা দেখানো
 *    হবে নিয়ন্ত্রিত হয়
 *  - subjectList আলাদা রাখা হয়েছে যাতে কাস্টম সাবজেক্ট অ্যাড/রিমুভ
 *    করলে সব স্টুডেন্টের সাবজেক্ট রো একসাথে আপডেট হয়
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { parseStudentsFromFile, downloadSampleExcel } from "@/lib/excel-parser";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { generateMarksheetsPDF, generateSingleMarksheetPDF, processLogoBlob, processSignatureBlob } from "@/lib/pdf-generator";
import { generateCertificatePDF } from "@/lib/certificate-generator";
import { deliverPdf, deliverPdfWithView, deliverPdfThree } from "@/lib/share-pdf";
import { DEFAULT_SUBJECTS, getGrade, getDefaultFullMarks, resolveFullMarks, isElementaryClass, type StudentRecord, type SubjectMark } from "@/lib/marksheet-types";
import { useRealtimeTables } from "@/lib/useRealtimeTables";
import { APP_SETTINGS_KEYS, ALL_CLASSES } from "@/lib/constants";
import { Eye, EyeOff, Home, Settings, ChevronLeft, ChevronRight, ChevronDown, X, Shield, LogOut, Upload, Pencil, Trash2, Save, FileText, Files, Plus, Download, RotateCcw, RefreshCw, Award, Printer, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminPanel } from "@/components/AdminPanel";
import { requireDeletePassword, getDeletePassword, setDeletePasswordValue, getPasswordGloballyEnabled, setPasswordGloballyEnabled } from "@/lib/deletePassword";
import { confirmDialog } from "@/lib/dialog";

type Tab = "home" | "view" | "settings" | "admin";

function createEmptySubject(name: string): SubjectMark {
  return {
    name,
    fullMarks: getDefaultFullMarks(name),
    highestScore: null,
    obtained: null,
    letterGrade: "",
    gp: null,
  };
}

function normalizeSubjectName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueSubjects(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const subject of group) {
      const name = subject.trim();
      const key = normalizeSubjectName(name);
      if (name && !seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
  }
  return out;
}

function alignSubjectsToList(source: SubjectMark[], selectedSubjects: string[]): SubjectMark[] {
  const exact = new Map(source.map((subject) => [subject.name, subject]));
  const normalized = new Map<string, SubjectMark>();
  for (const subject of source) {
    const key = normalizeSubjectName(subject.name);
    if (!normalized.has(key)) normalized.set(key, subject);
  }
  return selectedSubjects.map((name) => {
    const existing = exact.get(name) ?? normalized.get(normalizeSubjectName(name));
    return existing ? { ...existing, name, fullMarks: getDefaultFullMarks(name) || existing.fullMarks } : createEmptySubject(name);
  });
}

export function MarksheetGenerator() {
  const { role, assignedClasses, signOut, user } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" || isSuperAdmin;
  const isTeacher = role === "teacher";
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("ms.postRefreshView");
    }
    return "view";
  });

  // If super_admin role is removed live, bounce off the admin tab.
  useEffect(() => {
    if (!isSuperAdmin && tab === "admin") setTab("home");
  }, [isSuperAdmin, tab]);

  // Pull-to-refresh: drag down from top → reload page → land on View tab
  useEffect(() => {
    // Only enable pull-to-refresh on the main Home/View tabs. On Settings,
    // Admin, or Backup History sub-tab an accidental drag must NOT reload
    // the page (otherwise create/save appears to "restart" back to Home).
    if (tab !== "home" && tab !== "view") return;
    let startY = 0;
    let pulling = false;
    const threshold = 80;
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('[data-modal-lock-refresh="true"]')) {
        pulling = false;
        return;
      }
      if ((window.scrollY || document.documentElement.scrollTop) <= 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      } else {
        pulling = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > threshold) {
        pulling = false;
        sessionStorage.setItem("ms.postRefreshView", "1");
        window.location.reload();
      }
    };
    const onTouchEnd = () => { pulling = false; };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [tab]);
  const [schoolName, setSchoolName] = useState("AS SUNNAH INTERNATIONAL SCHOOL AND MADRASAH");
  const [schoolAddress, setSchoolAddress] = useState("Bipulashar, Monohargonj, Cumilla");
  const [schoolFont, setSchoolFont] = useState<"times" | "helvetica" | "courier" | "blackletter">("times");
  const [transcriptFont, setTranscriptFont] = useState<"times" | "helvetica" | "courier" | "blackletter">("helvetica");
  const [transcriptFontSize, setTranscriptFontSize] = useState<number>(9.9);
  // Load global school info (admin-managed)
  async function fetchSchoolInfo(): Promise<{ name: string; address: string; font: "times" | "helvetica" | "courier" | "blackletter"; transcriptFont: "times" | "helvetica" | "courier" | "blackletter"; transcriptFontSize: number; logoDataUrl?: string }> {
    const fallback = { name: schoolName, address: schoolAddress, font: schoolFont, transcriptFont, transcriptFontSize };
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTINGS_KEYS.SCHOOL)
        .maybeSingle();
      if (!data?.value) return fallback;
      const v = data.value as { name?: string; address?: string; font?: string; transcriptFont?: string; transcriptFontSize?: number; logoDataUrl?: string };
      const next = {
        name: v.name || fallback.name,
        address: v.address || fallback.address,
        font: (v.font === "times" || v.font === "helvetica" || v.font === "courier" || v.font === "blackletter" ? v.font : fallback.font) as "times" | "helvetica" | "courier" | "blackletter",
        transcriptFont: (v.transcriptFont === "times" || v.transcriptFont === "helvetica" || v.transcriptFont === "courier" || v.transcriptFont === "blackletter" ? v.transcriptFont : fallback.transcriptFont) as "times" | "helvetica" | "courier" | "blackletter",
        transcriptFontSize: typeof v.transcriptFontSize === "number" ? v.transcriptFontSize : fallback.transcriptFontSize,
        logoDataUrl: typeof v.logoDataUrl === "string" && v.logoDataUrl ? v.logoDataUrl : undefined,
      };
      setSchoolName(next.name);
      setSchoolAddress(next.address);
      setSchoolFont(next.font);
      setTranscriptFont(next.transcriptFont);
      setTranscriptFontSize(next.transcriptFontSize);
      if (next.logoDataUrl) setCustomLogo(next.logoDataUrl);
      return next;
    } catch {
      return fallback;
    }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTINGS_KEYS.SCHOOL)
        .maybeSingle();
      if (cancelled || !data?.value) return;
      const v = data.value as { name?: string; address?: string; font?: string; transcriptFont?: string; transcriptFontSize?: number; logoDataUrl?: string };
      if (v.name) setSchoolName(v.name);
      if (v.address) setSchoolAddress(v.address);
      if (v.font === "times" || v.font === "helvetica" || v.font === "courier" || v.font === "blackletter") setSchoolFont(v.font);
      if (v.transcriptFont === "times" || v.transcriptFont === "helvetica" || v.transcriptFont === "courier" || v.transcriptFont === "blackletter") setTranscriptFont(v.transcriptFont);
      if (typeof v.transcriptFontSize === "number") setTranscriptFontSize(v.transcriptFontSize);
      if (typeof v.logoDataUrl === "string" && v.logoDataUrl) setCustomLogo(v.logoDataUrl);
      const v2 = data.value as { principalSigDataUrl?: string; teacherSigDataUrl?: string };
      // Only override the locally-cached sig when the global setting actually
      // contains one. Otherwise we'd wipe a sig that the user uploaded
      // earlier (and that lives in localStorage) just because the global
      // app_settings row hasn't been populated yet.
      if (typeof v2.principalSigDataUrl === "string" && v2.principalSigDataUrl) {
        setPrincipalSig(v2.principalSigDataUrl);
      }
      if (typeof v2.teacherSigDataUrl === "string" && v2.teacherSigDataUrl) {
        setTeacherSig(v2.teacherSigDataUrl);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const [className, setClassName] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("ms.className") || "" : ""));
  const [year, setYear] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("ms.year") || String(new Date().getFullYear()) : String(new Date().getFullYear())));
  const [exam, setExam] = useState("");
  const [term, setTerm] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("ms.term") || "" : ""));
  const [settingsSaveMsg, setSettingsSaveMsg] = useState<string>("");
  const [settingsSubTab, setSettingsSubTab] = useState<"general" | "history">("general");
  // Global Year & Term — set by Super Admin in Admin Panel; auto-applied for
  // every user so that New Student creation always uses the latest values.
  const applyGlobalYearTerm = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const o = v as { year?: string; term?: string };
    if (typeof o.year === "string" && o.year) {
      setYear(o.year);
      try { localStorage.setItem("ms.year", o.year); } catch { /* ignore */ }
    }
    if (typeof o.term === "string" && o.term) {
      setTerm(o.term);
      try { localStorage.setItem("ms.term", o.term); } catch { /* ignore */ }
    }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTINGS_KEYS.GLOBAL_YEAR_TERM)
        .maybeSingle();
      if (cancelled) return;
      applyGlobalYearTerm(data?.value);
    })();
    return () => { cancelled = true; };
  }, []);
  // Auto-persist Settings selections so they're always available (e.g. New Student modal)
  useEffect(() => {
    try {
      if (className) localStorage.setItem("ms.className", className);
      if (year) localStorage.setItem("ms.year", year);
      if (term) localStorage.setItem("ms.term", term);
    } catch { /* ignore */ }
  }, [className, year, term]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string>("");
  // Global subject list — managed by Admin / Super Admin and visible to
  // every user (including teachers). Persisted in app_settings (key="subjects_global").
  const [globalSubjects, setGlobalSubjects] = useState<string[]>([...DEFAULT_SUBJECTS]);
  // Personal subject list — added by a Teacher; only that teacher can see/use them.
  // Persisted in user_subjects (per user row).
  const [personalSubjects, setPersonalSubjects] = useState<string[]>([]);
  // Load this user's personal subjects. `personalHasRow` distinguishes
  // "no row yet — needs seeding" from "row exists but user emptied it".
  const [personalHasRow, setPersonalHasRow] = useState(false);
  const [personalLoaded, setPersonalLoaded] = useState(false);
  // For Super Admin: all subjects added by any teacher across all users.
  const [allTeacherSubjects, setAllTeacherSubjects] = useState<string[]>([]);
  // Effective list shown in UI. Teachers see global + their own additions.
  // Admins see only the global list (their personal additions are merged into global).
  const subjectList = useMemo<string[]>(() => {
    if (isSuperAdmin) {
      // Super Admin's list is STATIC: always all defaults + every global
      // + every teacher's personal subject. Nothing a teacher or admin
      // removes from their own side can shrink this view.
      return uniqueSubjects(DEFAULT_SUBJECTS, globalSubjects, personalSubjects, allTeacherSubjects);
    } else if (isAdmin) {
      // Admin manages the shared global list directly. Removals here
      // affect new teachers' seed but do NOT affect Super Admin's view.
      return uniqueSubjects(DEFAULT_SUBJECTS, globalSubjects);
    } else if (isTeacher) {
      // Teacher's view is their own personal list. On first login the row
      // is seeded from DEFAULT_SUBJECTS + globals (see seeding effect below),
      // and after that ONLY personalSubjects is shown so local deletions
      // persist and do not get re-added from defaults/globals.
      if (personalLoaded && personalHasRow) return uniqueSubjects(personalSubjects);
      // Pre-seed window: show defaults+globals so the UI isn't empty.
      return uniqueSubjects(DEFAULT_SUBJECTS, globalSubjects);
    }
    return uniqueSubjects(DEFAULT_SUBJECTS);
  }, [globalSubjects, personalSubjects, allTeacherSubjects, personalLoaded, personalHasRow, isTeacher, isAdmin, isSuperAdmin]);
  const [subjectsSavedMsg, setSubjectsSavedMsg] = useState("");
  const [newSubject, setNewSubject] = useState("");
  // Load global subjects from app_settings (visible to everyone). Falls back
  // to DEFAULT_SUBJECTS the very first time before an admin has saved.
  const reloadGlobalSubjects = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", APP_SETTINGS_KEYS.SUBJECTS_GLOBAL)
        .maybeSingle();
      const v = data?.value as unknown;
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        // Merge DEFAULT_SUBJECTS so newly added defaults propagate to all users
        setGlobalSubjects(uniqueSubjects(DEFAULT_SUBJECTS, v as string[]));
      }
    } catch { /* ignore */ }
  }, []);
  const reloadPersonalSubjects = useCallback(async (uid: string) => {
    try {
      const { data } = await supabase
        .from("user_subjects")
        .select("subjects")
        .eq("user_id", uid)
        .maybeSingle();
      if (data && Array.isArray(data.subjects)) {
        const arr = (data.subjects as unknown[]).filter((x): x is string => typeof x === "string");
        setPersonalSubjects(arr);
        setPersonalHasRow(true);
      } else {
        setPersonalSubjects([]);
        setPersonalHasRow(false);
      }
    } catch { /* ignore */ }
    setPersonalLoaded(true);
  }, []);
  useEffect(() => {
    void reloadGlobalSubjects();
  }, [reloadGlobalSubjects]);
  useEffect(() => {
    if (user?.id) void reloadPersonalSubjects(user.id);
    else { setPersonalSubjects([]); setPersonalHasRow(false); setPersonalLoaded(false); }
  }, [user?.id, reloadPersonalSubjects]);
  // Super Admin: load every teacher's personal subjects so the full union is visible.
  const reloadAllTeacherSubjects = useCallback(async () => {
    try {
      const { data } = await supabase.from("user_subjects").select("subjects");
      const merged = new Set<string>();
      for (const row of (data ?? []) as Array<{ subjects: unknown }>) {
        const v = row.subjects;
        if (Array.isArray(v)) {
          for (const s of v) if (typeof s === "string" && s) merged.add(s);
        }
      }
      setAllTeacherSubjects(Array.from(merged));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!isSuperAdmin) { setAllTeacherSubjects([]); return; }
    void reloadAllTeacherSubjects();
  }, [isSuperAdmin, reloadAllTeacherSubjects]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const skipNextAutoLoadRef = useRef(false);
  // Bumped whenever another device changes marksheet_records — used to
  // re-trigger the auto-load below or to show a refresh banner.
  const [remoteVersion, setRemoteVersion] = useState(0);
  const [remoteUpdate, setRemoteUpdate] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  useRealtimeTables(["marksheet_records", "app_settings", "user_subjects"], (table: string) => {
    setRemoteVersion((v) => v + 1);
    // অন্য ডিভাইস থেকে নতুন/পরিবর্তিত ডেটা আসলে সাথে সাথে রিলোড করো
    // যাতে ম্যানুয়াল রিফ্রেষ ছাড়াই নতুন স্টুডেন্ট দেখা যায়।
    if (table === "marksheet_records") {
      setStudents([]);
      lastLoadedTermRef.current = "";
      setRemoteUpdate(false);
    } else if (table === "app_settings") {
      // School logo / signatures changed — re-sync so Marksheet preview & PDF
      // updates immediately without a manual refresh.
      void (async () => {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", APP_SETTINGS_KEYS.SCHOOL)
          .maybeSingle();
        if (!data?.value) return;
        const v = data.value as {
          logoDataUrl?: string;
          principalSigDataUrl?: string;
          teacherSigDataUrl?: string;
        };
        setCustomLogo(typeof v.logoDataUrl === "string" && v.logoDataUrl ? v.logoDataUrl : undefined);
        if (typeof v.principalSigDataUrl === "string" && v.principalSigDataUrl) {
          setPrincipalSig(v.principalSigDataUrl);
        }
        if (typeof v.teacherSigDataUrl === "string" && v.teacherSigDataUrl) {
          setTeacherSig(v.teacherSigDataUrl);
        }
      })();
      // Global Year & Term may have changed too — re-pull and apply.
      void (async () => {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", APP_SETTINGS_KEYS.GLOBAL_YEAR_TERM)
          .maybeSingle();
        applyGlobalYearTerm(data?.value);
      })();
      // Subjects (global) may have changed too — re-pull.
      void reloadGlobalSubjects();
    } else if (table === "user_subjects") {
      if (user?.id) void reloadPersonalSubjects(user.id);
      if (isSuperAdmin) void reloadAllTeacherSubjects();
    }
  });
  const [studentSubPage, setStudentSubPage] = useState<"none" | "info" | "subjects">("info");
  const [lastStudentTab, setLastStudentTab] = useState<"info" | "subjects">("info");

  // Ref mirror so popstate handlers can read latest value
  const studentSubPageRef = useRef<"none" | "info" | "subjects">("info");
  useEffect(() => {
    studentSubPageRef.current = studentSubPage;
  }, [studentSubPage]);

  // Mobile back button: only intercept when on the Subjects sub-page; back returns to Info.
  useEffect(() => {
    if (studentSubPage !== "subjects") return;
    window.history.pushState({ studentSubPage }, "");
    const onPop = () => setStudentSubPage("info");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [studentSubPage]);

  // Mobile back button: from any other tab, return to the Student tab.
  useEffect(() => {
    if (tab === "home") return;
    window.history.pushState({ tab }, "");
    const onPop = () => {
      // If a student sub-page is open, the sub-page handler will close it.
      // Don't also switch tabs in that case.
      if (studentSubPageRef.current === "subjects") return;
      setTab("home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tab]);
  const [customLogo, setCustomLogo] = useState<string | undefined>(undefined);
  const [principalSig, setPrincipalSig] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return localStorage.getItem("ms.principalSig") || undefined;
  });
  const [teacherSig, setTeacherSig] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return localStorage.getItem("ms.teacherSig") || undefined;
  });
  const [sigBusy, setSigBusy] = useState<"none" | "principal" | "teacher">("none");

  useEffect(() => {
    try {
      if (principalSig) localStorage.setItem("ms.principalSig", principalSig);
      else localStorage.removeItem("ms.principalSig");
    } catch { /* quota */ }
  }, [principalSig]);
  useEffect(() => {
    try {
      if (teacherSig) localStorage.setItem("ms.teacherSig", teacherSig);
      else localStorage.removeItem("ms.teacherSig");
    } catch { /* quota */ }
  }, [teacherSig]);

  async function onSignatureFile(e: React.ChangeEvent<HTMLInputElement>, who: "principal" | "teacher") {
    const file = e.target.files?.[0];
    if (!file) return;
    setSigBusy(who);
    setError("");
    try {
      const dataUrl = await processSignatureBlob(file);
      if (who === "principal") setPrincipalSig(dataUrl);
      else setTeacherSig(dataUrl);
      // Admin/Super-admin: persist globally to app_settings so it appears
      // on every user's marksheet. Teachers fall back to localStorage only
      // (handled by the existing useEffect) since RLS forbids them writing
      // app_settings — keeps existing logic intact.
      if (isAdmin) {
        try {
          await persistSchoolPatch(
            who === "principal"
              ? { principalSigDataUrl: dataUrl }
              : { teacherSigDataUrl: dataUrl },
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : "Signature সেভ হয়নি");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature প্রসেস করা যায়নি");
    } finally {
      setSigBusy("none");
      e.target.value = "";
    }
  }

  // Mobile back button: from Backup History sub-tab, go back to General
  useEffect(() => {
    if (tab !== "settings" || settingsSubTab !== "history") return;
    window.history.pushState({ settingsSubTab: "history" }, "");
    const onPop = () => setSettingsSubTab("general");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tab, settingsSubTab]);
  const [logoBusy, setLogoBusy] = useState(false);

  // Merge-and-upsert helper for the global school settings row. Used to
  // persist logo / principal sig / teacher sig immediately after upload so
  // (1) the new logo always overrides the old one in the DB and
  // (2) Admin/Super-admin uploaded signatures appear on every marksheet.
  // Not called for teachers (RLS forbids it) — they keep using localStorage.
  async function persistSchoolPatch(patch: {
    logoDataUrl?: string;
    principalSigDataUrl?: string;
    teacherSigDataUrl?: string;
  }) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", APP_SETTINGS_KEYS.SCHOOL)
      .maybeSingle();
    const current = (data?.value ?? {}) as Record<string, unknown>;
    const next = { ...current, ...patch };
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: APP_SETTINGS_KEYS.SCHOOL, value: next as never, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw error;
  }

  // View tab specific filters
  const [viewMode, setViewMode] = useState<"all" | "byClass" | "topSubject" | "byGrade">("all");
  const [viewSubject, setViewSubject] = useState("");
  const [viewGrade, setViewGrade] = useState("A+");
  const [viewClass, setViewClass] = useState("");

  // Swipe handling
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    setError("");
    try {
      const dataUrl = await processLogoBlob(file);
      // New logo always overrides the old one — replace local state and,
      // for admin/super-admin, immediately overwrite the value in
      // app_settings.school so the previous logo is gone.
      setCustomLogo(dataUrl);
      if (isAdmin) {
        try {
          await persistSchoolPatch({ logoDataUrl: dataUrl });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Logo সেভ হয়নি");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo লোড করা যায়নি");
    } finally {
      setLogoBusy(false);
      e.target.value = "";
    }
  }

  // প্রতিটি সাবজেক্টের জন্য সকল স্টুডেন্টের obtained marks থেকে highest বের করো
  const highestPerSubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      for (const sub of s.subjects) {
        const v = typeof sub.obtained === "number" ? sub.obtained : null;
        if (v == null || isNaN(v)) continue;
        const cur = map.get(sub.name);
        if (cur == null || v > cur) map.set(sub.name, v);
      }
    }
    return map;
  }, [students]);

  // মোট obtained marks অনুযায়ী একই ক্লাসের ভেতরে অটো Position (1st, 2nd, 3rd...)
  const positionMap = useMemo(() => {
    const map = new Map<StudentRecord, string>();
    const byClass = new Map<string, StudentRecord[]>();
    for (const s of students) {
      const key = (s.className || className || "").trim().toLowerCase();
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key)!.push(s);
    }
    const ord = (n: number) => {
      const v = n % 100;
      if (v >= 11 && v <= 13) return `${n}th`;
      switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
      }
    };
    for (const list of byClass.values()) {
      const totals = list.map((s) => {
        let total = 0;
        let has = false;
        for (const sub of s.subjects) {
          if (typeof sub.obtained === "number" && !isNaN(sub.obtained)) {
            total += sub.obtained;
            has = true;
          }
        }
        return { s, total, has };
      });
      const ranked = totals.filter((x) => x.has).sort((a, b) => b.total - a.total);
      ranked.forEach((x, i) => map.set(x.s, ord(i + 1)));
    }
    return map;
  }, [students, className]);

  // Search removed — for teachers, restrict to assigned classes only.
  const filteredStudents = useMemo(() => {
    if (isAdmin) return students;
    if (!assignedClasses.length) return [];
    const allow = new Set(assignedClasses.map((c) => c.toLowerCase()));
    return students.filter((s) => !s.className || allow.has(s.className.toLowerCase()));
  }, [students, isAdmin, assignedClasses]);

  // ALL_CLASSES imported from @/lib/constants
  const classOptions = useMemo(() => {
    if (isAdmin) return ALL_CLASSES;
    const allow = new Set(assignedClasses.map((c) => c.toLowerCase()));
    return ALL_CLASSES.filter((c) => allow.has(c.toLowerCase()));
  }, [isAdmin, assignedClasses]);

  // If a teacher has exactly one assigned class, auto-select it.
  useEffect(() => {
    if (!isTeacher) return;
    if (classOptions.length === 1 && className !== classOptions[0]) {
      setClassName(classOptions[0]);
    } else if (classOptions.length > 1 && className && !(classOptions as readonly string[]).includes(className)) {
      // Current selection no longer assigned — clear it.
      setClassName("");
    }
  }, [isTeacher, classOptions, className]);

  useEffect(() => {
    if (currentIdx >= filteredStudents.length) setCurrentIdx(0);
  }, [filteredStudents.length, currentIdx]);

  // অ্যাপ ওপেন হলে / ক্লাস বা ইয়ার বদলালে — DB থেকে সেভ করা
  // স্টুডেন্ট ডেটা অটো লোড করো। (Excel আপলোড থাকলে সেটা ওভাররাইড
  // হবে না, কারণ students.length > 0 হলে আমরা এই লোড স্কিপ করি।)
  useEffect(() => {
    if (students.length > 0) return;
    if (skipNextAutoLoadRef.current) {
      skipNextAutoLoadRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      let q = supabase.from("marksheet_records").select("*");
      if (className) q = q.eq("class_name", className);
      const { data, error } = await q;
      if (cancelled || error || !data || !data.length) return;
      const map = new Map<string, StudentRecord>();
      for (const r of data) {
        const key = `${r.student_id || ""}|${r.roll_no || ""}|${r.class_name || ""}`;
        let s = map.get(key);
        if (!s) {
          s = {
            studentName: r.student_name || "",
            fatherName: r.father_name || "",
            motherName: r.mother_name || "",
            studentId: r.student_id || "",
            className: r.class_name || "",
            rollNo: r.roll_no || "",
            exam: r.exam || "",
            year: r.year_session || "",
            group: "",
            sectionPosition: r.section_position || "",
            workingDays: r.working_days || "",
            totalPresent: r.total_present || "",
            moralBehavior: r.moral_behavior || "",
            coCurricular: r.co_curricular || "",
            comments: r.comments || "",
            subjects: [],
            gpa: r.gpa == null ? null : Number(r.gpa),
          };
          map.set(key, s);
        }
        // term সিলেক্ট থাকলে শুধু সেই term-এর obtained দেখাও
        const matchTerm = !term || (r.exam || "") === term;
        const existing = s.subjects.find((x) => x.name === r.subject);
        if (!existing) {
          s.subjects.push({
            name: r.subject,
            fullMarks: isElementaryClass(r.class_name || className) ? 50 : (r.full_marks != null && Number(r.full_marks) > 0 ? Number(r.full_marks) : getDefaultFullMarks(r.subject)),
            highestScore: r.highest_score == null ? null : Number(r.highest_score),
            obtained: matchTerm && r.obtained_marks != null ? Number(r.obtained_marks) : null,
            letterGrade: matchTerm ? (r.letter_grade || "") : "",
            gp: matchTerm && r.gp != null ? Number(r.gp) : null,
          });
        } else if (matchTerm && r.obtained_marks != null) {
          existing.obtained = Number(r.obtained_marks);
          existing.letterGrade = r.letter_grade || existing.letterGrade;
          existing.gp = r.gp == null ? existing.gp : Number(r.gp);
        }
      }
      const list = Array.from(map.values()).sort((a, b) => {
        const ar = parseInt(a.rollNo) || 0;
        const br = parseInt(b.rollNo) || 0;
        return ar - br;
      });
      if (!cancelled && list.length) {
        setStudents(subjectList.length ? list.map((s) => ({ ...s, subjects: alignSubjectsToList(s.subjects, subjectList) })) : list);
      }
    })();
    return () => { cancelled = true; };
  }, [className, term, students.length, subjectList, remoteVersion]);

  // Term পরিবর্তন হলে — সেই Term-এর সেভ করা marks (DB থেকে) লোড করে
  // students[]-এর obtained marks রিপ্লেস করো। যাতে 1st/2nd/3rd term-এ
  // সঠিক ডেটা ফাইল দেখায়।
  const lastLoadedTermRef = useRef<string>("");
  useEffect(() => {
    if (!term) return;
    if (lastLoadedTermRef.current === term) return;
    if (!students.length) {
      lastLoadedTermRef.current = term;
      return;
    }
    if (!className || !year) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("marksheet_records")
        .select("student_id, roll_no, subject, obtained_marks, full_marks, letter_grade, gp")
        .eq("class_name", className)
        .eq("year_session", year)
        .eq("exam", term);
      if (cancelled || error) return;
      const byKey = new Map<string, Map<string, { obtained: number | null; fullMarks: number; grade: string; gp: number | null }>>();
      for (const r of data || []) {
        const k = `${r.student_id || ""}|${r.roll_no || ""}`;
        if (!byKey.has(k)) byKey.set(k, new Map());
        byKey.get(k)!.set(r.subject, {
          obtained: r.obtained_marks == null ? null : Number(r.obtained_marks),
          fullMarks: isElementaryClass(className) ? 50 : (r.full_marks != null && Number(r.full_marks) > 0 ? Number(r.full_marks) : getDefaultFullMarks(r.subject)),
          grade: r.letter_grade || "",
          gp: r.gp == null ? null : Number(r.gp),
        });
      }
      setStudents((prev) =>
        prev.map((s) => {
          const k = `${s.studentId || ""}|${s.rollNo || ""}`;
          const subs = byKey.get(k);
          const baseSubjects = subjectList.length ? alignSubjectsToList(s.subjects, subjectList) : s.subjects;
          return {
            ...s,
            exam: term,
            subjects: baseSubjects.map((sub) => {
              const m = subs?.get(sub.name);
              if (!m) return { ...sub, obtained: null, letterGrade: "", gp: null };
              return {
                ...sub,
                obtained: m.obtained,
                fullMarks: m.fullMarks || sub.fullMarks,
                letterGrade: m.grade,
                gp: m.gp,
              };
            }),
          };
        }),
      );
      lastLoadedTermRef.current = term;
    })();
    return () => { cancelled = true; };
  }, [term, className, year, students.length, subjectList]);

  useEffect(() => {
    if (!subjectList.length) return;
    setStudents((prev) =>
      prev.map((student) => ({
        ...student,
        subjects: alignSubjectsToList(student.subjects, subjectList),
      })),
    );
  }, [subjectList]);

  // Persist global subjects to app_settings (admin/super_admin only — RLS enforces it).
  async function persistGlobalSubjects(next: string[]) {
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: APP_SETTINGS_KEYS.SUBJECTS_GLOBAL, value: next as unknown as never },
        { onConflict: "key" },
      );
    if (error) {
      console.error("persistGlobalSubjects failed:", error.message);
      toast.error("Subjects সেভ হয়নি: " + error.message);
    }
  }

  // Persist this teacher's personal subjects to user_subjects.
  async function persistPersonalSubjects(uid: string, next: string[]) {
    const { error } = await supabase
      .from("user_subjects")
      .upsert(
        { user_id: uid, subjects: next as unknown as never, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) {
      console.error("persistPersonalSubjects failed:", error.message);
      toast.error("Subjects সেভ হয়নি: " + error.message);
    }
  }

  // Seed a teacher's personal subject list from the current global list
  // the first time they log in. After this they can freely add/remove.
  // Also: if new subjects appear in globalSubjects that the teacher
  // doesn't have yet, silently merge them in.
  useEffect(() => {
    if (!isTeacher || !user?.id || !personalLoaded) return;
    if (!personalHasRow) {
      // First time — seed with full global list
      const seed = uniqueSubjects(DEFAULT_SUBJECTS, globalSubjects);
      setPersonalSubjects(seed);
      setPersonalHasRow(true);
      void persistPersonalSubjects(user.id, seed);
    } else {
      // Existing teacher — merge any new global subjects they don't have
      const newGlobals = globalSubjects.filter((s) => !personalSubjects.includes(s));
      if (newGlobals.length > 0) {
        const merged = uniqueSubjects(personalSubjects, newGlobals);
        setPersonalSubjects(merged);
        void persistPersonalSubjects(user.id, merged);
      }
    }
  }, [isTeacher, user?.id, personalLoaded, personalHasRow, globalSubjects]);

  function addSubject() {
    const name = newSubject.trim();
    if (!name || subjectList.includes(name)) return;
    if (isAdmin) {
      // Admin & Super Admin both manage the global list
      const next = uniqueSubjects(globalSubjects, [name]);
      setGlobalSubjects(next);
      void persistGlobalSubjects(uniqueSubjects(DEFAULT_SUBJECTS, next));
    } else if (isTeacher) {
      const next = [...personalSubjects, name];
      setPersonalSubjects(next);
      const uid = user?.id;
      if (uid) void persistPersonalSubjects(uid, next);
    }
    setNewSubject("");
  }

  function removeSubject(name: string) {
    if (isAdmin) {
      // Admin & Super Admin both manage the global list
      const next = globalSubjects.filter((s) => s !== name);
      setGlobalSubjects(next);
      void persistGlobalSubjects(next);
      return;
    }
    if (isTeacher) {
      const uid = user?.id;
      // If not seeded yet, build full list from defaults+globals then remove
      const base = personalHasRow ? personalSubjects : uniqueSubjects(DEFAULT_SUBJECTS, globalSubjects);
      const next = base.filter((s) => s !== name);
      setPersonalSubjects(next);
      if (!personalHasRow) setPersonalHasRow(true);
      if (uid) void persistPersonalSubjects(uid, next);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(await requireDeletePassword("Enter password to upload data:"))) {
      e.target.value = "";
      return;
    }
    setError("");
    setFileName(file.name);
    try {
      const list = await parseStudentsFromFile(file);
      // Class validation — যদি Settings-এ class দেওয়া থাকে, Excel-এর
      // সব স্টুডেন্টের class সেটার সাথে মিলতে হবে।
      if (className.trim()) {
        const expected = className.trim().toLowerCase();
        const mismatches = list
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => (s.className || "").trim().toLowerCase() !== expected);
        if (mismatches.length) {
          const sample = mismatches
            .slice(0, 3)
            .map(({ s, i }) => `Row ${i + 2}: "${s.className || "(empty)"}"`)
            .join(", ");
          throw new Error(
            `Class mismatch — Settings এ "${className}" সিলেক্টেড, কিন্তু ${mismatches.length} টি রো-তে মিলে নাই (${sample}${mismatches.length > 3 ? "…" : ""})`,
          );
        }
      }
      setStudents(subjectList.length ? list.map((s) => ({ ...s, subjects: alignSubjectsToList(s.subjects, subjectList) })) : list);
      setCurrentIdx(0);
      // Auto-jump to home after upload
      if (list.length) setTab("home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read Excel file");
      setStudents([]);
    }
  }

  // Update by absolute index in students array (find from filtered)
  function updateStudentByRef(target: StudentRecord, patch: Partial<StudentRecord>) {
    setStudents((prev) => prev.map((s) => (s === target ? { ...s, ...patch } : s)));
  }

  function updateSubjectByRef(target: StudentRecord, subIdx: number, patch: Partial<SubjectMark>) {
    setStudents((prev) =>
      prev.map((s) => {
        if (s !== target) return s;
        const subjects = s.subjects.map((sub, j) => (j === subIdx ? { ...sub, ...patch } : sub));
        return { ...s, subjects };
      }),
    );
  }

  function prepareStudent(s: StudentRecord): StudentRecord {
    const subjects: SubjectMark[] = subjectList.length ? alignSubjectsToList(s.subjects, subjectList) : s.subjects;
    // সকল স্টুডেন্টের মধ্যে সর্বোচ্চ স্কোর প্রতিটি সাবজেক্টে অটো-সেট
    const withHighest = subjects.map((sub) => {
      const max = highestPerSubject.get(sub.name);
      return max != null ? { ...sub, highestScore: max } : sub;
    });
    // GPA হিসাব করে অটো কমেন্ট সেট — ইউজার নিজে কিছু লিখলে সেটা প্রায়োরিটি পাবে
    let totalGP = 0;
    let hasFail = false;
    let hasMark = false;
    for (const sub of withHighest) {
      const obtained = sub.obtained;
      if (obtained == null) continue;
      hasMark = true;
      const pct = sub.fullMarks ? (obtained / sub.fullMarks) * 100 : 0;
      const g = getGrade(pct);
      const gp = sub.gp ?? g.gp;
      totalGP += gp;
      if ((sub.letterGrade || g.grade) === "F") hasFail = true;
    }
    const gpa = s.gpa ?? (withHighest.length ? totalGP / withHighest.length : 0);
    const autoComment = !hasMark
      ? ""
      : hasFail
        ? "Need to work harder"
        : gpa >= 5
          ? "Excellent"
          : gpa >= 4
            ? "Very Good"
            : gpa >= 3.5
              ? "Good"
              : gpa >= 3
                ? "Satisfactory"
                : gpa >= 2
                  ? "Needs Improvement"
                  : "Poor — Work Hard";
    const comments = (s.comments && s.comments.trim()) ? s.comments : autoComment;
    return {
      ...s,
      className: className || s.className,
      year: year || s.year,
      exam: term || exam || s.exam,
      sectionPosition: positionMap.get(s) || s.sectionPosition || "",
      subjects: withHighest,
      comments,
    };
  }

  async function downloadBlob(blob: Blob, filename: string) {
    await deliverPdf(blob, filename);
  }

  // Fetch saved marks for OTHER terms of the same student so the marksheet
  // can show 1st + 2nd + 3rd term columns together.
  async function fetchOtherTerms(s: StudentRecord): Promise<StudentRecord["termsData"]> {
    try {
      const { data, error } = await supabase
        .from("marksheet_records")
        .select("exam, subject, full_marks, obtained_marks, letter_grade")
        .eq("student_id", s.studentId || "")
        .eq("roll_no", s.rollNo || "")
        .eq("class_name", s.className || "")
        .eq("year_session", s.year || "");
      if (error || !data) return {};
      const examToKey = (ex: string): "1st" | "2nd" | "3rd" | null => {
        const e = (ex || "").toLowerCase();
        if (e.includes("2nd") || e.includes("second")) return "2nd";
        if (e.includes("3rd") || e.includes("third")) return "3rd";
        if (e.includes("1st") || e.includes("first")) return "1st";
        return null;
      };
      const out: NonNullable<StudentRecord["termsData"]> = {};
      for (const r of data) {
        const key = examToKey(r.exam || "");
        if (!key) continue;
        if (!out[key]) out[key] = {};
        out[key][r.subject] = {
          fullMarks: isElementaryClass(s.className || className) ? 50 : (r.full_marks != null && Number(r.full_marks) > 0 ? Number(r.full_marks) : getDefaultFullMarks(r.subject)),
          obtained: r.obtained_marks == null ? null : Number(r.obtained_marks),
          grade: r.letter_grade || "",
        };
      }
      return out;
    } catch {
      return {};
    }
  }

  async function onGenerateAll() {
    if (!students.length) return;
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: students.length });
    try {
      const prepared = await Promise.all(
        students.map(async (s) => {
          const p = prepareStudent(s);
          return { ...p, termsData: await fetchOtherTerms(p) };
        }),
      );
      const blob = await generateMarksheetsPDF(
        prepared,
        await fetchSchoolInfo(),
        (done, total) => setProgress({ done, total }),
        customLogo,
        undefined,
        principalSig,
        teacherSig,
      );
      await deliverPdfWithView(blob, `marksheets-${Date.now()}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateAllThree() {
    if (!students.length) return;
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: students.length });
    try {
      const prepared = await Promise.all(
        students.map(async (s) => {
          const p = prepareStudent(s);
          return { ...p, termsData: await fetchOtherTerms(p) };
        }),
      );
      const blob = await generateMarksheetsPDF(
        prepared,
        await fetchSchoolInfo(),
        (done, total) => setProgress({ done, total }),
        customLogo,
        undefined,
        principalSig,
        teacherSig,
      );
      await deliverPdfThree(blob, `marksheets-${Date.now()}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateCurrent() {
    const s = filteredStudents[currentIdx];
    if (!s) return;
    setBusy(true);
    setError("");
    try {
      const prepared = prepareStudent(s);
      prepared.termsData = await fetchOtherTerms(prepared);
      const blob = await generateSingleMarksheetPDF(prepared, await fetchSchoolInfo(), customLogo, undefined, principalSig, teacherSig);
      const safe = (s.studentName || "marksheet").replace(/[^a-z0-9]+/gi, "-");
      await downloadBlob(blob, `${safe}-${s.rollNo || s.studentId || currentIdx + 1}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateCertificate() {
    const s = filteredStudents[currentIdx];
    if (!s) return;
    setBusy(true);
    setError("");
    try {
      const prepared = prepareStudent(s);
      const info = await fetchSchoolInfo();
      const blob = await generateCertificatePDF(prepared, info, undefined, principalSig);
      const safe = (s.studentName || "certificate").replace(/[^a-z0-9]+/gi, "-");
      await deliverPdfWithView(blob, `${safe}-certificate.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Certificate generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateMarksheetWithOptions() {
    const s = filteredStudents[currentIdx];
    if (!s) return;
    setBusy(true);
    setError("");
    try {
      const prepared = prepareStudent(s);
      prepared.termsData = await fetchOtherTerms(prepared);
      const blob = await generateSingleMarksheetPDF(prepared, await fetchSchoolInfo(), customLogo, undefined, principalSig, teacherSig);
      const safe = (s.studentName || "marksheet").replace(/[^a-z0-9]+/gi, "-");
      await deliverPdfWithView(blob, `${safe}-${s.rollNo || s.studentId || currentIdx + 1}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPreviewCurrent() {
    const s = filteredStudents[currentIdx];
    if (!s) return;
    setBusy(true);
    setError("");
    try {
      const prepared = prepareStudent(s);
      prepared.termsData = await fetchOtherTerms(prepared);
      const blob = await generateSingleMarksheetPDF(prepared, await fetchSchoolInfo(), customLogo, undefined, principalSig, teacherSig);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      // Auto-trigger print dialog once the PDF viewer loads
      if (win) {
        win.addEventListener("load", () => {
          try { win.focus(); win.print(); } catch { /* ignore */ }
        });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF preview failed");
    } finally {
      setBusy(false);
    }
  }

  const [saveMsg, setSaveMsg] = useState<string>("");
  async function onDeleteCurrent() {
    const s = filteredStudents[currentIdx];
    if (!s) return;
    if (!(await requireDeletePassword(`Enter password to delete "${s.studentName || "Student"}":`))) return;
    const ok = await confirmDialog({
      title: "Delete student",
      message: `Delete "${s.studentName || "this student"}" permanently? This cannot be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    // remove from DB if it has identity
    if (s.studentId || s.rollNo) {
      try {
        let q = supabase.from("marksheet_records").delete().eq("class_name", s.className || "");
        if (s.studentId) q = q.eq("student_id", s.studentId);
        if (s.rollNo) q = q.eq("roll_no", s.rollNo);
        if (s.year) q = q.eq("year_session", s.year);
        await q;
      } catch { /* non-fatal */ }
    }
    setStudents((prev) => {
      const hasIdentity = Boolean(s.studentId || s.rollNo);
      const next = prev.filter((x) => {
        if (x === s) return false;
        if (!hasIdentity) return true;
        if ((x.className || "") !== (s.className || "")) return true;
        if (s.studentId && x.studentId !== s.studentId) return true;
        if (s.rollNo && x.rollNo !== s.rollNo) return true;
        return false;
      });
      if (prev.length > 0 && next.length === 0) skipNextAutoLoadRef.current = true;
      return next;
    });
    setCurrentIdx((i) => Math.max(0, i - 1));
  }

  async function onSaveCurrent() {
    const s = filteredStudents[currentIdx];
    if (!s) return;
    setBusy(true);
    setError("");
    setSaveMsg("");
    try {
      const prepared = prepareStudent(s);
      const rows = prepared.subjects.map((sub) => ({
        student_name: prepared.studentName || "",
        father_name: prepared.fatherName || null,
        mother_name: prepared.motherName || null,
        student_id: prepared.studentId || "",
        class_name: prepared.className || className || classOptions[0] || "",
        roll_no: prepared.rollNo || "",
        exam: prepared.exam || "",
        year_session: prepared.year || "",
        subject: sub.name,
        full_marks: sub.fullMarks ?? null,
        highest_score: sub.highestScore ?? null,
        obtained_marks: sub.obtained ?? null,
        letter_grade:
          sub.obtained != null && sub.fullMarks
            ? getGrade((sub.obtained / sub.fullMarks) * 100).grade
            : null,
        gp:
          sub.obtained != null && sub.fullMarks
            ? getGrade((sub.obtained / sub.fullMarks) * 100).gp
            : null,
        gpa: prepared.gpa ?? null,
        section_position: prepared.sectionPosition || null,
        working_days: prepared.workingDays || null,
        total_present: prepared.totalPresent || null,
        moral_behavior: prepared.moralBehavior || null,
        co_curricular: prepared.coCurricular || null,
        comments: prepared.comments || null,
      }));
      // Upsert by unique key (student_id, roll_no, class_name, year_session, exam, subject)
      const { error: upErr } = await supabase
        .from("marksheet_records")
        .upsert(rows, { onConflict: "student_id,roll_no,class_name,year_session,exam,subject" });
      if (upErr) throw upErr;
      // Save a history snapshot for restore
      try {
        await supabase.from("marksheet_history").insert({
          class_name: prepared.className || "",
          year_session: prepared.year || null,
          exam: prepared.exam || null,
          label: `${prepared.studentName} (Roll ${prepared.rollNo})`,
          row_count: rows.length,
          snapshot: rows,
        });
        // শুধুমাত্র শেষ ২০টা ব্যাকআপ রাখো (এই ক্লাসের) — পুরনোগুলো মুছে ফেলো
        try {
          const { data: keep } = await supabase
            .from("marksheet_history")
            .select("id")
            .eq("class_name", prepared.className || "")
            .order("created_at", { ascending: false })
            .limit(20);
          const keepIds = (keep || []).map((r: { id: string }) => r.id);
          if (keepIds.length === 20) {
            await supabase
              .from("marksheet_history")
              .delete()
              .eq("class_name", prepared.className || "")
              .not("id", "in", `(${keepIds.map((i) => `"${i}"`).join(",")})`);
          }
        } catch { /* non-fatal */ }
      } catch { /* non-fatal */ }
      setSaveMsg("✓ Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const current = filteredStudents[currentIdx];

  function goPrev() {
    setCurrentIdx((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setCurrentIdx((i) => Math.min(filteredStudents.length - 1, i + 1));
  }

  // Manually add a blank student on Home tab
  function addBlankStudent() {
    const blank: StudentRecord = {
      studentName: "",
      fatherName: "",
      motherName: "",
      studentId: "",
      className: className || "",
      rollNo: "",
      exam: term || exam || "",
      year: year || "",
      group: "N/A",
      sectionPosition: "",
      workingDays: "",
      totalPresent: "",
      moralBehavior: "",
      coCurricular: "",
      comments: "",
      subjects: (subjectList.length ? subjectList : [...DEFAULT_SUBJECTS]).map((name) => ({
        name,
        fullMarks: resolveFullMarks(name, className),
        highestScore: null,
        obtained: null,
        letterGrade: "",
        gp: null,
      })),
      gpa: null,
    };
    setStudents((prev) => {
      const next = [...prev, blank];
      setCurrentIdx(next.length - 1);
      return next;
    });
    setTab("home");
  }

  // Touch swipe handlers (left/right)
  function onTouchStart(e: React.TouchEvent) {
    const target = e.target as HTMLElement;
    // Don't start swipe on form fields so typing/selection still works
    if (target.closest("input, textarea, select, button, [role='combobox']")) {
      touchRef.current = null;
      return;
    }
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    touchRef.current = null;
    // Horizontal swipe: > 40px, dominant horizontal, < 800ms
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 800) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  const setupCard = (
    <CollapseCard title={isAdmin ? "School & Setup" : "Setup"}>
            {isAdmin && (
            <>
            <div className="flex items-center justify-end gap-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-border overflow-hidden">
              {customLogo ? (
                <img src={customLogo} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[7px] text-muted-foreground">Logo</span>
              )}
              </div>
              <label className="cursor-pointer rounded-lg bg-[image:var(--gradient-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity">
                {logoBusy ? "..." : customLogo ? "Change" : "Logo"}
                <input type="file" accept="image/*" onChange={onLogoFile} className="hidden" />
              </label>
              {customLogo && (
                <button
                  type="button"
                  onClick={async () => { if (await requireDeletePassword("Enter password to remove logo:")) setCustomLogo(undefined); }}
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-[11px] font-medium hover:bg-secondary transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            </>
            )}
            {isAdmin && (
              <>
                <div className="grid gap-2 grid-cols-3 rounded-md bg-transparent shadow-none focus-within:bg-primary/15 focus-within:ring-2 focus-within:ring-primary/50 focus-within:shadow-[var(--shadow-glow-soft)] focus-within:bg-[image:var(--gradient-glow-radial)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]">
                  <SmallSelect label="" value={className} onChange={setClassName} placeholder="Class" options={classOptions as string[]} />
                  <SmallSelect label="" value={year} onChange={setYear} placeholder="Year" options={Array.from({ length: 11 }, (_, i) => String(new Date().getFullYear() - 5 + i))} />
                  <SmallSelect label="" value={term} onChange={setTerm} placeholder="Term" options={["1st Term Assessment","2nd Term Assessment","3rd Term Assessment"]} />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  {settingsSaveMsg && <span className="text-[11px] font-medium text-primary">{settingsSaveMsg}</span>}
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem("ms.className", className);
                        localStorage.setItem("ms.year", year);
                        localStorage.setItem("ms.term", term);
                        setSettingsSaveMsg("✓ Saved");
                        setTimeout(() => setSettingsSaveMsg(""), 1800);
                      } catch {
                        setSettingsSaveMsg("Save failed");
                      }
                    }}
                    className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity"
                  >
                    Save
                  </button>
                </div>
              </>
            )}

            {/* — Subjects — */}
            <div className="pt-2 mt-1 border-t border-border/60 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground">Subjects</h3>
              <span className="text-[10px] text-muted-foreground">{subjectList.length}</span>
            </div>
            {subjectList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {subjectList.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={async () => {
                        if (isTeacher) { removeSubject(name); return; }
                        if (await requireDeletePassword(`Enter password to remove subject "${name}":`)) removeSubject(name);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form
              className="flex gap-1.5 rounded-md bg-transparent shadow-none focus-within:bg-primary/15 focus-within:ring-2 focus-within:ring-primary/50 focus-within:shadow-[var(--shadow-glow-soft)] focus-within:bg-[image:var(--gradient-glow-radial)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              onSubmit={(e) => {
                e.preventDefault();
                addSubject();
              }}
            >
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                enterKeyHint="done"
                placeholder="New subject"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <button
                type="submit"
                className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity"
              >
                +
              </button>
            </form>
            <div className="flex items-center justify-end gap-2 pt-1">
              {subjectsSavedMsg && (
                <span className="text-[10px] font-medium text-primary">{subjectsSavedMsg}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isAdmin) void persistGlobalSubjects(uniqueSubjects(DEFAULT_SUBJECTS, globalSubjects));
                  else if (isTeacher && user?.id) void persistPersonalSubjects(user.id, personalSubjects);
                  setSubjectsSavedMsg("Saved ✓");
                  window.setTimeout(() => setSubjectsSavedMsg(""), 1500);
                }}
                className="rounded-lg bg-[image:var(--gradient-primary)] px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity"
              >
                Save
              </button>
            </div>

            {isAdmin && (
              <>
                {/* — Sample Template — */}
                <div className="pt-2 mt-1 border-t border-border/60 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground">Sample Template</h3>
                  <select
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className={`rounded-lg border border-input bg-background px-2 py-1 text-[10px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 ${className ? "" : "text-muted-foreground"}`}
                    title="Select class"
                  >
                    <option value="">Class</option>
                    {classOptions.map((c) => (
                      <option key={c} value={c} className="text-foreground">{c}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSampleExcel(subjectList, className, { exam, term, year, school: schoolName })}
                  disabled={!subjectList.length || !className.trim()}
                  title={!className.trim() ? "Class সিলেক্ট করুন" : "Download sample template"}
                  className="w-full rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                >
                  ↓ Download Sample Template
                </button>

                {/* — Upload Excel — */}
                <div className="pt-2 mt-1 border-t border-border/60">
                  <h3 className="text-xs font-semibold text-foreground mb-1.5">Upload Excel</h3>
                </div>
                <label className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-3 py-5 cursor-pointer hover:bg-secondary/50 hover:border-primary/60 transition-all">
                  <span className="text-sm font-semibold text-primary">⬆ Upload Excel</span>
                  <span className="text-[10px] text-muted-foreground truncate">{fileName || "Click to choose .xlsx file"}</span>
                  <input type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" />
                </label>
                {students.length > 0 && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                    ✓ {students.length} student{students.length === 1 ? "" : "s"} loaded
                  </div>
                )}
                {error && <p className="text-[11px] text-destructive">{error}</p>}
              </>
            )}
          </CollapseCard>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-3 px-3 pt-1 pb-14 sm:px-6 sm:pt-2 sm:pb-16">
      {remoteUpdate && students.length > 0 && (
        <div className="sticky top-12 z-30 -mx-3 sm:-mx-6 mb-2 px-3 sm:px-6">
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 flex items-center justify-between gap-2 shadow-[var(--shadow-card)]">
            <span className="text-[11px] font-medium text-foreground">🔄 অন্য ডিভাইস থেকে নতুন ডেটা এসেছে</span>
            <button
              type="button"
              onClick={() => { setStudents([]); setRemoteUpdate(false); }}
              className="rounded-md bg-[image:var(--gradient-primary)] px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95"
            >Refresh</button>
          </div>
        </div>
      )}
      {/* Top bar with title */}
      <header className="sticky top-0 z-40 -mx-3 sm:-mx-6 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 px-3 py-1 sm:px-6 sm:py-[5px] shadow-[0_1px_0_0_var(--border)]">
        <div className="flex flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("ms.postRefreshView", "1");
                window.location.reload();
              }}
              className="rounded-lg border border-border bg-card p-1.5 text-foreground hover:bg-secondary hover:text-primary hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors"
              aria-label="Refresh page"
              title="Refresh"
            >
              <RefreshCw className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setTab("admin")}
                className={`rounded-lg border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${tab === "admin" ? "border-primary bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]" : "border-border bg-card text-foreground hover:bg-secondary hover:text-primary hover:border-primary/60"}`}
                aria-label="Open admin panel"
                aria-pressed={tab === "admin"}
                title="Admin"
              >
                <Shield className="h-[18px] w-[18px]" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`rounded-lg border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${tab === "settings" ? "border-primary bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]" : "border-border bg-card text-foreground hover:bg-secondary hover:text-primary hover:border-primary/60"}`}
              aria-label="Open settings"
              aria-pressed={tab === "settings"}
              title="Settings"
            >
              <Settings className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-destructive/60 bg-card px-2 py-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors"
              aria-label="Sign out of your account"
              title="Sign out"
            >
              <LogOut className="h-[18px] w-[18px]" />
              <span className="text-xs font-semibold">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {tab === "admin" && isSuperAdmin && <AdminPanel />}

      {/* SETTINGS TAB */}
      {tab === "settings" && (
        <>
          <div className="rounded-full border border-border bg-card p-1 grid grid-cols-2 gap-1 shadow-[var(--shadow-card)]">
            <button
              type="button"
              onClick={() => setSettingsSubTab("general")}
              className={`rounded-full py-2 text-xs font-semibold transition-colors ${settingsSubTab === "general" ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setSettingsSubTab("history")}
              className={`rounded-full py-2 text-xs font-semibold transition-colors ${settingsSubTab === "history" ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              Backup History
            </button>
          </div>

          {settingsSubTab === "general" && (
            <>
              {null}
              <CollapseCard title="Class" defaultOpen>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Selected</span>
                  <span className="text-[10px] text-muted-foreground">{classOptions.length} classes</span>
                </div>
                {classOptions.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {isTeacher ? "No classes assigned to you yet." : "No classes available."}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {classOptions.map((c) => {
                      const active = className === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setClassName(c)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? "border-primary bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]"
                              : "border-border bg-secondary/60 text-secondary-foreground hover:bg-secondary"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-2">
                  {settingsSaveMsg && (
                    <span className="text-[10px] font-medium text-primary">{settingsSaveMsg}</span>
                  )}
                  <button
                    type="button"
                    disabled={!className}
                    onClick={() => {
                      try { localStorage.setItem("ms.className", className); } catch {}
                      setSettingsSaveMsg("Saved ✓");
                      window.setTimeout(() => setSettingsSaveMsg(""), 1500);
                    }}
                    className="rounded-lg bg-[image:var(--gradient-primary)] px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </CollapseCard>

              <CollapseCard title="Subjects">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Total subjects</span>
                  <span className="text-[10px] text-muted-foreground">{subjectList.length} subjects</span>
                </div>
                {subjectList.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {subjectList.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={async () => {
                            if (isTeacher) { removeSubject(name); return; }
                            if (await requireDeletePassword(`Enter password to remove subject "${name}":`)) removeSubject(name);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${name}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <form
                  className="flex gap-1.5 mt-2"
                  onSubmit={(e) => { e.preventDefault(); addSubject(); }}
                >
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    enterKeyHint="done"
                    placeholder="New subject"
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity"
                  >
                    +
                  </button>
                </form>
                <div className="flex items-center justify-end gap-2 pt-1">
                  {subjectsSavedMsg && (
                    <span className="text-[10px] font-medium text-primary">{subjectsSavedMsg}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (isAdmin) void persistGlobalSubjects(subjectList);
                      else if (isTeacher && user?.id) void persistPersonalSubjects(user.id, personalSubjects);
                      setSubjectsSavedMsg("Saved ✓");
                      window.setTimeout(() => setSubjectsSavedMsg(""), 1500);
                    }}
                    className="rounded-lg bg-[image:var(--gradient-primary)] px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity"
                  >
                    Save
                  </button>
                </div>
              </CollapseCard>

              {/* — Signatures — placed right after Subjects.
                 Admin: persists globally to app_settings (visible to every user).
                 Teacher: kept locally in localStorage (RLS forbids global writes). */}
              <CollapseCard title="Signatures">
                <div className="space-y-3">
                  {(["principal", "teacher"] as const).map((who) => {
                    const value = who === "principal" ? principalSig : teacherSig;
                    const label = who === "principal" ? "Principal signature" : "Teacher signature";
                    return (
                      <div key={who} className="flex items-center gap-3">
                        <div className="h-12 w-20 shrink-0 rounded-md border border-border bg-secondary/40 overflow-hidden flex items-center justify-center">
                          {value ? (
                            <img src={value} alt={label} className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-[9px] text-muted-foreground">No image</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-foreground truncate">{label}</div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[image:var(--gradient-primary)] px-2.5 py-1 text-[10px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity">
                              {sigBusy === who ? "..." : value ? "Change" : "Upload"}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => onSignatureFile(e, who)}
                                className="hidden"
                              />
                            </label>
                            {value && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!(await requireDeletePassword(`Enter password to remove ${label}:`))) return;
                                  if (who === "principal") setPrincipalSig(undefined);
                                  else setTeacherSig(undefined);
                                  if (isAdmin) {
                                    try {
                                      await persistSchoolPatch(
                                        who === "principal"
                                          ? { principalSigDataUrl: "" }
                                          : { teacherSigDataUrl: "" },
                                      );
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : "Signature মুছা যায়নি");
                                    }
                                  }
                                }}
                                className="rounded-lg border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {isAdmin
                      ? "Admin uploads are saved globally and appear on every marksheet."
                      : "Saved on this device for your marksheets."}
                  </p>
                </div>
              </CollapseCard>

              <CollapseCard title="Set Password">
                <DeletePasswordBody />
              </CollapseCard>
            </>
          )}

          {settingsSubTab === "history" && (
            <>
              <section className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
                <h3 className="text-sm font-semibold mb-2">Backup</h3>
                <ClassExportPanel
                  classOptions={classOptions as string[]}
                  defaultClass={className}
                  defaultYear={year}
                  defaultTerm={term}
                  schoolName={schoolName}
                  schoolAddress={schoolAddress}
                  customLogo={customLogo}
                  subjectList={subjectList}
                  students={students}
                  onBackupDone={() => setHistoryKey((k) => k + 1)}
                />
              </section>

              <section className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
                <HistoryPanel
                  classOptions={classOptions as string[]}
                  hideRestore={false}
                  refreshKey={historyKey}
                  onRestored={(item) => {
                    setStudents([]);
                    if (item.class_name) setClassName(item.class_name);
                    if (item.year_session) setYear(item.year_session);
                  }}
                />
              </section>
            </>
          )}
        </>
      )}

      {/* HOME TAB — marksheet preview & edit */}
      {tab === "home" && (
        <>
          {!current ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center space-y-3 shadow-[var(--shadow-card)]">
              <p className="text-sm text-muted-foreground">
                {students.length === 0
                  ? "​"
                  : "সার্চ-এ কোনো ছাত্র মেলেনি"}
              </p>
              {students.length === 0 && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={addBlankStudent}
                    className="rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity"
                  >
                    + Add Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("settings")}
                    className="rounded-lg border border-input bg-background px-4 py-2 text-xs font-semibold hover:bg-secondary transition-colors"
                  >
                    Upload Excel
                  </button>
                </div>
              )}
            </div>
          ) : (
            studentSubPage === "none" ? (
              <section
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] space-y-2.5"
              >
                {/* Name header card — highlighted by default */}
                <div className="rounded-md border border-emerald-100 bg-background px-2 py-0.5 flex items-center justify-center gap-2">
                  <p className="text-[12px] font-bold text-foreground truncate leading-tight">
                    {current.studentName || "Unnamed"}
                  </p>
                  <span className="text-[9px] text-muted-foreground leading-tight whitespace-nowrap">
                    Roll: {current.rollNo || "—"}{current.studentId ? ` • ID: ${current.studentId}` : ""}
                  </span>
                </div>

                {/* Two collapsed tap cards */}
                <button
                  type="button"
                  onClick={() => { setLastStudentTab("info"); setStudentSubPage("info"); }}
                  className="w-full rounded-xl border border-primary bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 px-3 py-2 flex items-center justify-between gap-2 transition-opacity"
                >
                  <span className="text-[13px] font-semibold tracking-tight">Student Info</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { setLastStudentTab("subjects"); setStudentSubPage("subjects"); }}
                  className="w-full rounded-xl border border-primary bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 px-3 py-2 flex items-center justify-between gap-2 transition-opacity"
                >
                  <span className="text-[13px] font-semibold tracking-tight">Subjects</span>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    {current.subjects.length} <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>

                {/* Counter only — swipe left/right to navigate */}
                <div className="flex items-center justify-center pt-1 border-t border-border">
                  <span className="text-[11px] font-semibold text-foreground tabular-nums">
                    {currentIdx + 1} <span className="text-muted-foreground">/</span> {filteredStudents.length}
                  </span>
                </div>
              </section>
            ) : studentSubPage === "subjects" ? (
              <section className="rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-card)] space-y-1.5">
                 <div className="flex items-center justify-center">
                   <p className="text-base font-extrabold truncate tracking-wide bg-[image:var(--gradient-primary)] bg-clip-text text-transparent drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]">{current?.studentName || "—"}</p>
                 </div>
                {current && (
                  <div className="rounded-xl border border-border bg-secondary/30 px-2.5 divide-y divide-border/60">
                     {current.subjects.map((sub, j) => (
                       <div key={j} className="flex items-center gap-2 py-[3px] rounded-md bg-transparent shadow-none focus-within:bg-primary/15 focus-within:ring-2 focus-within:ring-primary/50 focus-within:shadow-[var(--shadow-glow-soft)] focus-within:bg-[image:var(--gradient-glow-radial)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]">
                         <span className="flex-1 text-[13px] font-extrabold truncate bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">{sub.name}</span>
                         <select
                           value={sub.fullMarks}
                           onChange={(e) => updateSubjectByRef(current, j, { fullMarks: Number(e.target.value) })}
                           className="w-12 rounded-md border border-input bg-background text-[11px] h-[28px] text-center font-semibold text-muted-foreground outline-none focus:border-primary shrink-0"
                         >
                           <option value={100}>100</option>
                           <option value={50}>50</option>
                         </select>
                        <input
                          type="number"
                          inputMode="decimal"
                          max={sub.fullMarks}
                          value={sub.obtained ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateSubjectByRef(current, j, { obtained: null });
                              return;
                            }
                            const val = Number(raw);
                            if (isNaN(val)) return;
                            const fm = Number(sub.fullMarks);
                            if (fm > 0 && val > fm) {
                              toast.error(`${sub.name}: সর্বোচ্চ ${sub.fullMarks} নাম্বার বসানো যাবে`);
                              return;
                            }
                            if (val < 0) {
                              toast.error("নাম্বার ০-এর কম হতে পারবে না");
                              return;
                            }
                            updateSubjectByRef(current, j, { obtained: val });
                          }}
                          className="w-14 rounded-md border border-input bg-background px-1 text-[13px] h-[28px] text-center font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </div>
                    ))}
                    {current.subjects.length === 0 && (
                      <p className="text-[10px] text-muted-foreground px-1 py-2">No subjects — add from Settings.</p>
                    )}
                  </div>
                )}
              </section>
            ) : (
            <section
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              className="relative rounded-xl border border-border bg-card p-2.5 shadow-[var(--shadow-card)] space-y-1.5"
            >
              {/* Tap edges to navigate */}
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIdx === 0}
                aria-label="Previous"
                className="absolute left-0 top-0 bottom-0 w-8 z-10 flex items-center justify-start pl-1 opacity-0 active:opacity-100 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-5 w-5 text-primary" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIdx >= filteredStudents.length - 1}
                aria-label="Next"
                className="absolute right-0 top-0 bottom-0 w-8 z-10 flex items-center justify-end pr-1 opacity-0 active:opacity-100 disabled:pointer-events-none"
              >
                <ChevronRight className="h-5 w-5 text-primary" />
              </button>

              {/* Name header card */}
              <div className="rounded-xl border border-emerald-700 bg-emerald-700 px-3 py-1.5 flex items-center justify-between gap-2 shadow-[var(--shadow-primary)]">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={current.studentName}
                    onChange={(e) => updateStudentByRef(current, { studentName: e.target.value })}
                    placeholder="Student Name"
                    className="w-full bg-transparent text-center text-[13px] font-extrabold text-white outline-none placeholder:text-white/60 h-5"
                  />
                </div>
                <Pencil className="h-3.5 w-3.5 text-white/85 shrink-0" />
                <button
                  type="button"
                  onClick={onDeleteCurrent}
                  className="text-white/90 hover:bg-white/10 rounded transition-colors shrink-0"
                  aria-label="Delete student"
                  title="Delete this student"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Info rows */}
              <div className="rounded-xl border border-border bg-secondary/30 px-3 py-0.5 divide-y divide-border/60">
                <ProfileRow label="Roll" value={current.rollNo} numeric onChange={(v) => updateStudentByRef(current, { rollNo: v })} />
                <ProfileRow label="Student ID" value={current.studentId} numeric onChange={(v) => updateStudentByRef(current, { studentId: v })} />
                <ProfileRow label="Fathers Name" value={current.fatherName} onChange={(v) => updateStudentByRef(current, { fatherName: v })} />
                <ProfileRow label="Present" value={current.totalPresent} onChange={(v) => updateStudentByRef(current, { totalPresent: v })} />
                <ProfileRow label="Co-Curricular Activities" value={current.coCurricular} onChange={(v) => updateStudentByRef(current, { coCurricular: v })} />
                <ProfileRow label="Comments" value={current.comments} onChange={(v) => updateStudentByRef(current, { comments: v })} />
              </div>

              {/* Term tabs (tap to switch active term) + Class */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl border border-border bg-secondary/30 p-0.5 grid grid-cols-3 gap-0.5">
                  {[
                    { key: "1st Term Assessment", label: "Term 1" },
                    { key: "2nd Term Assessment", label: "Term 2" },
                    { key: "3rd Term Assessment", label: "Term 3" },
                  ].map((t) => {
                    const active = term === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setTerm(t.key);
                          if (typeof window !== "undefined") localStorage.setItem("ms.term", t.key);
                        }}
                        className={`rounded-lg px-1 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]"
                            : "text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 px-3 py-1 flex items-center justify-between gap-2">
                  <span className="text-[12px] uppercase tracking-wide text-muted-foreground">Class</span>
                  <span className="text-[13px] font-semibold text-foreground truncate">{current.className || className || "—"}</span>
                </div>
              </div>
              <MoralRow value={current.moralBehavior} onChange={(v) => updateStudentByRef(current, { moralBehavior: v })} />

              {/* Subjects — open as a separate page */}
              <button
                type="button"
                onClick={() => setStudentSubPage("subjects")}
                className="relative w-full rounded-xl border border-emerald-700 bg-emerald-700 px-3 py-1.5 flex items-center justify-center gap-2 text-white shadow-[var(--shadow-primary)] hover:bg-emerald-800 transition-colors"
              >
                <span className="text-[13px] font-extrabold text-white">Subjects</span>
                <span className="absolute right-3 flex items-center gap-1 text-[13px] font-extrabold text-white">
                  {current.subjects.length} <ChevronRight className="h-4 w-4" />
                </span>
              </button>
              {saveMsg && <p className="text-[10px] text-primary font-medium">{saveMsg}</p>}
              {busy && progress.total > 1 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-[image:var(--gradient-primary)] transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
              {error && <p className="text-[10px] text-destructive">{error}</p>}

              <div className="flex items-center justify-center pt-1 border-t border-border">
                <span className="text-[12px] font-semibold text-foreground tabular-nums">
                  {currentIdx + 1} <span className="text-muted-foreground">/</span> {filteredStudents.length}
                </span>
              </div>
            </section>
            )
          )}
          {/* Sticky action bar — always visible at bottom of student tab */}
          <div className="sticky bottom-0 left-0 right-0 z-20 -mx-3 px-3 pt-1.5 pb-2 bg-background/95 backdrop-blur border-t border-border">
            {studentSubPage === "info" ? (
              <div className="grid grid-cols-2 items-center gap-2">
                <button
                  type="button"
                  onClick={onPreviewCurrent}
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-900 bg-emerald-900 text-white px-3 py-1.5 text-[12px] font-bold transition-all hover:bg-emerald-950 active:translate-y-px disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  onClick={onSaveCurrent}
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-900 bg-emerald-900 text-white px-3 py-1.5 text-[12px] font-bold transition-all hover:bg-emerald-950 active:translate-y-px disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Save</span>
                </button>
              </div>
            ) : (
            <>
            {studentSubPage !== "subjects" && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onGenerateMarksheetWithOptions}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-1.5 text-[11px] font-semibold transition-all hover:bg-emerald-100 active:translate-y-px disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> <span>Marksheet</span>
                  </button>
                  <button
                    type="button"
                    onClick={onGenerateCertificate}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-1.5 text-[11px] font-semibold transition-all hover:bg-emerald-100 active:translate-y-px disabled:opacity-50"
                  >
                    <Award className="h-3.5 w-3.5" /> <span>Certificate</span>
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <ActionBtn icon={<Printer className="h-3.5 w-3.5" />} label="PDF" onClick={onGenerateCurrent} disabled={busy} />
                  <ActionBtn icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={onSaveCurrent} disabled={busy} />
                  <ActionBtn
                    icon={<Printer className="h-3.5 w-3.5" />}
                    label={busy && progress.total > 1 ? `${pct}%` : `Print All ${students.length}`}
                    onClick={onGenerateAll}
                    disabled={busy}
                  />
                </div>
              </>
            )}
            <div className={`${studentSubPage === "subjects" ? "" : "mt-1.5"} grid grid-cols-2 items-center gap-2`}>
              <button
                type="button"
                onClick={onPreviewCurrent}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-100 bg-background text-foreground px-3 py-1.5 text-[11px] font-semibold transition-all hover:bg-emerald-50 active:translate-y-px disabled:opacity-50"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>View</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("view")}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Create
              </button>
            </div>
            </>
            )}
          </div>
        </>
      )}

      {/* VIEW TAB — list of all students */}
      {tab === "view" && (
        <>
        <ViewTab
          students={students}
          filteredStudents={filteredStudents}
          subjectList={subjectList}
          classOptions={classOptions as string[]}
          mode={viewMode}
          setMode={setViewMode}
          subject={viewSubject}
          setSubject={setViewSubject}
          grade={viewGrade}
          setGrade={setViewGrade}
          klass={viewClass}
          setKlass={setViewClass}
          onPick={(s) => {
            const idx = students.indexOf(s);
            if (idx >= 0) {
              setCurrentIdx(idx);
              setTab("home");
            }
          }}
          onPrintAll={onGenerateAllThree}
          busyPrintAll={busy}
          defaultClass={className}
          defaultYear={year}
          defaultTerm={term}
          onCreate={async (newStudent) => {
            // Append to local list and persist immediately
            setStudents((prev) => [...prev, newStudent]);
            try {
              const rows = newStudent.subjects.map((sub) => ({
                student_name: newStudent.studentName || "",
                father_name: newStudent.fatherName || null,
                mother_name: newStudent.motherName || null,
                student_id: newStudent.studentId || "",
                class_name: newStudent.className || className || classOptions[0] || "",
                roll_no: newStudent.rollNo || "",
                exam: newStudent.exam || "",
                year_session: newStudent.year || "",
                subject: sub.name,
                full_marks: sub.fullMarks ?? null,
                highest_score: sub.highestScore ?? null,
                obtained_marks: sub.obtained ?? null,
                letter_grade:
                  sub.obtained != null && sub.fullMarks
                    ? getGrade((sub.obtained / sub.fullMarks) * 100).grade
                    : null,
                gp:
                  sub.obtained != null && sub.fullMarks
                    ? getGrade((sub.obtained / sub.fullMarks) * 100).gp
                    : null,
                gpa: newStudent.gpa ?? null,
              }));
              if (rows.length) {
                await supabase
                  .from("marksheet_records")
                  .upsert(rows, { onConflict: "student_id,roll_no,class_name,year_session,exam,subject" });
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : "Create failed");
            }
          }}
          onDelete={async (s) => {
            if (!(await requireDeletePassword(`Enter password to delete "${s.studentName || "Student"}":`))) return;
            const ok = await confirmDialog({
              title: "Delete student",
              message: `Delete "${s.studentName || "this student"}" permanently? This cannot be undone.`,
              confirmText: "Delete",
              destructive: true,
            });
            if (!ok) return;
            if (s.studentId || s.rollNo) {
              try {
                let q = supabase.from("marksheet_records").delete().eq("class_name", s.className || "");
                if (s.studentId) q = q.eq("student_id", s.studentId);
                if (s.rollNo) q = q.eq("roll_no", s.rollNo);
                if (s.year) q = q.eq("year_session", s.year);
                await q;
              } catch { /* non-fatal */ }
            }
            setStudents((prev) => {
              const hasIdentity = Boolean(s.studentId || s.rollNo);
              const next = prev.filter((x) => {
                if (x === s) return false;
                if (!hasIdentity) return true;
                if ((x.className || "") !== (s.className || "")) return true;
                if (s.studentId && x.studentId !== s.studentId) return true;
                if (s.rollNo && x.rollNo !== s.rollNo) return true;
                return false;
              });
              if (prev.length > 0 && next.length === 0) skipNextAutoLoadRef.current = true;
              return next;
            });
          }}
        />
        </>
      )}

      {/* Footer nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 shadow-[0_-2px_12px_-4px_oklch(0.20_0.04_150_/_0.10)]">
        <div className="mx-auto flex max-w-4xl flex-nowrap items-center justify-between gap-2 px-6 sm:px-12 py-1">
          <FooterBtn icon={<Eye className="h-[18px] w-[18px]" />} label="Edit" active={tab === "home"} onClick={() => setTab("home")} />
          <FooterBtn icon={<Home className="h-[18px] w-[18px]" />} label="Home" active={tab === "view"} onClick={() => setTab("view")} />
          <FooterBtn icon={<Settings className="h-[18px] w-[18px]" />} label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
        </div>
      </nav>
    </div>
  );
}

function CollapseCard({ title, badge, defaultOpen = false, children }: { title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-xl border overflow-visible transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${open ? "border-primary glow-expanded" : "border-border bg-card shadow-[var(--shadow-card)]"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 px-3 transition-colors rounded-t-[11px] ${
          open
            ? "py-1.5 bg-[image:var(--gradient-primary)] text-primary-foreground"
            : "py-2.5 bg-card hover:bg-secondary/40"
        }`}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-primary-foreground" : "bg-primary"}`} />
          <h2 className={`text-[11px] font-semibold uppercase tracking-wider ${open ? "text-primary-foreground" : "text-muted-foreground"}`}>{title}</h2>
          {badge != null && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${open ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{badge}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180 text-primary-foreground" : "text-muted-foreground"}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-0 space-y-2.5">{children}</div>}
    </section>
  );
}

function DeletePasswordBody() {
  const [current, setCurrent] = useState<string>(() => getDeletePassword() ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [mobileRoleOn, setMobileRoleOn] = useState(() => getPasswordGloballyEnabled());
  const [show, setShow] = useState(false);

  function toggleMobileRole(val: boolean) {
    setPasswordGloballyEnabled(val);
    setMobileRoleOn(val);
  }

  function save() {
    setMsg("");
    if (pw.length < 4) { setMsg("কমপক্ষে ৪ অক্ষর দিন"); return; }
    if (pw !== pw2) { setMsg("দুটি পাসওয়াড মিলছে না"); return; }
    setDeletePasswordValue(pw);
    setCurrent(pw);
    setPw(""); setPw2("");
    setMsg("✓ পাসওয়াড সেট হয়েছে");
  }
  async function clear() {
    if (!(await requireDeletePassword("Enter current password to clear:"))) return;
    setDeletePasswordValue(null);
    setCurrent("");
    setMsg("Password cleared");
  }

  return (
    <>
      <div className="grid gap-2 grid-cols-2 rounded-md bg-transparent shadow-none focus-within:bg-primary/15 focus-within:ring-2 focus-within:ring-primary/50 focus-within:shadow-[var(--shadow-glow-soft)] focus-within:bg-[image:var(--gradient-glow-radial)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]">
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={current ? "নতুন পাসওয়াড" : "পাসওয়াড"}
            className="w-full rounded-lg border border-input bg-background pl-2.5 pr-8 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-1.5 flex items-center text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="আবার দিন"
            className="w-full rounded-lg border border-input bg-background pl-2.5 pr-8 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-1.5 flex items-center text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95"
        >
          {current ? "Update" : "Set"}
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-[11px] font-medium hover:bg-secondary"
        >
          Clear
        </button>
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1">
          <span className="text-[10px] font-medium text-foreground">Mobile Role</span>
          <span className={`text-[9px] font-semibold ${mobileRoleOn ? "text-primary" : "text-muted-foreground"}`}>
            {mobileRoleOn ? "ON" : "OFF"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={mobileRoleOn}
            aria-label={`Mobile Role password ${mobileRoleOn ? "enabled" : "disabled"}`}
            onClick={() => toggleMobileRole(!mobileRoleOn)}
            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors ${mobileRoleOn ? "bg-primary" : "bg-muted-foreground/40"}`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${mobileRoleOn ? "translate-x-[14px]" : "translate-x-0.5"}`}
            />
          </button>
        </div>
        {msg && (
          <span
            className={`text-[11px] font-medium ${msg.startsWith("✓") ? "text-primary" : "text-destructive"}`}
          >
            {msg}
          </span>
        )}
      </div>
    </>
  );
}

function MyLoginPasswordBody() {
  const [stored, setStored] = useState<string>("");
  const [shown, setShown] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("teacher_passwords")
        .select("password")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data?.password) setStored(data.password);
    })();
  }, []);

  async function save() {
    setMsg("");
    if (pw.length < 6) { setMsg("কমপক্ষে ৬ অক্ষর দিন"); return; }
    if (pw !== pw2) { setMsg("দুটি পাসওয়াড মিলছে না"); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error: aErr } = await supabase.auth.updateUser({ password: pw });
      if (aErr) throw new Error(aErr.message);
      const { error: tErr } = await supabase
        .from("teacher_passwords")
        .upsert({ user_id: u.user.id, password: pw }, { onConflict: "user_id" });
      if (tErr) throw new Error(tErr.message);
      setStored(pw);
      setPw(""); setPw2("");
      setMsg("✓ পাসওয়াড আপডেট হয়েছে");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Current</span>
        <code className="flex-1 truncate rounded bg-secondary/60 px-2 py-1 text-[11px] font-mono">
          {stored ? (shown ? stored : "•".repeat(Math.min(10, stored.length))) : <span className="italic text-muted-foreground">not stored</span>}
        </code>
        {stored && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            className="rounded border border-input bg-background px-2 py-1 text-[11px] hover:bg-secondary"
          >
            {shown ? "Hide" : "Show"}
          </button>
        )}
      </div>
      <div className="grid gap-2 grid-cols-2">
        <input
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="নতুন পাসওয়াড"
          className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="আবার দিন"
          className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "..." : stored ? "Update" : "Set"}
        </button>
        {msg && <span className="text-[10px] text-muted-foreground">{msg}</span>}
      </div>
    </>
  );
}

function FooterBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-20 flex-col items-center justify-center gap-0.5 rounded-lg border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
        active
          ? "border-primary bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]"
          : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-primary hover:border-primary/60"
      }`}
      aria-label={label}
      aria-pressed={active}
    >
      <span className="flex h-[18px] w-[18px] items-center justify-center">{icon}</span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

function ProfileRow({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <div data-row className="flex items-center gap-2 px-2 -mx-2 py-1 rounded-md">
      <span className="text-[13px] font-semibold text-foreground shrink-0 w-28">{label}</span>
      <input
        type={numeric ? "tel" : "text"}
        inputMode={numeric ? "numeric" : undefined}
        pattern={numeric ? "[0-9]*" : undefined}
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)}
        className="flex-1 bg-transparent text-right text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/50 truncate h-6"
        placeholder="—"
      />
      <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
    </div>
  );
}

function PillRow({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "info" | "warn" }) {
  const toneCls =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
      : tone === "info"
        ? "bg-sky-500/15 text-sky-600 border-sky-500/30 dark:text-sky-400"
        : tone === "warn"
          ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400"
          : "bg-secondary text-secondary-foreground border-border";
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/30 px-4 py-2.5">
      <span className="text-xs font-bold text-foreground">{label}</span>
      <span className={`rounded-full border px-3 py-0.5 text-[11px] font-semibold ${toneCls}`}>{value}</span>
    </div>
  );
}

function MoralRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = ["Best", "Better", "Good", "Need Improvement"];
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-3 py-1.5">
      <span className="text-[13px] font-semibold text-foreground">Moral</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-amber-500/40 bg-transparent px-2.5 py-0.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400 outline-none"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o} className="text-foreground bg-background">{o}</option>
        ))}
      </select>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, disabled, primary }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all active:translate-y-px disabled:opacity-50 ${
        primary
          ? "bg-[image:var(--gradient-primary)] text-primary-foreground border-transparent shadow-[var(--shadow-primary)] hover:opacity-95"
          : "border-border bg-secondary/30 text-foreground hover:bg-secondary/60"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SmallField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function ViewTab({
  students,
  filteredStudents,
  subjectList,
  classOptions,
  mode,
  setMode,
  subject,
  setSubject,
  grade,
  setGrade,
  klass,
  setKlass,
  onPick,
  onCreate,
  onDelete,
  onPrintAll,
  busyPrintAll,
  defaultClass,
  defaultYear,
  defaultTerm,
}: {
  students: StudentRecord[];
  filteredStudents: StudentRecord[];
  subjectList: string[];
  classOptions: string[];
  mode: "all" | "byClass" | "topSubject" | "byGrade";
  setMode: (m: "all" | "byClass" | "topSubject" | "byGrade") => void;
  subject: string;
  setSubject: (v: string) => void;
  grade: string;
  setGrade: (v: string) => void;
  klass: string;
  setKlass: (v: string) => void;
  onPick: (s: StudentRecord) => void;
  onCreate: (s: StudentRecord) => void | Promise<void>;
  onDelete: (s: StudentRecord) => void | Promise<void>;
  onPrintAll: () => void | Promise<void>;
  busyPrintAll: boolean;
  defaultClass: string;
  defaultYear: string;
  defaultTerm: string;
}) {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const closeCreate = useCallback(() => setShowCreate(false), []);
  // Subject অনুযায়ী যারা সর্বোচ্চ পেয়েছে — একই সর্বোচ্চ পেলে একাধিক জনও আসবে
  const topInSubject = useMemo(() => {
    if (!subject) return [] as Array<{ s: StudentRecord; mark: number }>;
    let max = -Infinity;
    const rows: Array<{ s: StudentRecord; mark: number }> = [];
    for (const s of students) {
      const sub = s.subjects.find((x) => x.name === subject);
      const v = typeof sub?.obtained === "number" ? sub.obtained : null;
      if (v == null) continue;
      if (v > max) max = v;
      rows.push({ s, mark: v });
    }
    return rows.filter((r) => r.mark === max).sort((a, b) => b.mark - a.mark);
  }, [students, subject]);

  // GPA → letter grade অনুযায়ী লিস্ট
  const byGradeList = useMemo(() => {
    const gpaToGrade = (gpa: number) => {
      if (gpa >= 5) return "A+";
      if (gpa >= 4) return "A";
      if (gpa >= 3.5) return "A-";
      if (gpa >= 3) return "B";
      if (gpa >= 2) return "C";
      if (gpa >= 1) return "D";
      return "F";
    };
    const rows: Array<{ s: StudentRecord; gpa: number; g: string }> = [];
    for (const s of students) {
      let totalGP = 0;
      let count = 0;
      let hasFail = false;
      for (const sub of s.subjects) {
        if (sub.obtained == null) continue;
        const pct = sub.fullMarks ? (sub.obtained / sub.fullMarks) * 100 : 0;
        const g = getGrade(pct);
        const gp = sub.gp ?? g.gp;
        totalGP += gp;
        count += 1;
        if (g.grade === "F") hasFail = true;
      }
      if (!count) continue;
      const gpa = s.gpa ?? totalGP / count;
      const g = hasFail ? "F" : gpaToGrade(gpa);
      rows.push({ s, gpa, g });
    }
    return rows.filter((r) => r.g === grade).sort((a, b) => b.gpa - a.gpa);
  }, [students, grade]);

  const byClassList = useMemo(() => {
    if (!klass) return [] as StudentRecord[];
    const k = klass.toLowerCase();
    return filteredStudents.filter((s) => (s.className || "").toLowerCase() === k);
  }, [filteredStudents, klass]);

  const list: Array<{ s: StudentRecord; meta?: string }> =
    mode === "topSubject"
      ? topInSubject.map((r) => ({ s: r.s, meta: `${subject}: ${r.mark}` }))
      : mode === "byGrade"
        ? byGradeList.map((r) => ({ s: r.s, meta: `GPA ${r.gpa.toFixed(2)}` }))
        : mode === "byClass"
          ? byClassList.map((s) => ({ s, meta: `Roll ${s.rollNo || "—"}` }))
          : filteredStudents.map((s) => ({ s }));

  // Student ID / Roll দিয়ে সার্চ — খালি থাকলে পুরো লিস্ট
  const q = query.trim().toLowerCase();
  const visibleList = q
    ? list.filter(({ s }) => {
        const id = (s.studentId || "").toLowerCase();
        const roll = (s.rollNo || "").toLowerCase();
        const name = (s.studentName || "").toLowerCase();
        return id.includes(q) || roll.includes(q) || name.includes(q);
      })
    : list;

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] space-y-3">
      <div className="grid grid-cols-4 gap-1.5 rounded-lg bg-secondary/40 p-1">
        {(["all", "byClass", "topSubject", "byGrade"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-1 py-1.5 text-[10px] font-semibold transition-all ${
              mode === m
                ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "all" ? "All" : m === "byClass" ? "By Class" : m === "topSubject" ? "Top / Subject" : "By Grade"}
          </button>
        ))}
      </div>

      {mode === "byClass" && (
        <select
          value={klass}
          onChange={(e) => setKlass(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
        >
          <option value="">Select class…</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>Class {c}</option>
          ))}
        </select>
      )}

      {mode === "topSubject" && (
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
        >
          <option value="">Select subject…</option>
          {subjectList.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      )}

      {mode === "byGrade" && (
        <div className="flex flex-wrap gap-1.5">
          {["A+", "A", "A-", "B", "C", "D", "F"].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-all ${
                grade === g
                  ? "bg-[image:var(--gradient-primary)] text-primary-foreground border-primary shadow-[var(--shadow-primary)]"
                  : "bg-background text-foreground border-input hover:bg-secondary"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Search bar — after dropdown */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Student ID, Roll or Name…"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-20 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-[5.25rem] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Search"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md bg-[image:var(--gradient-primary)] px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)]"
        >
          Search
        </button>
      </div>

      {mode === "topSubject" && !subject ? (
        <p className="text-xs text-muted-foreground text-center py-6">Select a subject</p>
      ) : mode === "byClass" && !klass ? (
        <p className="text-xs text-muted-foreground text-center py-6">Select a class</p>
      ) : visibleList.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No students</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {visibleList.map(({ s, meta }, i) => (
            <li key={i} data-row className="bg-card">
              <div className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-secondary/50 transition-colors">
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="flex flex-1 items-center gap-2 min-w-0 text-left"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                    {(s.studentName || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{s.studentName || "—"}</p>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight">
                      Class {s.className || "—"} · Roll {s.rollNo || "—"}
                      {s.exam ? ` · ${s.exam}` : ""}
                      {meta ? ` · ${meta}` : ""}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s)}
                  aria-label="Delete student"
                  className="rounded p-1 text-destructive hover:bg-destructive/10 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="fixed inset-x-4 bottom-[76px] z-40 pointer-events-none flex h-9 items-center justify-between">
        <button
          type="button"
          onClick={() => { void onPrintAll(); }}
          disabled={busyPrintAll || students.length === 0}
          className="pointer-events-auto inline-flex h-9 w-24 shrink-0 items-center justify-center gap-1.5 rounded-full bg-emerald-700 px-4 text-xs font-semibold leading-none text-white shadow-[var(--shadow-primary)] hover:bg-emerald-800 disabled:opacity-50"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="pointer-events-auto inline-flex h-9 w-24 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[image:var(--gradient-primary)] px-4 text-xs font-semibold leading-none text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>
      {showCreate && (
        <CreateStudentModal
          subjectList={subjectList}
          classOptions={classOptions}
          defaultClass={defaultClass}
          defaultYear={defaultYear}
          defaultTerm={defaultTerm}
          onClose={closeCreate}
          onSubmit={async (s) => {
            await onCreate(s);
          }}
        />
      )}
    </section>
  );
}

function CreateStudentModal({
  subjectList,
  classOptions,
  defaultClass,
  defaultYear,
  defaultTerm,
  onClose,
  onSubmit,
}: {
  subjectList: string[];
  classOptions: string[];
  defaultClass: string;
  defaultYear: string;
  defaultTerm: string;
  onClose: () => void;
  onSubmit: (s: StudentRecord) => void | Promise<void>;
}) {
  const [studentName, setStudentName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [klass, setKlass] = useState(defaultClass || "");
  const [exam, setExam] = useState(defaultTerm || "");
  const [year, setYear] = useState(defaultYear || String(new Date().getFullYear()));
  useEffect(() => {
    if (defaultClass && !klass) setKlass(defaultClass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultClass]);
  const [marks, setMarks] = useState<Record<string, { full: string; obt: string }>>(() => {
    const m: Record<string, { full: string; obt: string }> = {};
    for (const n of subjectList) m[n] = { full: String(resolveFullMarks(n, defaultClass)), obt: "" };
    return m;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const savedTimerRef = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const fatherInputRef = useRef<HTMLInputElement | null>(null);
  const motherInputRef = useRef<HTMLInputElement | null>(null);
  const studentIdInputRef = useRef<HTMLInputElement | null>(null);
  const rollInputRef = useRef<HTMLInputElement | null>(null);
  const subjectInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Playgroup/Nursery হলে সব subject-এর full = 50, অন্য ক্লাসে subject-ভিত্তিক ডিফল্ট
  useEffect(() => {
    setMarks((prev) => {
      const next: Record<string, { full: string; obt: string }> = {};
      for (const n of subjectList) {
        const f = String(resolveFullMarks(n, klass));
        next[n] = { full: f, obt: prev[n]?.obt ?? "" };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klass, subjectList]);

  // Mobile/browser Back button → close dialog instead of leaving the page
  useEffect(() => {
    window.history.pushState({ newStudentDialog: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (savedTimerRef.current != null) window.clearTimeout(savedTimerRef.current);
      if (window.history.state && (window.history.state as { newStudentDialog?: boolean } | null)?.newStudentDialog) {
        window.history.back();
      }
    };
  }, [onClose]);

  async function submit() {
    // Collect ALL missing required fields
    const missing: { label: string; focus: () => void }[] = [];
    if (!studentName.trim()) missing.push({ label: "Student name", focus: () => nameInputRef.current?.focus() });
    if (!fatherName.trim()) missing.push({ label: "Father's name", focus: () => fatherInputRef.current?.focus() });
    if (!motherName.trim()) missing.push({ label: "Mother's name", focus: () => motherInputRef.current?.focus() });
    if (!studentId.trim()) missing.push({ label: "Student ID", focus: () => studentIdInputRef.current?.focus() });
    if (!rollNo.trim()) missing.push({ label: "Roll", focus: () => rollInputRef.current?.focus() });
    for (const name of subjectList) {
      const m = marks[name] || { full: "", obt: "" };
      if (String(m.obt).trim() === "") {
        missing.push({ label: `${name} (Obt)`, focus: () => subjectInputRefs.current[name]?.focus() });
      }
    }
    if (!klass.trim()) {
      setMissingFields([]);
      setErr("Settings → Class সিলেক্ট করে Save করুন");
      return;
    }
    if (missing.length > 0) {
      setMissingFields(missing.map((m) => m.label));
      setErr("");
      missing[0].focus();
      return;
    }
    setMissingFields([]);
    setBusy(true);
    setErr("");
    try {
      const subjects: SubjectMark[] = subjectList.map((name) => {
        const def = resolveFullMarks(name, klass);
        const m = marks[name] || { full: String(def), obt: "" };
        const full = isElementaryClass(klass) ? 50 : (Number(m.full) || def);
        const obt = m.obt === "" ? null : Number(m.obt);
        const pct = obt != null && full ? (obt / full) * 100 : null;
        const g = pct != null ? getGrade(pct) : null;
        return {
          name,
          fullMarks: full,
          highestScore: null,
          obtained: obt,
          letterGrade: g?.grade || "",
          gp: g?.gp ?? null,
        };
      });
      const s: StudentRecord = {
        studentName: studentName.trim(),
        fatherName: fatherName.trim(),
        motherName: motherName.trim(),
        studentId: studentId.trim(),
        className: klass.trim(),
        rollNo: rollNo.trim(),
        exam: exam.trim(),
        year: year.trim(),
        group: "",
        sectionPosition: "",
        workingDays: "",
        totalPresent: "",
        moralBehavior: "",
        coCurricular: "",
        comments: "",
        subjects,
        gpa: null,
      };
      await onSubmit(s);
      // Reset form so user can immediately add another student
      setStudentName("");
      setFatherName("");
      setMotherName("");
      setStudentId("");
      setRollNo("");
      setMarks(() => {
        const m: Record<string, { full: string; obt: string }> = {};
        for (const n of subjectList) m[n] = { full: String(resolveFullMarks(n, klass)), obt: "" };
        return m;
      });
      setSaved(`✓ Saved "${s.studentName}". Add another.`);
      if (savedTimerRef.current != null) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(""), 2500);
      nameInputRef.current?.focus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-modal-lock-refresh="true" className="fixed inset-0 z-[80] flex items-start justify-center overflow-hidden overscroll-contain bg-black/40 backdrop-blur-sm px-3 pt-2 pb-3" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[96vh] flex flex-col rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 pt-1.5 pb-1.5 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground">New Student</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <input ref={nameInputRef} autoFocus value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Student name *" className="col-span-2 rounded-lg border border-input bg-background px-2 py-1 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          <input ref={fatherInputRef} value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="Father's name *" className="rounded-lg border border-input bg-background px-2 py-1 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          <input ref={motherInputRef} value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="Mother's name *" className="rounded-lg border border-input bg-background px-2 py-1 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          <input ref={studentIdInputRef} inputMode="numeric" pattern="[0-9]*" value={studentId} onChange={(e) => setStudentId(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Student ID *" className="rounded-lg border border-input bg-background px-2 py-1 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          <input ref={rollInputRef} inputMode="numeric" pattern="[0-9]*" value={rollNo} onChange={(e) => setRollNo(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Roll *" className="rounded-lg border border-input bg-background px-2 py-1 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </div>

        <div className="space-y-1">
          {subjectList.length === 0 && <p className="text-[12px] text-muted-foreground">Set subject list from Settings first.</p>}
          {subjectList.map((name, idx) => {
            const m = marks[name] || { full: "100", obt: "" };
            const isLast = idx === subjectList.length - 1;
            return (
              <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-transparent shadow-none focus-within:bg-primary/15 focus-within:ring-2 focus-within:ring-primary/50 focus-within:shadow-[var(--shadow-glow-soft)] focus-within:bg-[image:var(--gradient-glow-radial)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]">
                <span className="text-[12px] font-medium text-foreground truncate">{name}</span>
                <input
                  inputMode="numeric"
                  value={m.full}
                  disabled
                  tabIndex={-1}
                  aria-label={`${name} full marks`}
                  placeholder="Full"
                  className="w-[56px] cursor-not-allowed rounded-md border border-input bg-secondary/60 px-1 py-0.5 text-[12px] text-center font-semibold text-muted-foreground opacity-100 outline-none"
                />
                <input
                  inputMode="numeric"
                  value={m.obt}
                  ref={(el) => { subjectInputRefs.current[name] = el; }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "") {
                      const val = Number(raw);
                      const full = Number(m.full);
                      if (!isNaN(val) && full > 0 && val > full) {
                        toast.error(`${name}: সর্বোচ্চ ${full} নাম্বার বসানো যাবে`);
                        return;
                      }
                      if (!isNaN(val) && val < 0) {
                        toast.error("নাম্বার ০-এর কম হতে পারবে না");
                        return;
                      }
                    }
                    setMarks((p) => ({ ...p, [name]: { ...p[name], obt: raw } }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && isLast && !busy) {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                      void submit();
                    }
                  }}
                  placeholder="Obt *"
                  max={m.full}
                  className="w-[56px] rounded-md border border-input bg-background px-1 py-0.5 text-[12px] text-center outline-none focus:border-primary"
                />
              </div>
            );
          })}
        </div>

        {missingFields.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
            <p className="text-[12px] font-semibold text-destructive">এই ফিল্ডগুলো পূরণ করুন:</p>
            <p className="text-[11px] text-destructive leading-snug">{missingFields.join(", ")}</p>
          </div>
        )}
        {err && <p className="text-[12px] text-destructive">{err}</p>}
        {saved && <p className="text-[12px] text-primary font-medium">{saved}</p>}
        </div>

        <div className="flex gap-2 border-t border-border bg-card px-3 py-2">
          <button onClick={onClose} className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[12px] font-medium hover:bg-secondary">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-md bg-[image:var(--gradient-primary)] px-2 py-1 text-[12px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 disabled:opacity-60">
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SmallSelect({ label, value, onChange, placeholder, options }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; options: string[] }) {
  return (
    <label className="block">
      {label && <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${label ? "mt-1" : ""} w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 ${value ? "" : "text-muted-foreground"}`}
      >
        <option value="" style={{ fontSize: "8.4px" }}>{placeholder ?? ""}</option>
        {options.map((o) => (
          <option key={o} value={o} style={{ fontSize: "8.4px" }} className="text-foreground">{o}</option>
        ))}
      </select>
    </label>
  );
}

function TinyField({ label, value, onChange, placeholder }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex items-center gap-1">
      {label ? <span className="text-[11px] font-bold text-foreground leading-none shrink-0">{label}</span> : null}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-2 py-0 h-7 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function TinySelect({ label, value, onChange, placeholder, options }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; options: string[] }) {
  return (
    <label className="flex items-center gap-1">
      {label ? <span className="text-[11px] font-bold text-foreground leading-none shrink-0">{label}</span> : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-input bg-background px-2 py-0 h-7 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 ${value ? "" : "text-muted-foreground"}`}
      >
        <option value="" style={{ fontSize: "8.4px" }}>{placeholder ?? ""}</option>
        {options.map((o) => (
          <option key={o} value={o} style={{ fontSize: "8.4px" }} className="text-foreground">{o}</option>
        ))}
      </select>
    </label>
  );
}

function ClassExportPanel({
  classOptions,
  defaultClass,
  defaultYear,
  defaultTerm,
  schoolName,
  schoolAddress,
  customLogo,
  subjectList,
  students: parentStudents = [],
  onBackupDone,
}: {
  classOptions: string[];
  defaultClass: string;
  defaultYear: string;
  defaultTerm: string;
  schoolName: string;
  schoolAddress: string;
  customLogo?: string;
  subjectList: string[];
  students?: StudentRecord[];
  onBackupDone?: () => void;
}) {
  const [cls, setCls] = useState(defaultClass);
  const [yr, setYr] = useState(defaultYear);
  const [busy, setBusy] = useState<"" | "excel">("");
  const [msg, setMsg] = useState("");

  const yearOptions = Array.from({ length: 11 }, (_, i) => String(new Date().getFullYear() - 5 + i));

  async function fetchStudents(): Promise<StudentRecord[]> {
    let q = supabase.from("marksheet_records").select("*").eq("class_name", cls);
    if (yr) q = q.eq("year_session", yr);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || !data.length) return [];
    // Group by student (id+roll)
    const map = new Map<string, StudentRecord>();
    for (const r of data) {
      const key = `${r.student_id || ""}|${r.roll_no || ""}`;
      let s = map.get(key);
      if (!s) {
        s = {
          studentName: r.student_name || "",
          fatherName: r.father_name || "",
          motherName: r.mother_name || "",
          studentId: r.student_id || "",
          className: r.class_name || "",
          rollNo: r.roll_no || "",
          exam: r.exam || "",
          year: r.year_session || "",
          group: "",
          sectionPosition: r.section_position || "",
          workingDays: r.working_days || "",
          totalPresent: r.total_present || "",
          moralBehavior: r.moral_behavior || "",
          coCurricular: r.co_curricular || "",
          comments: r.comments || "",
          subjects: [],
          gpa: r.gpa == null ? null : Number(r.gpa),
        };
        map.set(key, s);
      }
      s.subjects.push({
        name: r.subject,
        fullMarks: isElementaryClass(r.class_name || cls) ? 50 : (r.full_marks != null && Number(r.full_marks) > 0 ? Number(r.full_marks) : getDefaultFullMarks(r.subject)),
        highestScore: r.highest_score == null ? null : Number(r.highest_score),
        obtained: r.obtained_marks == null ? null : Number(r.obtained_marks),
        letterGrade: r.letter_grade || "",
        gp: r.gp == null ? null : Number(r.gp),
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      const ar = parseInt(a.rollNo) || 0;
      const br = parseInt(b.rollNo) || 0;
      return ar - br;
    });
  }

  async function onBackup() {
    if (!cls) { setMsg("Class সিলেক্ট করুন"); return; }
    setBusy("excel"); setMsg("");
    try {
      // Home page students state থেকে directly নাও; না থাকলে DB fallback
      let rows: Array<Record<string, unknown>>;
      if (parentStudents.length > 0) {
        rows = parentStudents.flatMap((s) => {
          const base = {
            student_name: s.studentName, father_name: s.fatherName,
            mother_name: s.motherName, student_id: s.studentId,
            class_name: s.className || cls, roll_no: s.rollNo,
            exam: s.exam, year_session: s.year || yr || null,
            gpa: s.gpa, section_position: s.sectionPosition,
            working_days: s.workingDays, total_present: s.totalPresent,
            moral_behavior: s.moralBehavior, co_curricular: s.coCurricular,
            comments: s.comments,
          };
          if (s.subjects.length === 0) return [{ ...base, subject: "", full_marks: null as unknown as number, highest_score: null, obtained_marks: null, letter_grade: "", gp: null }];
          return s.subjects.map((sub) => ({
            ...base,
            subject: sub.name, full_marks: sub.fullMarks,
            highest_score: sub.highestScore, obtained_marks: sub.obtained,
            letter_grade: sub.letterGrade, gp: sub.gp,
          }));
        });
      } else {
        const { data, error } = await supabase.from("marksheet_records").select("*");
        if (error) throw error;
        rows = (data ?? []) as Array<Record<string, unknown>>;
      }
      if (!rows.length) { setMsg("কোনো ডেটা পাওয়া যায়নি"); return; }
      const studentKeys = new Set<string>();
      for (const r of rows) studentKeys.add(`${r.student_id || ""}|${r.roll_no || ""}`);
      const { error: insErr } = await supabase.from("marksheet_history").insert({
        class_name: cls,
        year_session: yr || null,
        exam: null,
        label: `Backup — ${cls}${yr ? ` · ${yr}` : ""} (${studentKeys.size} students)`,
        row_count: rows.length,
        snapshot: rows as never,
      });
      if (insErr) throw insErr;
      // Keep last 20 backups for this class
      try {
        const { data: keep } = await supabase
          .from("marksheet_history")
          .select("id")
          .eq("class_name", cls)
          .order("created_at", { ascending: false })
          .limit(20);
        const keepIds = (keep || []).map((r: { id: string }) => r.id);
        if (keepIds.length === 20) {
          await supabase
            .from("marksheet_history")
            .delete()
            .eq("class_name", cls)
            .not("id", "in", `(${keepIds.map((i) => `"${i}"`).join(",")})`);
        }
      } catch { /* non-fatal */ }
      setMsg(`✓ Backup History-তে যোগ হয়েছে (${studentKeys.size} students)`);
      onBackupDone?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 grid-cols-2">
        <SmallSelect label="" value={cls} onChange={setCls} placeholder="Class" options={classOptions} />
        <SmallSelect label="" value={yr} onChange={setYr} placeholder="Year" options={yearOptions} />
      </div>
      <button
        type="button"
        disabled={!!busy || !cls}
        onClick={onBackup}
        className="w-full rounded-lg bg-[image:var(--gradient-primary)] px-3 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity disabled:opacity-40"
      >
        {busy === "excel" ? "Backing up..." : "Backup Now"}
      </button>
      {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}
    </div>
  );
}

type HistoryRow = {
  id: string;
  class_name: string;
  year_session: string | null;
  exam: string | null;
  label: string | null;
  row_count: number;
  created_at: string;
  snapshot: Array<Record<string, unknown>>;
};

function HistoryPanel({ classOptions, onRestored, hideRestore, refreshKey = 0 }: { classOptions: string[]; onRestored?: (item: HistoryRow) => void; hideRestore?: boolean; refreshKey?: number }) {
  const { user } = useAuth();
  const [filterClass, setFilterClass] = useState("");
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmItem, setConfirmItem] = useState<HistoryRow | null>(null);

  async function load() {
    setBusy(true); setMsg("");
    try {
      let q = supabase.from("marksheet_history").select("*").order("created_at", { ascending: false }).limit(20);
      if (filterClass) q = q.eq("class_name", filterClass);
      const { data, error } = await q;
      if (error) throw error;
      setItems((data as unknown as HistoryRow[]) || []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterClass, refreshKey]);

  async function downloadExcel(item: HistoryRow) {
    try {
      const rows = item.snapshot || [];
      if (!rows.length) { setMsg("Empty snapshot"); return; }
    // Map DB-style snake_case rows → Excel LONG-format headers so the file
    // can be re-uploaded later through the normal Excel upload flow.
    type Snap = Record<string, unknown>;
    const exportRows = (rows as Snap[]).map((r) => ({
      "Student Name": r.student_name ?? "",
      "Father Name": r.father_name ?? "",
      "Mother Name": r.mother_name ?? "",
      "Student ID": r.student_id ?? "",
      "Class": r.class_name ?? "",
      "Roll No": r.roll_no ?? "",
      "Exam": r.exam ?? "",
      "Year/Session": r.year_session ?? "",
      "Subject": r.subject ?? "",
      "Full Marks": r.full_marks ?? "",
      "Highest Score": r.highest_score ?? "",
      "Obtained Marks": r.obtained_marks ?? "",
      "Letter Grade": r.letter_grade ?? "",
      "GP": r.gp ?? "",
      "GPA": r.gpa ?? "",
      "Section Position": r.section_position ?? "",
      "Working Days": r.working_days ?? "",
      "Total Present": r.total_present ?? "",
      "Moral Behavior": r.moral_behavior ?? "",
      "Co-Curricular": r.co_curricular ?? "",
      "Comments": r.comments ?? "",
    }));
    const headers = [
      "Student Name","Father Name","Mother Name","Student ID","Class","Roll No",
      "Exam","Year/Session","Subject","Full Marks","Highest Score","Obtained Marks",
      "Letter Grade","GP","GPA","Section Position","Working Days","Total Present",
      "Moral Behavior","Co-Curricular","Comments",
    ];
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const stamp = new Date(item.created_at).toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `history-${safe(item.class_name)}-${stamp}.xlsx`;
    const arr = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([arr], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setMsg(`✓ Downloaded ${filename}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function askRestore(item: HistoryRow) {
    setConfirmItem(item);
  }

  async function doRestore(item: HistoryRow) {
    if (!(await requireDeletePassword("Enter password to restore this snapshot:"))) return;
    setConfirmItem(null);
    setBusy(true); setMsg("");
    try {
      // প্রতিটা row-এ uploaded_by যোগ করো — না থাকলে RLS WITH CHECK fail করে
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (item.snapshot as any[]).map((r: any) => ({ ...r, uploaded_by: r.uploaded_by ?? user?.id ?? null }));
      const { error } = await supabase
        .from("marksheet_records")
        .upsert(rows, { onConflict: "student_id,roll_no,class_name,year_session,exam,subject" });
      if (error) throw error;
      setMsg(`✓ Restored ${item.row_count} rows`);
      onRestored?.(item);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(item: HistoryRow) {
    if (!(await requireDeletePassword("Enter password to delete this backup:"))) return;
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.from("marksheet_history").delete().eq("id", item.id);
      if (error) throw error;
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setMsg("✓ Backup deleted");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SmallSelect label="" value={filterClass} onChange={setFilterClass} placeholder="All classes" options={classOptions} />
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-[11px] font-medium hover:bg-secondary transition-colors disabled:opacity-40"
        >
          ↻
        </button>
      </div>
      {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-4">No history</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border max-h-80 overflow-y-auto overscroll-contain touch-pan-y">
          {items.map((it) => {
            const d = new Date(it.created_at);
            const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
            const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            return (
              <li key={it.id} className="bg-card flex items-center gap-1.5 px-2 py-1">
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold truncate leading-tight">
                    Class {it.class_name}
                    {it.exam ? ` · ${it.exam.replace(" Assessment", "").replace(" Term", " Term")}` : ""}
                  </p>
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap leading-tight">
                    · {date} {time} · {it.row_count}r
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadExcel(it)}
                  title="Download Excel"
                  className="rounded-md border border-primary/30 bg-background p-1 text-primary hover:bg-primary/10 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {!hideRestore && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => askRestore(it)}
                    title="Restore"
                    className="rounded-md bg-[image:var(--gradient-primary)] px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity disabled:opacity-40 shrink-0"
                  >
                    Restore →
                  </button>
                )}
                {!hideRestore && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doDelete(it)}
                  title="Delete backup"
                  className="rounded-md border border-destructive/40 bg-background p-1 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmItem(null)}>
          <div className="w-full max-w-sm rounded-xl bg-card border border-border shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">এই Snapshot থেকে Restore করবেন?</h3>
            <div className="text-[12px] space-y-0.5 text-foreground">
              <p><span className="text-muted-foreground">Class:</span> {confirmItem.class_name}</p>
              {confirmItem.exam && <p><span className="text-muted-foreground">Exam:</span> {confirmItem.exam}</p>}
              {confirmItem.year_session && <p><span className="text-muted-foreground">Session:</span> {confirmItem.year_session}</p>}
              <p><span className="text-muted-foreground">Students:</span> {(() => {
                const set = new Set<string>();
                for (const r of (confirmItem.snapshot || []) as Array<Record<string, unknown>>) {
                  const k = `${r.student_id ?? ""}|${r.roll_no ?? ""}|${r.student_name ?? ""}`;
                  if (k !== "||") set.add(k);
                }
                return set.size;
              })()}</p>
              <p><span className="text-muted-foreground">Saved:</span> {new Date(confirmItem.created_at).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">This will overwrite current data.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setConfirmItem(null)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-[12px] font-medium hover:bg-secondary transition-colors">Cancel</button>
              <button type="button" onClick={() => void doRestore(confirmItem)} className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-[12px] font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 transition-opacity">Restore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
