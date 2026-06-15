/**
 * ============================================================
 * marksheet-types.ts — মার্কশিটের সকল ডেটা টাইপ ও গ্রেডিং স্কেল
 * ============================================================
 * এই ফাইলে পুরো অ্যাপের "ডেটা মডেল" ডিফাইন করা আছে — অর্থাৎ একজন
 * স্টুডেন্ট, একটি সাবজেক্ট ও স্কুলের তথ্য কেমন আকারে থাকবে।
 *
 * কেন আলাদা ফাইল?
 *  - Excel parser, PDF generator আর React কম্পোনেন্ট — তিন জায়গা
 *    থেকেই একই টাইপ ব্যবহার করা হয়। তাই এক জায়গায় রাখলে পরিবর্তন
 *    করতে সুবিধা।
 *  - GRADE_SCALE ও getGrade() ফাংশন এখানে রাখা হয়েছে যেন নাম্বার
 *    থেকে A+, A, A- ইত্যাদি গ্রেড বের করা সব জায়গায় একই রকম হয়।
 */

// একটি সাবজেক্টের নাম্বার রাখার স্ট্রাকচার (Bangla 1st, English 1st...)
export interface SubjectMark {
  name: string;
  fullMarks: number;
  highestScore: number | null;
  obtained: number | null;
  letterGrade: string;
  gp: number | null;
}

// একজন স্টুডেন্টের সম্পূর্ণ মার্কশিট ডেটা (পার্সোনাল + সব সাবজেক্টের নাম্বার)
export interface StudentRecord {
  studentName: string;
  fatherName: string;
  motherName: string;
  studentId: string;
  className: string;
  rollNo: string;
  exam: string;
  year: string;
  group: string;
  sectionPosition: string;
  workingDays: string;
  totalPresent: string;
  moralBehavior: string; // e.g. "Best" | "Better" | "Good" | "Need Improvement"
  coCurricular: string; // comma separated
  comments: string;
  subjects: SubjectMark[];
  gpa: number | null;
  grade?: string;
  // Optional per-term marks for multi-term marksheet rendering.
  // Keys: "1st" | "2nd" | "3rd". Values: subject name -> { fullMarks, obtained, grade }
  termsData?: Record<
    string,
    Record<string, { fullMarks: number; obtained: number | null; grade: string }>
  >;
}

// স্কুলের নাম ও ঠিকানা — মার্কশিটের হেডারে ব্যবহার হয়
export interface SchoolInfo {
  name: string;
  address: string;
  /** Font family for the school name. "blackletter" = Old English (UnifrakturMaguntia). Defaults to "times". */
  font?: "times" | "helvetica" | "courier" | "blackletter";
  /** Font size (pt) for the "ACADEMIC TRANSCRIPT" pill title. */
  transcriptFontSize?: number;
  /** Font family for the "ACADEMIC TRANSCRIPT" pill title. Defaults to the school name font. */
  transcriptFont?: "times" | "helvetica" | "courier" | "blackletter";
}

// ডিফল্ট সাবজেক্ট লিস্ট — Excel না থাকলে বা নতুন স্টুডেন্ট তৈরি করলে এগুলোই দেখাবে
export const DEFAULT_SUBJECTS = [
  "Bengali",
  "Bengali 1st Paper",
  "Bengali 2nd Paper",
  "English",
  "English 1st Paper",
  "English 2nd Paper",
  "Math",
  "Arabic",
  "Arabic 1st Paper",
  "Arabic 2nd Paper",
  "General Science",
  "Bangladesh and Global Studies",
  "Akaied and Fiqh",
  "Quran Mazid",
  "Kalima, Masyala and Hadith",
  "Information and Communications Technology",
  "Agricultural Studies",
  "Arabic Spoken",
  "English Spoken",
];

// সাবজেক্ট অনুযায়ী ডিফল্ট ফুল মার্ক — না থাকলে 100 ধরা হবে
export const DEFAULT_SUBJECT_FULL_MARKS: Record<string, number> = {
  "Bengali 2nd Paper": 50,
  "English 2nd Paper": 50,
  "Arabic 2nd Paper": 50,
  "Kalima, Masyala and Hadith": 50,
  "Information and Communications Technology": 50,
  "Agricultural Studies": 50,
  "Arabic Spoken": 50,
  "English Spoken": 50,
};

export function getDefaultFullMarks(subject: string): number {
  if (DEFAULT_SUBJECT_FULL_MARKS[subject] != null) return DEFAULT_SUBJECT_FULL_MARKS[subject];
  // Case/whitespace-insensitive fallback so variants like "English spoken"
  // or "english  spoken" still resolve to the correct default (50).
  const norm = subject.trim().toLowerCase().replace(/\s+/g, " ");
  for (const key of Object.keys(DEFAULT_SUBJECT_FULL_MARKS)) {
    if (key.toLowerCase().replace(/\s+/g, " ") === norm) {
      return DEFAULT_SUBJECT_FULL_MARKS[key];
    }
  }
  return 100;
}

/**
 * Playgroup ও Nursery ক্লাসের জন্য আলাদা logic — এই দুই ক্লাসে যেই
 * subject-ই হোক, ফুল মার্ক সবসময় 50। main marks logic থেকে আলাদা।
 */
export function isElementaryClass(className?: string | null): boolean {
  const c = (className || "").trim().toLowerCase();
  return c === "playgroup" || c === "nursery";
}

/**
 * Playgroup/Nursery হলে সবসময় 50 রিটার্ন করে, অন্যথায় subject-ভিত্তিক
 * ডিফল্ট ফুল মার্ক বের করে। main logic অপরিবর্তিত।
 */
export function resolveFullMarks(subject: string, className?: string | null): number {
  if (isElementaryClass(className)) return 50;
  return getDefaultFullMarks(subject);
}

// বাংলাদেশের সাধারণ গ্রেডিং স্কেল — পার্সেন্টেজ অনুযায়ী লেটার গ্রেড ও GP
export const GRADE_SCALE: Array<{ min: number; max: number; grade: string; gp: number }> = [
  { min: 80, max: 100, grade: "A+", gp: 5.0 },
  { min: 70, max: 79.99, grade: "A", gp: 4.0 },
  { min: 60, max: 69.99, grade: "A-", gp: 3.5 },
  { min: 50, max: 59.99, grade: "B", gp: 3.0 },
  { min: 40, max: 49.99, grade: "C", gp: 2.0 },
  { min: 33, max: 39.99, grade: "D", gp: 1.0 },
  { min: 0, max: 32.99, grade: "F", gp: 0.0 },
];

/**
 * পার্সেন্টেজ থেকে গ্রেড ও GP বের করার ইউটিলিটি।
 * উদাহরণ: 85% → { grade: "A+", gp: 5.0 }
 */
export function getGrade(percentage: number): { grade: string; gp: number } {
  for (const row of GRADE_SCALE) {
    if (percentage >= row.min && percentage <= row.max) {
      return { grade: row.grade, gp: row.gp };
    }
  }
  return { grade: "F", gp: 0 };
}
