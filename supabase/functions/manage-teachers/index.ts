import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://marksheet.as-sunnah-madrasah.org",
  "https://bdbotz24-e7f92.web.app",
  "https://bdbotz24-e7f92.firebaseapp.com",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]; // fallback to production domain
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", user.id);

    const isAdmin = (roles ?? []).some(r => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const { action } = body;

    if (action === "list") {
      const { data: teacherRoles } = await supabaseAdmin
        .from("user_roles").select("user_id, role").in("role", ["teacher", "admin"]);
      const rows = teacherRoles ?? [];
      if (rows.length === 0) return json({ teachers: [] });

      const userIds = rows.map(r => r.user_id);

      // Batch fetch classes and passwords — 2 queries instead of 2×N
      const [{ data: allClasses }, { data: allPasswords }] = await Promise.all([
        supabaseAdmin.from("teacher_classes").select("user_id, class_name").in("user_id", userIds),
        supabaseAdmin.from("teacher_passwords").select("user_id, password").in("user_id", userIds),
      ]);

      const classMap: Record<string, string[]> = {};
      for (const c of (allClasses ?? [])) {
        if (!classMap[c.user_id]) classMap[c.user_id] = [];
        classMap[c.user_id].push(c.class_name);
      }
      const passwordMap: Record<string, string> = {};
      for (const p of (allPasswords ?? [])) {
        if (p.password) passwordMap[p.user_id] = p.password;
      }

      // Fetch auth users in parallel (N calls but concurrent, not sequential)
      const authResults = await Promise.all(
        rows.map(r => supabaseAdmin.auth.admin.getUserById(r.user_id))
      );

      const teachers = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const au = authResults[i].data;
        if (au?.user) teachers.push({
          id: r.user_id,
          email: au.user.email,
          username: au.user.user_metadata?.username ?? au.user.email,
          classes: classMap[r.user_id] ?? [],
          password: passwordMap[r.user_id] ?? "",
          role: r.role,
        });
      }
      return json({ teachers });
    }

    if (action === "create") {
      const { username, password, classes } = body;
      if (!username || !password) return json({ error: "username and password required" }, 400);
      const email = username.includes("@") ? username : `${username}@teachers.local`;
      const { data: created, error: ce } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { username },
      });
      if (ce) return json({ error: ce.message }, 400);
      const uid = created.user.id;
      await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "teacher" });
      if (classes?.length) await supabaseAdmin.from("teacher_classes").insert(classes.map(c => ({ user_id: uid, class_name: c })));
      await supabaseAdmin.from("teacher_passwords").upsert({ user_id: uid, password });
      return json({ success: true, user_id: uid });
    }

    if (action === "update_classes") {
      const { user_id, classes } = body;
      await supabaseAdmin.from("teacher_classes").delete().eq("user_id", user_id);
      if (classes?.length) await supabaseAdmin.from("teacher_classes").insert(classes.map(c => ({ user_id, class_name: c })));
      return json({ success: true });
    }

    if (action === "delete") {
      const { user_id } = body;
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("teacher_classes").delete().eq("user_id", user_id);
      await supabaseAdmin.from("teacher_passwords").delete().eq("user_id", user_id);
      await supabaseAdmin.from("active_sessions").delete().eq("user_id", user_id);
      await supabaseAdmin.auth.admin.deleteUser(user_id);
      return json({ success: true });
    }

    if (action === "get_passwords") {
      const { data: pwRows } = await supabaseAdmin
        .from("teacher_passwords")
        .select("user_id, password");
      const passwords: Record<string, string> = {};
      (pwRows ?? []).forEach((r: { user_id: string; password: string }) => {
        if (r.password) passwords[r.user_id] = r.password;
      });
      return json({ passwords });
    }

    if (action === "set_password") {
      const { user_id, password } = body;
      if (!user_id || !password) return json({ error: "user_id and password required" }, 400);
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
      if (authErr) return json({ error: authErr.message }, 400);
      await supabaseAdmin.from("teacher_passwords").upsert({ user_id, password });
      return json({ success: true });
    }

    if (action === "promote_admin") {
      const { user_id } = body;
      await supabaseAdmin.from("user_roles").upsert({ user_id, role: "admin" }, { onConflict: "user_id,role" });
      return json({ success: true });
    }

    if (action === "unassign_admin") {
      const { user_id } = body;
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id).eq("role", "admin");
      return json({ success: true });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

