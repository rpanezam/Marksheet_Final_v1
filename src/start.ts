/**
 * start.ts — TanStack Start অ্যাপ্লিকেশন instance।
 *
 * কেন দুটো middleware ব্যবহার করা হচ্ছে:
 *
 *   1. attachSupabaseAuth (functionMiddleware):
 *      Client-side থেকে server function call করার সময় Supabase session এর
 *      bearer token automatically request header এ attach করে।
 *      এটা না থাকলে server function গুলো auth context পাবে না।
 *
 *   2. errorMiddleware (requestMiddleware):
 *      Server-side rendering এ unhandled error হলে branded error page দেখায়।
 *      h3 framework এর generic 500 এর বদলে user-friendly message দেখানোর জন্য।
 */
import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// SSR error কে branded error page এ রূপান্তর করার middleware
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // HTTP status code সহ error গুলো (যেমন 404, 401) re-throw করা হয় — এগুলো expected
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // Unexpected error — branded error page দেখানো হয়
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  // Client থেকে server call এ Supabase token attach
  functionMiddleware: [attachSupabaseAuth],
  // SSR error handling
  requestMiddleware: [errorMiddleware],
}));
