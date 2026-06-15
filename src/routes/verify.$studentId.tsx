/**
 * routes/verify.$studentId.tsx — পাবলিক মার্কশীট ভেরিফিকেশন পেজ।
 * QR code scan করে যে কেউ (login ছাড়া) এই পেজে এসে student-এর
 * আসল result database থেকে দেখে authenticity verify করতে পারে।
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getGrade } from "@/lib/marksheet-types";
import { CheckCircle2, ShieldCheck, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/verify/$studentId")({
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "Marksheet Verification — As Sunnah" },
      { name: "description", content: "Verify the authenticity of a student marksheet." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Row = {
  student_name: string;
  father_name: string | null;
  mother_name: string | null;
  student_id: string;
  class_name: string | null;
  roll_no: string | null;
  exam: string | null;
  year_session: string | null;
  subject: string;
  full_marks: number | null;
  obtained_marks: number | null;
  letter_grade: string | null;
  gp: number | null;
  gpa: number | null;
  section_position: string | null;
  total_present: string | null;
};

function VerifyPage() {
  const { studentId } = Route.useParams();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let data: Row[] | null = null;
      let error: { message: string } | null = null;

      // QR format: "{className}-{studentId}-{firstName}-{year}"
      // ALL four fields must match exactly to verify uniquely.
      if (studentId.includes("-")) {
        const parts = studentId.split("-");
        if (parts.length >= 4) {
          const className = parts[0]?.trim();
          const sid = parts[1]?.trim();
          const year = parts[parts.length - 1]?.trim();
          const firstName = parts.slice(2, -1).join("-").trim();
          if (className && sid && firstName && year) {
            const res = await supabase
              .from("marksheet_records")
              .select("*")
              .eq("class_name", className)
              .eq("year_session", year)
              .ilike("student_name", `${firstName}%`)
              .or(`student_id.eq.${sid},roll_no.eq.${sid}`);
            data = res.data as Row[] | null;
            error = res.error;
          }
        }
      }

      // Fallback — legacy QR codes that encode just the studentId.
      if (!error && (!data || data.length === 0)) {
        const res = await supabase
          .from("marksheet_records")
          .select("*")
          .eq("student_id", studentId);
        data = res.data as Row[] | null;
        error = res.error;
      }

      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  if (error || !rows || rows.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">যাচাই করা যায়নি</h1>
          <p className="text-sm text-muted-foreground">
            Student ID <span className="font-mono">{studentId}</span> এর কোনো record পাওয়া যায়নি।
            এই মার্কশীটটি জাল হতে পারে।
          </p>
          <Link to="/" className="text-sm text-primary underline">
            হোমে ফিরুন
          </Link>
        </div>
      </main>
    );
  }

  // Group by exam+year so each marksheet shows separately
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.exam ?? "-"}|${r.year_session ?? "-"}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const first = rows[0];

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Verification banner */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <ShieldCheck className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h1 className="text-base font-bold text-primary">✓ যাচাইকৃত মার্কশীট</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              এই data সরাসরি As-Sunnah-এর official database থেকে এসেছে।
            </p>
          </div>
        </div>

        {/* Student info */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold text-foreground">{first.student_name}</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Info label="Student ID" value={first.student_id} />
            <Info label="Class" value={first.class_name} />
            <Info label="Roll No" value={first.roll_no} />
            <Info label="Father" value={first.father_name} />
            {first.mother_name && <Info label="Mother" value={first.mother_name} />}
          </dl>
        </section>

        {/* Each exam result */}
        {Array.from(groups.entries()).map(([key, subjects]) => {
          const meta = subjects[0];
          let totalFull = 0,
            totalObt = 0,
            failed = 0;
          for (const s of subjects) {
            totalFull += s.full_marks ?? 0;
            totalObt += s.obtained_marks ?? 0;
            const pct = s.full_marks ? ((s.obtained_marks ?? 0) / s.full_marks) * 100 : 0;
            // Always compute grade from percentage so 45/50 → A+ (not the stale stored grade).
            const g = getGrade(pct).grade;
            if (g === "F") failed++;
          }
          const overallPct = totalFull ? (totalObt / totalFull) * 100 : 0;
          const overall = getGrade(overallPct);
          const status = failed === 0 && totalObt > 0 ? "Pass" : "Fail";
          return (
            <section
              key={key}
              className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{meta.exam || "-"}</h3>
                  <p className="text-[11px] text-muted-foreground">{meta.year_session || ""}</p>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded ${status === "Pass" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}
                >
                  {status}
                </span>
              </header>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-1.5">Subject</th>
                      <th className="text-right p-1.5">Full</th>
                      <th className="text-right p-1.5">Obtain</th>
                      <th className="text-center p-1.5">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s, i) => {
                      const pct = s.full_marks ? ((s.obtained_marks ?? 0) / s.full_marks) * 100 : 0;
                      const g = getGrade(pct).grade;
                      return (
                        <tr key={i} className="border-t border-border">
                          <td className="p-1.5">{s.subject}</td>
                          <td className="text-right p-1.5">{s.full_marks ?? "-"}</td>
                          <td className="text-right p-1.5 font-semibold">
                            {s.obtained_marks ?? "-"}
                          </td>
                          <td className="text-center p-1.5">{g}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Total" value={`${totalObt}/${totalFull}`} />
                <Stat label="Percentage" value={`${overallPct.toFixed(1)}%`} />
                <Stat label="Grade" value={overall.grade} />
              </div>
              {meta.section_position && (
                <p className="text-[11px] text-muted-foreground">
                  Position:{" "}
                  <span className="font-semibold text-foreground">{meta.section_position}</span>
                </p>
              )}
            </section>
          );
        })}

        <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1 pt-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          Verified via QR · As-Sunnah
        </p>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium text-foreground">{value || "-"}</dd>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
