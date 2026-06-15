/**
 * SplashScreen.tsx — অ্যাপ লোড হওয়ার সময় প্রথমেই দেখা যাওয়া
 * স্কুল লোগো সহ "ওয়েলকাম" স্ক্রিন।
 *
 * - ১৮০০ms পর ফেইড আউট শুরু, ২৪০০ms পর সম্পূর্ণ লুকিয়ে যায়।
 * - লোগোতে rise + float অ্যানিমেশন আর হালকা সবুজ গ্লো ব্যবহার
 *   করা হয়েছে যাতে প্রিমিয়াম ফিল আসে।
 * - মোবাইল অ্যাপ (Capacitor) ও ওয়েব দু-জায়গাতেই কাজ করে।
 */
import { useEffect, useState } from "react";
import logo from "@/assets/app-logo.png";

export function SplashScreen() {
  const [hidden, setHidden] = useState(false);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFade(true), 1800);
    const t2 = setTimeout(() => setHidden(true), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-700 ${
        fade ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background: "radial-gradient(circle at 50% 40%, #ffffff 0%, #f5faf6 55%, #e6f1e9 100%)",
      }}
    >
      {/* soft halo glow behind logo */}
      <div
        className="pointer-events-none absolute h-72 w-72 rounded-full sm:h-96 sm:w-96"
        style={{
          background:
            "radial-gradient(circle, rgba(34,139,75,0.18) 0%, rgba(34,139,75,0.06) 45%, transparent 70%)",
          filter: "blur(8px)",
          animation: "splash-pulse 2.2s ease-in-out infinite",
        }}
      />

      <img
        src={logo}
        alt="As-Sunnah International School & Madrasah"
        className="relative h-44 w-44 rounded-full object-cover sm:h-56 sm:w-56"
        style={{
          animation:
            "splash-rise 900ms cubic-bezier(0.22, 1, 0.36, 1) both, splash-float 3s ease-in-out 900ms infinite",
          filter: "drop-shadow(0 12px 24px rgba(34,139,75,0.25))",
          background: "#ffffff",
          border: "2px solid rgba(201,166,70,0.55)",
          boxShadow: "0 0 0 6px rgba(34,139,75,0.08), 0 12px 30px rgba(34,139,75,0.25)",
        }}
      />

      <h1
        className="relative mt-6 text-center text-lg font-extrabold tracking-[0.2em] sm:text-xl"
        style={{
          color: "#1a6b3a",
          animation: "splash-fade-up 700ms 350ms both",
        }}
      >
        AS-SUNNAH INTERNATIONAL
      </h1>
      <p
        className="relative mt-1 text-[11px] uppercase tracking-[0.35em] sm:text-xs"
        style={{
          color: "#9a7b2e",
          animation: "splash-fade-up 700ms 550ms both",
        }}
      >
        School &amp; Madrasah
      </p>

      <p
        className="relative mt-2 text-[10px] font-semibold uppercase tracking-[0.3em] sm:text-xs"
        style={{
          color: "#1a6b3a",
          animation: "splash-fade-up 700ms 650ms both",
        }}
      >
        Established 2024
      </p>

      {/* thin gold divider */}
      <div
        className="relative mt-4 h-px w-32"
        style={{
          background: "linear-gradient(90deg, transparent, #c9a646 50%, transparent)",
          animation: "splash-fade-up 700ms 700ms both",
        }}
      />

      <style>{`
        @keyframes splash-rise {
          0%   { opacity: 0; transform: translateY(14px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes splash-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        @keyframes splash-fade-up {
          0%   { opacity: 0; transform: translateY(8px); letter-spacing: 0.05em; }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splash-pulse {
          0%, 100% { transform: scale(1);   opacity: 0.85; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
