/**
 * client.ts — Supabase ক্লায়েন্ট সিঙ্গেলটন।
 *
 * কেন Proxy ব্যবহার করা হচ্ছে:
 *   SSR (Server-Side Rendering) এ `window` বা `localStorage` নেই।
 *   Proxy দিয়ে lazy initialization করা হয় যাতে শুধুমাত্র ব্রাউজারে
 *   প্রথমবার ব্যবহারের সময় createClient() কল হয় — SSR এ নয়।
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createSupabaseClient() {
  // Vite build-time এ VITE_* variables bake হয়; SSR fallback এ process.env ব্যবহার হয়
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Please check your environment configuration.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      // ব্রাউজারে localStorage এ session persist করা হয়; SSR এ undefined (কোনো storage নেই)
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// একটিমাত্র instance — বারবার createClient() ডাকা হলে connection leak হতে পারে
let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

/**
 * import করুন এভাবে:
 *   import { supabase } from "@/integrations/supabase/client";
 */
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
