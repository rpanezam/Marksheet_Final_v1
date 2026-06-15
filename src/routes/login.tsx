import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import schoolLogo from "@/assets/school-logo.jpg";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — Marksheet Generator" },
      { name: "description", content: "Sign in to access your marksheets." },
    ],
  }),
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signin") {
        const loginEmail = email.includes("@")
          ? email.trim()
          : `${email.trim().toLowerCase()}@teachers.local`;
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
        if (error) throw error;
        const uid = signInData.user?.id;
        if (uid) {
          // Single-session gate: block if an active fresh session already exists for this account.
          const { data: existing } = await supabase
            .from("active_sessions")
            .select("session_id, allow_multi, updated_at")
            .eq("user_id", uid)
            .maybeSingle();
          const FRESH_MS = 90_000; // session is "alive" if heartbeat seen within 90s
          if (existing && !existing.allow_multi) {
            const age = Date.now() - new Date(existing.updated_at).getTime();
            if (age < FRESH_MS) {
              await supabase.auth.signOut();
              throw new Error(
                "এই অ্যাকাউন্টটি অন্য একটি ডিভাইসে এখনো লগইন আছে। সেখান থেকে লগআউট করুন, অথবা অ্যাডমিনের কাছে যান।",
              );
            }
          }
        }
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        // Auto-confirm enabled — try direct sign-in
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setInfo("Account toiri hoyeche. Login korun.");
          setMode("signin");
        } else {
          navigate({ to: "/" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kichu ekta vul hoyeche";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="mt-2 mb-3 flex flex-col items-center">
          <p
            dir="rtl"
            lang="ar"
            className="text-center animate-float bg-clip-text text-transparent bg-[image:var(--gradient-primary)] drop-shadow-sm"
            style={{
              fontFamily: "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', serif",
              fontSize: "1.65rem",
              fontWeight: 700,
              lineHeight: 1.4,
              letterSpacing: "0.01em",
            }}
          >
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>
          <div className="mt-2 flex items-center justify-center gap-2" aria-hidden="true">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-primary/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            <span className="h-2 w-2 rotate-45 bg-primary" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-primary/60" />
          </div>
        </div>
        <div className="flex justify-center mt-2 mb-3">
          <div className="relative animate-float">
            <div className="absolute inset-0 rounded-full bg-[image:var(--gradient-primary)] blur-xl opacity-60 animate-pulse" />
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-md animate-ping" />
            <img
              src={schoolLogo}
              alt="School logo"
              className="relative h-[8.8rem] w-[8.8rem] rounded-full object-cover ring-4 ring-primary/20 shadow-[var(--shadow-primary)]"
            />
          </div>
        </div>
        <form onSubmit={onSubmit} autoComplete="off" className="mt-2 space-y-3">
          <input
            type="text"
            required
            autoFocus
            placeholder="Username"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full cursor-text rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full cursor-text rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}
          {info && <p className="text-xs text-primary">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[image:var(--gradient-primary)] px-3 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setInfo(null);
                }}
                className="text-primary font-medium hover:underline"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                className="text-primary font-medium hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
