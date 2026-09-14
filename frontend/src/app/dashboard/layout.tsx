"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DOCS_URL } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { ToastHost } from "@/components/Toast";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/dashboard/connect", label: "Koneksi Device", icon: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { href: "/dashboard/single-chat", label: "Single Chat", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72A7.88 7.88 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { href: "/dashboard/broadcast", label: "Broadcast", icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  { href: "/dashboard/logs", label: "Riwayat", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { href: "/dashboard/api-keys", label: "API Keys", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
  { href: "/dashboard/settings", label: "Pengaturan", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
];

// Only rendered when the account has role=admin. The backend enforces this
// independently, so hiding the link is purely a UI affordance.
const ADMIN_NAV = {
  href: "/dashboard/admin",
  label: "Admin Panel",
  icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
          Memuat dashboard…
        </div>
      </div>
    );
  }

  const quotaPct = user.monthlyQuota
    ? Math.min(100, Math.round((user.usedThisMonth / user.monthlyQuota) * 100))
    : 0;

  const isAdmin = user.role === "admin";

  function handleLogout() {
    disconnectSocket();
    logout();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72A7.88 7.88 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </span>
          <span className="font-semibold text-slate-900">WA Gateway</span>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              href={ADMIN_NAV.href}
              className={`mt-2 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                pathname === ADMIN_NAV.href
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-amber-200 text-amber-700 hover:bg-amber-50"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ADMIN_NAV.icon} />
              </svg>
              {ADMIN_NAV.label}
            </Link>
          )}
        </nav>

        <div className="mx-3 mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Kuota bulan ini</p>
          <p className="mt-1.5 text-sm font-semibold text-slate-900">
            {user.usedThisMonth.toLocaleString("id-ID")} / {user.monthlyQuota.toLocaleString("id-ID")}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${quotaPct > 90 ? "bg-red-500" : "bg-brand-500"}`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-xs font-medium text-brand-700 hover:underline"
          >
            Lihat dokumentasi API →
          </a>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:gap-4 sm:px-6">
          <button
            className="btn-ghost shrink-0 px-2 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="hidden min-w-0 flex-1 truncate text-sm text-slate-500 sm:block">
            Selamat datang kembali, <span className="font-medium text-slate-800">{user.name || user.email}</span>
          </div>

          {/* flex-1 on mobile keeps the right cluster pinned to the edge */}
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            {isAdmin && (
              <span className="badge hidden bg-amber-50 text-amber-700 xs:inline-flex">admin</span>
            )}
            <span className="badge hidden bg-brand-50 capitalize text-brand-700 xs:inline-flex sm:inline-flex">
              {user.plan}
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <button onClick={handleLogout} className="btn-ghost shrink-0 px-2 text-sm sm:px-3">
              Keluar
            </button>
          </div>
        </header>

        <main className="p-3 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Reachable-by-thumb logout on very small screens */}
      <button
        onClick={handleLogout}
        className="btn-ghost fixed bottom-4 right-4 z-20 bg-white px-3 text-sm shadow-lg ring-1 ring-slate-200 sm:hidden"
      >
        Keluar
      </button>

      <ToastHost />
    </div>
  );
}
