import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "teacher";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  assignedClasses: string[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_ID_KEY = "app.activeSessionId";

function newSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rolesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localSessionIdRef = useRef<string | null>(null);
  const uidRef = useRef<string | null>(null);
  const forcedOutRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadRole(uid: string) {
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    const roles = (roleRows ?? []).map((r) => r.role as AppRole);
    const next: AppRole | null = roles.includes("super_admin")
      ? "super_admin"
      : roles.includes("admin")
        ? "admin"
        : roles.includes("teacher")
          ? "teacher"
          : null;
    setRole(next);
    try {
      if (typeof window !== "undefined") {
        if (next) localStorage.setItem("app.currentRole", next);
        else localStorage.removeItem("app.currentRole");
      }
    } catch {}
    if (next === "teacher") {
      const { data: cls } = await supabase
        .from("teacher_classes")
        .select("class_name")
        .eq("user_id", uid);
      setAssignedClasses((cls ?? []).map((c) => c.class_name));
    } else {
      setAssignedClasses([]);
    }
  }

  async function registerSession(uid: string) {
    let sid = localStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = newSessionId();
      localStorage.setItem(SESSION_ID_KEY, sid);
    }
    localSessionIdRef.current = sid;
    // Multi-device login enabled for all roles
    await supabase
      .from("active_sessions")
      .upsert(
        { user_id: uid, session_id: sid, allow_multi: true },
        { onConflict: "user_id" },
      );
  }

  async function checkSessionStillActive(uid: string, knownDeleted = false) {
    const sid = localSessionIdRef.current;
    if (!sid) return;
    if (knownDeleted) {
      // Admin explicitly released this session (realtime DELETE event).
      forcedOutRef.current = true;
      localStorage.removeItem(SESSION_ID_KEY);
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        alert("আপনার সেশনটি অ্যাডমিন কর্তৃক রিলিজ করা হয়েছে। আপনি লগআউট হয়ে গেছেন।");
      }
    }
  }

  function subscribeToSession(uid: string) {
    if (sessionChannelRef.current) {
      void supabase.removeChannel(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }
    const ch = supabase
      .channel(`active_sessions:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "active_sessions", filter: `user_id=eq.${uid}` },
        (payload) => {
          const isDelete = payload.eventType === "DELETE";
          void checkSessionStillActive(uid, isDelete);
        },
      )
      .subscribe();
    sessionChannelRef.current = ch;
  }

  function subscribeToRoles(uid: string) {
    if (rolesChannelRef.current) {
      void supabase.removeChannel(rolesChannelRef.current);
      rolesChannelRef.current = null;
    }
    const ch = supabase
      .channel(`user_roles:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${uid}` },
        () => { void loadRole(uid); },
      )
      .subscribe();
    rolesChannelRef.current = ch;
  }

  function teardownSession() {
    if (sessionChannelRef.current) {
      void supabase.removeChannel(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }
    if (rolesChannelRef.current) {
      void supabase.removeChannel(rolesChannelRef.current);
      rolesChannelRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    localSessionIdRef.current = null;
    uidRef.current = null;
  }

  function startHeartbeat() {
    if (heartbeatRef.current) return;
    heartbeatRef.current = setInterval(async () => {
      const uid = uidRef.current;
      const sid = localSessionIdRef.current;
      if (!uid || !sid) return;
      // Touch updated_at so other devices know this session is still alive
      const { error } = await supabase
        .from("active_sessions")
        .update({ session_id: sid })
        .eq("user_id", uid)
        .eq("session_id", sid);
      if (error) {
        console.warn("Session heartbeat failed:", error.message);
      }
    }, 30_000);
  }

  useEffect(() => {
    // Set up listener FIRST (per Supabase guidance), then fetch session
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const uid = s.user.id;
        uidRef.current = uid;
        // Defer Supabase calls to avoid deadlocks inside the listener
        setTimeout(() => {
          void loadRole(uid);
          void registerSession(uid).then(() => {
            subscribeToSession(uid);
            subscribeToRoles(uid);
            startHeartbeat();
            void checkSessionStillActive(uid);
          });
        }, 0);
      } else {
        setRole(null);
        setAssignedClasses([]);
        try { if (typeof window !== "undefined") localStorage.removeItem("app.currentRole"); } catch {}
        teardownSession();
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        const uid = data.session.user.id;
        uidRef.current = uid;
        await loadRole(uid);
        await registerSession(uid);
        subscribeToSession(uid);
        subscribeToRoles(uid);
        startHeartbeat();
        void checkSessionStillActive(uid);
      }
      setLoading(false);
    });

    // Periodic safety check in case realtime drops
    const poll = setInterval(() => {
      const uid = localSessionIdRef.current ? uidRef.current : null;
      if (uid) {
        void loadRole(uid);
      }
    }, 20000);

    const onFocus = () => {
      const uid = uidRef.current;
      if (uid) {
        void loadRole(uid);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
      window.addEventListener("visibilitychange", onFocus);
    }

    return () => {
      sub.subscription.unsubscribe();
      clearInterval(poll);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("visibilitychange", onFocus);
      }
      teardownSession();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      role,
      assignedClasses,
      loading,
      signOut: async () => {
        if (user) {
          // Clear our claim so other devices aren't accidentally bumped
          await supabase.from("active_sessions").delete().eq("user_id", user.id);
        }
        localStorage.removeItem(SESSION_ID_KEY);
        teardownSession();
        await supabase.auth.signOut();
      },
      refreshRole: async () => {
        if (user) await loadRole(user.id);
      },
    }),
    [user, session, role, assignedClasses, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}