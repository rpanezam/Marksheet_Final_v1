/**
 * ============================================================
 * excel-parser.ts — Excel (.xlsx) ফাইল পড়া ও স্যাম্পল টেমপ্লেট তৈরি
 * ============================================================
 * ব্যবহারকারী Excel আপলোড করলে এই ফাইলের `parseStudentsFromFile`
 * ফাংশন প্রতিটি রো পড়ে StudentRecord অবজেক্টে রূপান্তর করে।
 *
 * Excel ফরম্যাট: এক রো = এক (স্টুডেন্ট, সাবজেক্ট) জোড়া। তাই একই
 * স্টুডেন্টের ৮-১০টা সাবজেক্ট মানে ৮-১০টি রো, যেগুলো Student ID
 * দিয়ে গ্রুপ করে এক স্টুডেন্ট রেকর্ডে জোড়া হয়।
 *
 * `downloadSampleExcel` ফাংশনটি ব্যবহারকারীকে একটা রেডিমেড টেমপ্লেট
 * দেয় যাতে তারা সঠিক কলাম অর্ডার ও ফরম্যাট দেখে নিজেদের ডেটা পূরণ
 * করতে পারে।
 */

import * as XLSX from "xlsx";
import { getDefaultFullMarks, resolveFullMarks, isElementaryClass, type StudentRecord, type SubjectMark } from "./marksheet-types";

/**
 * Excel format (long): one row per (student, subject).
 * Columns: Student Name | Father Name | Mother Name | Student ID | Class |
 *          Roll No | Exam | Year/Session | Subject | Full Marks |
 *          Highest Score | Obtained Marks | Letter Grade | GP | GPA
 *
 * Optional extra columns (for marksheet extras, same value per student row):
 *   Group, Section Position, Working Days, Total Present,
 *   Moral Behavior, Co-Curricular, Comments
 */

// যেকোনো সেল ভ্যালুকে নাম্বারে কনভার্ট — খালি/ভুল হলে null
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// যেকোনো সেল ভ্যালুকে স্ট্রিংয়ে কনভার্ট ও স্পেস ট্রিম
function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/**
 * একই কলামের একাধিক বানান ট্রাই করে — যেমন "Student ID"
 * না পেলে "StudentID" দেখে। কেস ও স্পেসও ইগনোর করে।
 * কারণ: ব্যবহারকারীরা Excel-এ অনেক সময় হেডার একটু ভিন্ন রাখে।
 */
function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] !== "" && row[k] !== null && row[k] !== undefined) {
      return row[k];
    }
  }
  // Case/space-insensitive fallback
  const norm = (s: string) => s.toLowerCase().replace(/[\s_/]+/g, "");
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(norm(k), row[k]);
  for (const k of keys) {
    const v = map.get(norm(k));
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/**
 * আপলোড করা Excel ফাইল পড়ে সব স্টুডেন্টের লিস্ট রিটার্ন করে।
 * একই Student ID-র সব রো (প্রতিটি সাবজেক্টের জন্য) একসাথে গ্রুপ
 * করে একটি StudentRecord তৈরি করা হয়।
 */
export async function parseStudentsFromFile(file: File): Promise<StudentRecord[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (!rows.length) return [];

  // Detect format: WIDE = one row per student, subject columns inline.
  // LONG = one row per (student, subject) with a "Subject" column.
  const headerKeys = Object.keys(rows[0]);
  const hasSubjectCol = headerKeys.some((k) => k.toLowerCase().replace(/\s+/g, "") === "subject");

  if (!hasSubjectCol) {
    return parseWide(rows, headerKeys);
  }

  // Group by Student ID (fallback: Class+RollNo, then Student Name)
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const id = str(pick(row, "Student ID", "StudentID"));
    const cls = str(pick(row, "Class"));
    const roll = str(pick(row, "Roll No", "RollNo"));
    const name = str(pick(row, "Student Name", "StudentName"));
    const key = id || `${cls}|${roll}` || name;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const students: StudentRecord[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    const cls = str(pick(first, "Class"));
    const subjects: SubjectMark[] = group
      .map((r): SubjectMark | null => {
        const name = str(pick(r, "Subject"));
        if (!name) return null;
        return {
          name,
          fullMarks: isElementaryClass(cls)
            ? 50
            : (num(pick(r, "Full Marks", "FullMarks")) ?? getDefaultFullMarks(name)),
          highestScore: num(pick(r, "Highest Score", "HighestScore")),
          obtained: num(pick(r, "Obtained Marks", "ObtainedMarks")),
          letterGrade: str(pick(r, "Letter Grade", "LetterGrade")),
          gp: num(pick(r, "GP")),
        };
      })
      .filter((s): s is SubjectMark => s !== null);

    // GPA — take first non-null seen across rows
    let gpa: number | null = null;
    for (const r of group) {
      const g = num(pick(r, "GPA"));
      if (g !== null) {
        gpa = g;
        break;
      }
    }

    students.push({
      studentName: str(pick(first, "Student Name", "StudentName")),
      fatherName: str(pick(first, "Father Name", "FatherName")),
      motherName: str(pick(first, "Mother Name", "MotherName")),
      studentId: str(pick(first, "Student ID", "StudentID")),
      className: str(pick(first, "Class")),
      rollNo: str(pick(first, "Roll No", "RollNo")),
      exam: str(pick(first, "Exam")),
      year: str(pick(first, "Year/Session", "Year")),
      group: str(pick(first, "Group")) || "N/A",
      sectionPosition: str(pick(first, "Section Position", "SectionPosition")),
      workingDays: str(pick(first, "Working Days", "WorkingDays")),
      totalPresent: str(pick(first, "Total Present", "TotalPresent")),
      moralBehavior: str(pick(first, "Moral Behavior", "MoralBehavior")),
      coCurricular: str(pick(first, "Co-Curricular", "CoCurricular")),
      comments: str(pick(first, "Comments")),
      subjects,
      gpa,
    });
  }
  return students;
}

// Known meta columns in WIDE format — anything else is treated as a subject column.
const META_KEYS = new Set(
  [
    "studentname", "student", "fathername", "father", "mothername", "mother",
    "studentid", "id", "class", "classname", "rollno", "roll", "rollnumber",
    "exam", "yearsession", "year", "session", "group",
    "sectionposition", "workingdays", "totalpresent",
    "moralbehavior", "cocurricular", "comments", "gpa",
  ].map((s) => s.toLowerCase()),
);

function normKey(k: string): string {
  return k.toLowerCase().replace(/[\s_/-]+/g, "");
}

/**
 * WIDE ফরম্যাট পার্সার — এক রো = এক স্টুডেন্ট। প্রতিটি সাবজেক্ট
 * একটি কলামে obtained marks হিসেবে থাকে। মেটা কলাম বাদ দিয়ে
 * বাকি সব কলাম সাবজেক্ট হিসাবে নেয়া হয়।
 */
function parseWide(
  rows: Record<string, unknown>[],
  headerKeys: string[],
): StudentRecord[] {
  const subjectHeaders = headerKeys.filter((k) => !META_KEYS.has(normKey(k)));
  const out: StudentRecord[] = [];
  for (const r of rows) {
    const name = str(pick(r, "Student Name", "StudentName", "Student"));
    const cls = str(pick(r, "Class", "ClassName"));
    const roll = str(pick(r, "Roll No", "RollNo", "Roll", "Roll Number"));
    if (!name && !roll) continue;
    const subjects: SubjectMark[] = subjectHeaders.map((h) => ({
      name: h,
      fullMarks: resolveFullMarks(h, cls),
      highestScore: null,
      obtained: num(r[h]),
      letterGrade: "",
      gp: null,
    }));
    out.push({
      studentName: name,
      fatherName: str(pick(r, "Father Name", "FatherName", "Father")),
      motherName: str(pick(r, "Mother Name", "MotherName", "Mother")),
      studentId: str(pick(r, "Student ID", "StudentID", "ID")),
      className: cls,
      rollNo: roll,
      exam: str(pick(r, "Exam")),
      year: str(pick(r, "Year/Session", "Year", "Session")),
      group: str(pick(r, "Group")) || "N/A",
      sectionPosition: str(pick(r, "Section Position", "SectionPosition")),
      workingDays: str(pick(r, "Working Days", "WorkingDays")),
      totalPresent: str(pick(r, "Total Present", "TotalPresent")),
      moralBehavior: str(pick(r, "Moral Behavior", "MoralBehavior")),
      coCurricular: str(pick(r, "Co-Curricular", "CoCurricular")),
      comments: str(pick(r, "Comments")),
      subjects,
      gpa: num(pick(r, "GPA")),
    });
  }
  return out;
}

/**
 * ব্যবহারকারীর ব্রাউজারে স্যাম্পল Excel টেমপ্লেট ডাউনলোড করায়।
 * customSubjects দিলে তা ব্যবহার করবে, না দিলে ডিফল্ট সাবজেক্ট
 * তালিকা দিয়ে নমুনা ডেটা পূরণ করে।
 */
/**
 * WIDE স্যাম্পল টেমপ্লেট — এক রো = এক স্টুডেন্ট। ডিফল্ট কলাম:
 * Student Name, Father Name, Mother Name, Class, Roll No,
 * তারপর সিলেক্টেড সাবজেক্টগুলো প্রতিটি একটি কলাম হিসাবে।
 * className দিলে সব নমুনা রো-তে সেই ক্লাস বসানো হয়।
 */
export function downloadSampleExcel(
  customSubjects?: string[],
  className?: string,
  meta?: { exam?: string; term?: string; year?: string; school?: string },
) {
  const subjects =
    customSubjects && customSubjects.length
      ? customSubjects
      : [
          "Bangla 1st", "Bangla 2nd", "English 1st", "English 2nd",
          "Mathematics", "Religion", "General Science",
          "BD & Global Studies", "Agriculture", "ICT",
        ];

  const headers = [
    "Student Name", "Father Name", "Mother Name", "Class", "Roll No",
    ...subjects,
  ];

  const cls = (className && className.trim()) || "SIX-Day-A";

  const sample = [
    {
      "Student Name": "ASRAFUL KHAN APON",
      "Father Name": "MD SHAJAHAN KHAN",
      "Mother Name": "AFROZA AKTER",
      "Class": cls,
      "Roll No": 1,
    },
    {
      "Student Name": "",
      "Father Name": "",
      "Mother Name": "",
      "Class": cls,
      "Roll No": "",
    },
  ].map((base) => {
    const row: Record<string, unknown> = { ...base };
    for (const s of subjects) row[s] = "";
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  const safe = (s?: string) => (s || "").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const parts = [
    safe(cls),
    safe(meta?.exam),
    safe(meta?.term),
    safe(meta?.school),
    safe(meta?.year),
  ].filter(Boolean);
  const fname = parts.length
    ? `marksheet-template-${parts.join("-")}.xlsx`
    : "marksheet-template.xlsx";
  XLSX.writeFile(wb, fname);
}
