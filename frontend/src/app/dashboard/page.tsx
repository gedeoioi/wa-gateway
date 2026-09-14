"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useDeviceStatus } from "@/lib/socket";
import { StatusBadge } from "@/components/StatusBadge";
import type { DashboardStats, Device } from "@/lib/types";

interface TrendPoint {
  date: string;
  sent: number;
  failed: number;
}

/**
 * Backend sends local-time day keys (`YYYY-MM-DD`). `new Date("2026-09-14")`
 * parses that as UTC midnight, which shifts the weekday backwards in negative
 * offsets, so build the date from its parts instead.
 */
function formatDayLabel(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", { weekday: "short" });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [stats, deviceList] = await Promise.all([
        api<DashboardStats>("/api/auth/stats"),
        api<{ devices: Device[] }>("/api/devices"),
      ]);
      setData(stats);
      setDevices(deviceList.devices);
    } catch {
      // handled by global auth redirect / toasts
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live status updates patch the device list without a refetch
  useDeviceStatus((event) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === event.deviceId
          ? { ...d, status: event.status, phoneNumber: event.phoneNumber ?? d.phoneNumber }
          : d,
      ),
    );
  });

  if (loading || !data) {
    return <div className="text-slate-500">Memuat statistik…</div>;
  }

  const { stats, trend } = data;
  const connected = devices.filter((d) => d.status === "connected");
  const maxTrend = Math.max(1, ...trend.map((t) => t.sent + t.failed));

  const cards = [
    { label: "Pesan terkirim", value: stats.sent, tone: "text-brand-600" },
    { label: "Gagal", value: stats.failed, tone: "text-red-600" },
    { label: "Hari ini", value: stats.todaySent, tone: "text-slate-900" },
    { label: "Broadcast", value: stats.broadcasts, tone: "text-slate-900" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-600">Ringkasan aktivitas dan status koneksi WhatsApp Anda.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/single-chat" className="btn-secondary">Kirim pesan</Link>
          <Link href="/dashboard/broadcast" className="btn-primary">Broadcast baru</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card card-pad">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${card.tone}`}>
              {card.value.toLocaleString("id-ID")}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Tren 7 hari terakhir</h2>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-500" /> Terkirim
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" /> Gagal
              </span>
            </div>
          </div>

          <div className="mt-6 flex h-40 items-end gap-1 sm:h-48 sm:gap-3">
            {trend.map((day) => {
              const total = day.sent + day.failed;
              const height = Math.max(4, (total / maxTrend) * 100);
              const sentRatio = total ? (day.sent / total) * 100 : 100;
              return (
                <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className="w-full overflow-hidden rounded-t-md bg-slate-100 transition group-hover:opacity-90"
                      style={{ height: `${height}%` }}
                      title={`${day.sent} terkirim, ${day.failed} gagal`}
                    >
                      <div className="h-full w-full bg-brand-500" style={{ height: `${sentRatio}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatDayLabel(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card card-pad">
          <h2 className="font-semibold text-slate-900">Status device</h2>
          {devices.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-5 text-center">
              <p className="text-sm text-slate-600">Belum ada device terhubung.</p>
              <Link href="/dashboard/connect" className="btn-primary mt-3 w-full">
                Hubungkan WhatsApp
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{device.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {device.phoneNumber ? `+${device.phoneNumber}` : "Belum terhubung"}
                    </p>
                  </div>
                  <StatusBadge status={device.status} />
                </li>
              ))}
            </ul>
          )}

          {connected.length === 0 && devices.length > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Tidak ada device yang aktif. Buka menu Koneksi Device untuk scan QR.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
