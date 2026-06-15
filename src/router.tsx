/**
 * router.tsx — TanStack Router ও React Query সেটআপ।
 *
 * কেন প্রতিটি request এ নতুন QueryClient তৈরি হয়:
 *   SSR (Server-Side Rendering) এ একটি shared QueryClient থাকলে
 *   এক user এর cached data অন্য user এর response এ চলে যেতে পারে।
 *   তাই প্রতিটি server request এ fresh instance তৈরি করা হয়।
 *
 * কেন defaultPreloadStaleTime: 0:
 *   Link hover করলে TanStack Router preload করে।
 *   staleTime 0 মানে সবসময় fresh data fetch হবে — stale data দেখাবে না।
 */
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

// Auto-generated route tree — src/routes/ folder থেকে তৈরি হয়
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // প্রতিটি request এ নতুন QueryClient — SSR cache isolation এর জন্য
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    // queryClient কে route context এ পাস করা হয় যাতে যেকোনো route ব্যবহার করতে পারে
    context: { queryClient },
    // Browser back/forward এ scroll position restore করার জন্য
    scrollRestoration: true,
    // Preloaded data সবসময় fresh রাখার জন্য
    defaultPreloadStaleTime: 0,
  });

  return router;
};
