/**
 * client.server.ts — সার্ভার-সাইড Supabase অ্যাডমিন ক্লায়েন্ট।
 *
 * কেন service_role key ব্যবহার করা হচ্ছে:
 *   সার্ভার ফাংশন বা admin অপারেশনে RLS bypass করতে হয়।
 *   এই ক্লায়েন্ট শুধুমাত্র সার্ভার সাইডে ব্যবহার করুন —
 *   ক্লায়েন্ট বান্ডেলে এই ফাইল import করা নিরাপদ নয়।
 *
 * ⚠️ SECURITY: service_role key কখনো browser এ expose করবেন না।
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createSupabaseAdminClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Please check your environment configuration.`;
    console.error(`[Supabase Admin] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // সার্ভার সাইডে session বা token persist করার দরকার নেই
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// সার্ভার সিঙ্গেলটন — প্রতিটি request এ নতুন instance তৈরি না করে reuse
let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

/**
 * শুধুমাত্র server-side কোডে ব্যবহার করুন।
 * import করুন এভাবে:
 *   import { supabaseAdmin } from "@/integrations/supabase/client.server";
 */
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
