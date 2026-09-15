"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Logo, BRAND_NAME } from "@/components/Logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  /**
   * Go back only when there is somewhere to go back to. A user who opened
   * /login directly (bookmark, new tab) has no history entry, and
   * router.back() would do nothing — so fall back to the landing page.
   */
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <div className="relative grid min-h-[100dvh] lg:grid-cols-2">
      {/* Back button: absolute so it stays in the top-left corner regardless of
          form height. Uses router.back() when there is history to return to, so
          a user who came from the dashboard lands back there instead of "/". */}
      <button
        type="button"
        onClick={goBack}
        aria-label="Kembali"
        title="Kembali"
        className="absolute left-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full
                   border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur
                   transition hover:bg-slate-50 hover:text-slate-900 active:scale-95
                   sm:left-4 sm:top-4"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* pt-16 clears the absolutely positioned back button (40px + 12px
          offset), so the logo never collides with it on narrow screens. */}
      <div className="flex items-center justify-center px-4 pb-10 pt-16 sm:pb-12 sm:pt-20">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block" aria-label={BRAND_NAME}>
            <Logo />
          </Link>
          {children}
        </div>
      </div>

      <div className="hidden bg-brand-700 p-12 text-brand-50 lg:flex lg:flex-col lg:justify-center">
        <blockquote className="max-w-md">
          <p className="text-2xl font-medium leading-relaxed text-white">
            &ldquo;Satu dashboard untuk semua notifikasi pelanggan kami. Broadcast yang tadinya manual,
            sekarang selesai dalam sekali klik.&rdquo;
          </p>
          <footer className="mt-6 text-sm text-brand-200">— Tim operasional, toko online</footer>
        </blockquote>
        <ul className="mt-12 space-y-4 text-sm">
          {[
            "Scan QR sekali, koneksi otomatis pulih saat server restart",
            "Antrian broadcast dengan delay anti-blokir",
            "REST API + dokumentasi Swagger siap pakai",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
