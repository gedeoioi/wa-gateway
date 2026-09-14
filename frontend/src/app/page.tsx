import Link from "next/link";
import { DOCS_URL } from "@/lib/api";
import { Logo, BRAND_NAME } from "@/components/Logo";

const FEATURES = [
  {
    title: "Single Chat",
    body: "Kirim pesan ke satu nomor lengkap dengan lampiran gambar atau dokumen, langsung dari dashboard.",
    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72A7.88 7.88 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  },
  {
    title: "Broadcast Massal",
    body: "Upload ribuan nomor via CSV, pakai template dinamis, atur delay agar aman dari blokir.",
    icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
  },
  {
    title: "REST API",
    body: "Integrasikan ke website atau aplikasi apa pun dengan API key per user dan dokumentasi Swagger.",
    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  },
  {
    title: "Multi Device",
    body: "Kelola beberapa nomor WhatsApp dalam satu akun. Cocok untuk skala tim dan agensi.",
    icon: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    title: "Log & Statistik",
    body: "Semua pesan tercatat dengan status terkirim atau gagal. Pantau tren pengiriman harian.",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    title: "Realtime",
    body: "Status koneksi dan progres broadcast diperbarui langsung lewat WebSocket tanpa refresh.",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
];

const STEPS = [
  { step: "01", title: "Daftar akun", body: "Buat akun gratis hanya dengan email dan password." },
  { step: "02", title: "Scan QR", body: "Hubungkan nomor WhatsApp Anda lewat QR code seperti WhatsApp Web." },
  { step: "03", title: "Kirim pesan", body: "Mulai single chat, broadcast, atau panggil REST API." },
];

// Rendered per request so the pricing table always reflects the plan catalog
// the backend actually enforces.
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface PlanCard {
  id: string;
  name: string;
  priceLabel: string;
  period: string;
  monthlyQuota: number;
  maxDevices: number;
  features: string[];
  highlighted: boolean;
}

// Used only when the API is unreachable, so the landing page still renders.
const FALLBACK_PLANS: PlanCard[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "Rp0",
    period: "/bulan",
    monthlyQuota: 1000,
    maxDevices: 1,
    features: ["1 device WhatsApp", "1.000 pesan/bulan", "Single chat & broadcast", "REST API + Swagger"],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "Rp99rb",
    period: "/bulan",
    monthlyQuota: 25000,
    maxDevices: 3,
    features: ["3 device WhatsApp", "25.000 pesan/bulan", "Queue prioritas", "Webhook & laporan ekspor"],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    priceLabel: "Rp299rb",
    period: "/bulan",
    monthlyQuota: 100000,
    maxDevices: 10,
    features: ["10 device WhatsApp", "100.000 pesan/bulan", "Support prioritas", "SLA & on-premise"],
    highlighted: false,
  },
];

const PLAN_CTA: Record<string, string> = {
  free: "Mulai gratis",
  pro: "Pilih Pro",
  business: "Hubungi kami",
};

async function fetchPlans(): Promise<PlanCard[]> {
  try {
    const res = await fetch(`${API_URL}/api/plans`, { cache: "no-store" });
    if (!res.ok) return FALLBACK_PLANS;
    const data = (await res.json()) as { plans?: PlanCard[] };
    return data.plans?.length ? data.plans : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}

const FAQ = [
  {
    q: "Apakah nomor WhatsApp saya aman?",
    a: "Ya. Sesi tersimpan terenkripsi di server Anda sendiri dan hanya Anda yang memegang kontrol. Kami tidak menyimpan kredensial WhatsApp Anda di server pihak ketiga.",
  },
  {
    q: "Apakah bisa kena blokir WhatsApp?",
    a: "Gateway menyediakan pengaturan delay antar pesan dan jeda batch agar pola pengiriman menyerupai manusia. Tetap gunakan data nomor yang relevan dan tidak spam.",
  },
  {
    q: "Bagaimana cara integrasi ke aplikasi saya?",
    a: "Buat API key di dashboard, lalu panggil endpoint POST /api/send-message dengan header X-API-Key. Dokumentasi lengkap tersedia di halaman /docs.",
  },
  {
    q: "Apakah bisa jalan di server sendiri?",
    a: "Bisa. Backend Node.js ringan dan bisa dideploy di VPS kecil, Docker, Railway, atau Render. Database PostgreSQL, queue memakai Redis.",
  },
];

export default async function LandingPage() {
  const plans = await fetchPlans();
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" aria-label={BRAND_NAME}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#fitur" className="hover:text-slate-900">Fitur</a>
            <a href="#cara-kerja" className="hover:text-slate-900">Cara Kerja</a>
            <a href="#harga" className="hover:text-slate-900">Harga</a>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost hidden px-3 xs:inline-flex">Masuk</Link>
            <Link href="/register" className="btn-primary px-3 text-xs xs:text-sm sm:px-4">
              Daftar
              <span className="hidden xs:inline">&nbsp;gratis</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 -top-32 h-72 bg-gradient-to-b from-brand-100/70 to-transparent" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div className="mx-auto animate-fade-in">
            <span className="badge bg-brand-50 text-brand-700">Ringan · Mudah · Cepat</span>
            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              WhatsApp Gateway untuk <span className="text-brand-600">chat &amp; broadcast</span> otomatis
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Hubungkan nomor WhatsApp Anda dengan scan QR, kirim pesan satu-satu atau massal, dan
              integrasikan lewat REST API. Semua dalam satu dashboard sederhana.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/register" className="btn-primary px-6 py-3">Mulai gratis sekarang</Link>
              <Link href="/login" className="btn-secondary px-6 py-3">Saya sudah punya akun</Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 sm:gap-6">
              {[
                { k: "99.9%", v: "Uptime gateway" },
                { k: "<50MB", v: "Pemakaian memori" },
                { k: "5.000", v: "Nomor per broadcast" },
              ].map((item) => (
                <div key={item.k}>
                  <dt className="text-xl font-semibold text-slate-900 sm:text-2xl">{item.k}</dt>
                  <dd className="text-xs text-slate-500 sm:text-sm">{item.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="animate-fade-in">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-brand-900/5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
                <span className="ml-2 text-xs text-slate-400">POST /api/send-message</span>
              </div>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`curl -X POST http://localhost:4000/api/send-message \\
  -H "X-API-Key: wag_live_••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "6281234567890",
    "body": "Halo, pesanan Anda sudah dikirim!"
  }'

# => 201 Created
{
  "success": true,
  "data": {
    "to": "6281234567890@s.whatsapp.net",
    "status": "sent",
    "sentAt": "2026-01-20T09:12:44.108Z"
  }
}`}
              </pre>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-brand-50 px-4 py-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
                </span>
                <span className="text-sm font-medium text-brand-800">
                  Device terhubung · @6281234567890
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="fitur" className="border-t border-slate-100 bg-slate-50 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Semua yang Anda butuhkan untuk otomasi WhatsApp
            </h2>
            <p className="mt-3 text-slate-600">
              Dibangun di atas Node.js dan Baileys, dioptimalkan agar hemat memori meski banyak device menyala.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card card-pad transition hover:shadow-md">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
                  </svg>
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Mulai dalam 3 langkah</h2>
            <p className="mt-3 text-slate-600">Tidak perlu instalasi rumit. Kurang dari 5 menit untuk pesan pertama.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((item) => (
              <div key={item.step} className="relative card card-pad">
                <span className="text-4xl font-bold text-brand-100">{item.step}</span>
                <h3 className="mt-3 font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="harga" className="border-y border-slate-100 bg-slate-50 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Harga sederhana, tanpa kejutan</h2>
            <p className="mt-3 text-slate-600">Mulai gratis, upgrade saat trafik pesan Anda bertambah.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`card card-pad relative ${
                  plan.highlighted ? "border-brand-500 ring-2 ring-brand-500/20" : ""
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-5 badge bg-brand-600 text-white">Paling populer</span>
                )}
                <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                <p className="mt-3">
                  <span className="text-3xl font-bold text-slate-900">{plan.priceLabel}</span>
                  <span className="text-sm text-slate-500">{plan.period}</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm text-slate-600">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`mt-7 w-full ${plan.highlighted ? "btn-primary" : "btn-secondary"}`}
                >
                  {PLAN_CTA[plan.id] ?? "Mulai"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pertanyaan yang sering diajukan</h2>
          <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-900">
                  {item.q}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl rounded-2xl bg-brand-600 px-5 py-12 text-center sm:px-12 sm:py-14">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Siap otomasi WhatsApp Anda?</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-50">
            Daftar sekarang, hubungkan nomor Anda, dan kirim pesan pertama dalam hitungan menit.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="btn bg-white px-6 py-3 text-brand-700 hover:bg-brand-50">
              Buat akun gratis
            </Link>
            <a
              href={DOCS_URL}
              className="btn border border-brand-400 px-6 py-3 text-white hover:bg-brand-700"
              target="_blank"
              rel="noreferrer"
            >
              Lihat dokumentasi API
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} WA Gateway. Dibangun dengan Node.js, Baileys &amp; Next.js.</p>
          <div className="flex gap-5">
            <a href={DOCS_URL} className="hover:text-slate-800">API Docs</a>
            <Link href="/login" className="hover:text-slate-800">Masuk</Link>
            <Link href="/register" className="hover:text-slate-800">Daftar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
