"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2.5 font-semibold text-slate-900">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72A7.88 7.88 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </span>
            WA Gateway
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
