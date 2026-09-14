import type { DeviceStatus } from "@/lib/types";

const STATUS_STYLES: Record<DeviceStatus | string, { label: string; className: string }> = {
  connected: { label: "Terhubung", className: "bg-brand-50 text-brand-700" },
  connecting: { label: "Menghubungkan", className: "bg-amber-50 text-amber-700" },
  disconnected: { label: "Terputus", className: "bg-slate-100 text-slate-600" },
  logged_out: { label: "Logout", className: "bg-red-50 text-red-700" },
  sent: { label: "Terkirim", className: "bg-brand-50 text-brand-700" },
  failed: { label: "Gagal", className: "bg-red-50 text-red-700" },
  queued: { label: "Antrian", className: "bg-slate-100 text-slate-600" },
  sending: { label: "Mengirim", className: "bg-amber-50 text-amber-700" },
  pending: { label: "Menunggu", className: "bg-slate-100 text-slate-600" },
  running: { label: "Berjalan", className: "bg-amber-50 text-amber-700" },
  completed: { label: "Selesai", className: "bg-brand-50 text-brand-700" },
  cancelled: { label: "Dibatalkan", className: "bg-slate-100 text-slate-600" },
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={`badge ${style.className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {style.label}
    </span>
  );
}
