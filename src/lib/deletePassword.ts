/**
 * deletePassword.ts — Delete অপারেশনের জন্য password protection।
 *
 * কেন ব্যবহার করা হচ্ছে:
 *   Teacher বা Admin যেন accidentally গুরুত্বপূর্ণ data delete না করতে পারে।
 *   Password localStorage এ রাখা হয় (encrypted নয়) — এটা শুধু
 *   accidental deletion রোধে, security layer নয়।
 *
 * ⚠️ NOTE: Password plain text localStorage এ — sensitive data store করবেন না।
 */
import { promptDialog, alertDialog } from "@/lib/dialog";

// localStorage keys — version suffix দিয়ে future schema changes সহজ হয়
const KEY = "delete_password_v1";
const ROLE_KEY = "app.currentRole";
const ENABLED_KEY = "delete_password_enabled_v1";
const GLOBAL_ENABLED_KEY = "delete_password_global_enabled_v1";

export type PwRole = "super_admin" | "admin" | "teacher";

// Default: সব role এর জন্য password চালু
const DEFAULT_ENABLED: Record<PwRole, boolean> = {
  super_admin: true,
  admin: true,
  teacher: true,
};

/** কোন role এর জন্য password চালু আছে তা পড়া */
export function getPasswordEnabledMap(): Record<PwRole, boolean> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (!raw) return { ...DEFAULT_ENABLED };
    return { ...DEFAULT_ENABLED, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ENABLED };
  }
}

/** নির্দিষ্ট role এর জন্য password on/off করা */
export function setPasswordEnabledForRole(role: PwRole, enabled: boolean) {
  try {
    const map = getPasswordEnabledMap();
    map[role] = enabled;
    localStorage.setItem(ENABLED_KEY, JSON.stringify(map));
  } catch { /* localStorage unavailable হলে silently fail */ }
}

/** সব role এর জন্য global password toggle পড়া */
export function getPasswordGloballyEnabled(): boolean {
  try {
    const raw = localStorage.getItem(GLOBAL_ENABLED_KEY);
    // Default ON — যদি setting না থাকে তাহলে password চালু
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

/** সব role এর জন্য global password on/off করা */
export function setPasswordGloballyEnabled(enabled: boolean) {
  try {
    localStorage.setItem(GLOBAL_ENABLED_KEY, enabled ? "1" : "0");
  } catch { /* ignore */ }
}

/** বর্তমান user এর role localStorage থেকে পড়া */
function getCurrentRole(): PwRole | null {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    if (r === "super_admin" || r === "admin" || r === "teacher") return r;
    return null;
  } catch {
    return null;
  }
}

/** সংরক্ষিত delete password পড়া */
export function getDeletePassword(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Delete password set বা remove করা */
export function setDeletePasswordValue(pw: string | null) {
  try {
    if (pw == null || pw === "") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pw);
  } catch { /* ignore */ }
}

/**
 * Delete অপারেশনের আগে password check করা।
 * Password set না থাকলে বা globally disabled হলে true return করে।
 *
 * @returns true = user proceed করতে পারবে, false = blocked
 */
export async function requireDeletePassword(
  message = "Enter password to continue:"
): Promise<boolean> {
  // Global toggle OFF থাকলে কোনো password জিজ্ঞেস করা হবে না
  if (!getPasswordGloballyEnabled()) return true;

  const stored = getDeletePassword();
  // Password set করা না থাকলে allow
  if (!stored) return true;

  const input = await promptDialog({
    title: "Password required",
    message,
    password: true,
    placeholder: "Password",
    confirmText: "Continue",
  });

  // User cancel করলে block
  if (input === null) return false;

  // Wrong password হলে alert দেখিয়ে block
  if (input !== stored) {
    await alertDialog({
      title: "Incorrect password",
      message: "The password you entered is incorrect.",
    });
    return false;
  }

  return true;
}
