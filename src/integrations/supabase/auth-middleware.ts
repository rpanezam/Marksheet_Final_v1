/**
 * auth-middleware.ts — Server Function Authorization Middleware।
 *
 * কেন ব্যবহার করা হচ্ছে:
 *   TanStack Start এর server function গুলোতে Supabase bearer token
 *   verify করার জন্য। প্রতিটি protected server call এ এই middleware
 *   Authorization header চেক করে এবং valid user হলেই next() call করে।
 *
 * ⚠️ SECURITY: এই middleware ছাড়া যেকেউ server function call করতে পারবে।
 */
import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    // Environment variables না থাকলে server misconfigured — 500 দেওয়া হয়
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Please check your environment configuration.`;
      console.error(`[Supabase] ${message}`);
      throw new Response(message, { status: 500 });
    }

    const request = getRequest();

    // Request object না থাকলে auth করা সম্ভব নয়
    if (!request?.headers) {
      throw new Response('Unauthorized: No request headers available', { status: 401 });
    }

    // Bearer token extract করা — "Bearer <token>" format এ আসে
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      throw new Response('Unauthorized: No authorization header provided', { status: 401 });
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Response('Unauthorized: Only Bearer tokens are supported', { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Response('Unauthorized: No token provided', { status: 401 });
    }

    // Token দিয়ে Supabase client তৈরি করা — এই client টা user এর permission দিয়ে কাজ করবে
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Token verify করা — invalid হলে 401
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Response('Unauthorized: Invalid token', { status: 401 });
    }

    if (!data.claims.sub) {
      throw new Response('Unauthorized: No user ID found in token', { status: 401 });
    }

    // Verified user context পরবর্তী handler এ পাস করা হচ্ছে
    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  }
);
