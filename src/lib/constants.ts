/**
 * constants.ts — App-wide shared constants
 * এখানে magic strings ও duplicate arrays একবারই define করা আছে।
 */

// Supabase app_settings table এর key names
export const APP_SETTINGS_KEYS = {
  SCHOOL: "school",
  SUBJECTS_GLOBAL: "subjects_global",
  GLOBAL_YEAR_TERM: "global_year_term",
} as const;

// সকল class এর ordered list — একবারই define, সব জায়গায় import করে ব্যবহার
export const ALL_CLASSES = [
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
] as const;

export type ClassName = (typeof ALL_CLASSES)[number];
