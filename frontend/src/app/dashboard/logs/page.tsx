"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, API_BASE } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { toastError } from "@/components/Toast";
import type { MessageLog, Pagination } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "", label: "Semua status" },
  { value: "sent", label: "Terkirim" },
  { value: "failed", label: "Gagal" },
  { value: "queued", label: "Antrian" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "Semua sumber" },
  { value: "dashboard", label: "Dashboard" },
  { value: "api", label: "API" },
  { value: "broadcast", label: "Broadcast" },
  { value: "inbound", label: "Masuk" },
];

export default function LogsPage() {
  const [items, setItems] = useState<MessageLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (status) params.set("status", status);
      if (source) params.set("source", source);
      if (search) params.set("q", search);

      const data = await api<{ items: MessageLog[]; pagination: Pagination }>(
        `/api/messages/logs?${params.toString()}`,
      );
      setItems(data.items);
      setPagination(data.pagination);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal memuat riwayat");
    } finally {
      setLoading(false);
    }
  }, [page, status, source, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, source, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Riwayat Pesan</h1>
        <p className="mt-1 text-sm text-slate-600">
          Semua pesan keluar dan masuk beserta status pengirimannya.
        </p>
      </div>

      <div className="card">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <div className="min-w-0 sm:col-span-2 lg:flex-1">
            <label className="label" htmlFor="q">Cari</label>
            <input
              id="q"
              className="input"
              placeholder="Nomor atau isi pesan…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearch(query)}
            />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="status">Status</label>
            <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="source">Sumber</label>
            <select id="source" className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setSearch(query)} className="btn-secondary sm:col-span-2 lg:col-span-1">
            Terapkan
          </button>
        </div>

        {/* Mobile: stacked cards. A 7-column table is unusable on a phone. */}
        <div className="divide-y divide-slate-100 md:hidden">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Memuat…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              Tidak ada pesan ditemukan.
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-mono text-sm text-slate-800">
                    +{item.to.split("@")[0]}
                  </span>
                  <StatusBadge status={item.status} />
                </div>

                <p className="break-words text-sm text-slate-700">{item.body || "(media)"}</p>
                {item.error && <p className="break-words text-xs text-red-600">{item.error}</p>}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                  <span
                    className={`badge ${
                      item.direction === "inbound"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.direction === "inbound" ? "Masuk" : "Keluar"}
                  </span>
                  <span className="capitalize">{item.source}</span>
                  <span>{item.deviceName ?? "—"}</span>
                  <span>{new Date(item.createdAt).toLocaleString("id-ID")}</span>
                  {item.mediaUrl && (
                    <a
                      href={`${API_BASE}${item.mediaUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Lihat lampiran
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop: full table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Arah</th>
                <th className="px-4 py-3">Nomor</th>
                <th className="px-4 py-3">Pesan</th>
                <th className="px-4 py-3">Sumber</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Memuat…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada pesan ditemukan.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(item.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${item.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                        {item.direction === "inbound" ? "Masuk" : "Keluar"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                      +{item.to.split("@")[0]}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate text-slate-700">{item.body || "(media)"}</p>
                      {item.error && <p className="truncate text-xs text-red-600">{item.error}</p>}
                      {item.mediaUrl && (
                        <a
                          href={`${API_BASE}${item.mediaUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-700 hover:underline"
                        >
                          Lihat lampiran
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-500">{item.source}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.deviceName ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Halaman {pagination.page} dari {pagination.pages} · {pagination.total.toLocaleString("id-ID")} pesan
            </p>
            <div className="flex gap-2">
              <button
                className="btn-secondary flex-1 px-3 text-xs sm:flex-none"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
              >
                Sebelumnya
              </button>
              <button
                className="btn-secondary flex-1 px-3 text-xs sm:flex-none"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={pagination.page >= pagination.pages}
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
