/**
 * routes/index.tsx — হোম পেজ ("/")।
 * পুরো অ্যাপটাই একটিই মূল স্ক্রিন: MarksheetGenerator।
 * এখান থেকেই ইউজার Excel আপলোড, এডিট, সেভ ও PDF জেনারেট করতে পারে।
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MarksheetGenerator } from "@/components/MarksheetGenerator";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "As-Sunnah — Bulk PDF from Excel" },
      {
        name: "description",
        content:
          "Upload an Excel file and generate hundreds of student marksheets as a single downloadable PDF.",
      },
    ],
  }),
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <MarksheetGenerator />
    </main>
  );
}
