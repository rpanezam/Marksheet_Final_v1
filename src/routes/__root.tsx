/**
 * routes/__root.tsx — পুরো অ্যাপের রুট লেআউট।
 *
 * দায়িত্ব:
 *  1. HTML shell (<html>/<head>/<body>) তৈরি করা — SSR-এর জন্য প্রয়োজন
 *  2. SEO meta ট্যাগ, manifest, app icon সেট করা
 *  3. React Query Provider বসানো যাতে যেকোনো রুট ক্যাশ ব্যবহার করতে পারে
 *  4. শুরুতে SplashScreen দেখানো এবং তারপর আসল রুট (Outlet) রেন্ডার করা
 *  5. 404 (NotFound) ও crash (ErrorComponent) হ্যান্ডল করা
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { SplashScreen } from "@/components/SplashScreen";
import { AuthProvider } from "@/lib/auth-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "As-Sunnah" },
      {
        name: "description",
        content:
          "Generate personalized marksheets from Excel data and download them as a single PDF.",
      },
      { name: "author", content: "As-Sunnah" },
      { property: "og:title", content: "As-Sunnah" },
      {
        property: "og:description",
        content:
          "Generate personalized marksheets from Excel data and download them as a single PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "As-Sunnah" },
      {
        name: "twitter:description",
        content:
          "Generate personalized marksheets from Excel data and download them as a single PDF.",
      },
      { name: "theme-color", content: "#0f7a3a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "As-Sunnah" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // একই ব্রাউজার সেশনে একবারই বিসমিল্লাহ বাজবে — reload হলেও আর বাজবে না।
    try {
      if (sessionStorage.getItem("bismillah-played") === "1") return;
    } catch {}
    // Browsers block autoplay-with-sound until the page receives a user gesture.
    // Strategy: try to play immediately; if blocked, attach robust one-shot
    // listeners on every common gesture so the very first tap/click/key plays it.
    const audio = new Audio("/audio/bismillah.mp3");
    audio.preload = "auto";
    audio.volume = 1;
    let played = false;

    const tryPlay = () => {
      if (played) return;
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          played = true;
          try {
            sessionStorage.setItem("bismillah-played", "1");
          } catch {}
          cleanup();
        }).catch(() => {});
      }
    };

    const events = ["pointerdown", "click", "touchstart", "keydown", "mousedown"] as const;
    const onGesture = () => {
      tryPlay();
    };

    const cleanup = () => {
      events.forEach((ev) => {
        window.removeEventListener(ev, onGesture, true);
        document.removeEventListener(ev, onGesture, true);
      });
    };

    // Attempt immediate playback (may succeed if user navigated via interaction)
    tryPlay();

    // Fallback: bind on capture phase so we still catch the gesture even if
    // overlays (e.g. splash screen) call stopPropagation.
    events.forEach((ev) => {
      window.addEventListener(ev, onGesture, true);
      document.addEventListener(ev, onGesture, true);
    });

    return cleanup;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SplashScreen />
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
