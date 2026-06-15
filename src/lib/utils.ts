/**
 * utils.ts — ছোট হেল্পার ফাংশন।
 * `cn()` Tailwind ক্লাসগুলো একসাথে মার্জ করে কনফ্লিক্ট সরায়।
 * উদা: cn("px-2", condition && "px-4") → "px-4"
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
