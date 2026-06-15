/**
 * error-capture.ts — সার্ভার সাইডে এরর ধরে রাখার মেকানিজম।
 *
 * কেন এটা দরকার:
 *   TanStack Start / h3 framework অনেক সময় throw হওয়া error কে
 *   generic 500 Response এ পরিণত করে — ফলে আসল stack trace হারিয়ে যায়।
 *   এই ফাইল global error event listen করে শেষ error টি মেমরিতে রাখে,
 *   যাতে server.ts সেটা পরে user-friendly error page এ দেখাতে পারে।
 *
 * TTL (Time To Live): 5 সেকেন্ড — এর পর error টি বাতিল হয়ে যায়।
 */

let lastCapturedError: { error: unknown; at: number } | undefined;

// ৫ সেকেন্ডের বেশি পুরনো error দেখানো অর্থহীন
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// শুধুমাত্র সার্ভার environment এ (globalThis.addEventListener available থাকলে) listen করা হয়
if (typeof globalThis.addEventListener === "function") {
  // Synchronous error capture
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  // Async/Promise rejection capture
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

/**
 * একবার পড়লেই error টি মেমরি থেকে মুছে যায় (consume pattern)।
 * TTL পার হলে undefined return করে।
 */
export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;

  // TTL পার হয়ে গেলে stale error দেখানো ঠিক না
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }

  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
