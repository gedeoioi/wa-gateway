"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { toastError, toastSuccess } from "@/components/Toast";
import type { Device, MessageLog } from "@/lib/types";

export default function SingleChatPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<MessageLog[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api<{ items: MessageLog[] }>(
        "/api/messages/logs?source=dashboard&limit=15",
      );
      setHistory(data.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    api<{ devices: Device[] }>("/api/devices")
      .then((data) => {
        setDevices(data.devices);
        const firstConnected = data.devices.find((d) => d.status === "connected");
        setDeviceId(firstConnected?.id ?? data.devices[0]?.id ?? "");
      })
      .catch((err) => toastError(err.message));
    loadHistory();
  }, [loadHistory]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!to.trim() || (!body.trim() && !file)) {
      toastError("Nomor tujuan dan isi pesan wajib diisi");
      return;
    }

    setSending(true);
    try {
      const form = new FormData();
      form.append("to", to.trim());
      if (body.trim()) form.append("body", body.trim());
      if (deviceId) form.append("deviceId", deviceId);
      if (file) form.append("media", file);

      const data = await api<{ message: MessageLog }>("/api/messages", {
        method: "POST",
        body: form,
      });

      toastSuccess(`Pesan terkirim ke ${data.message.to.split("@")[0]}`);
      setBody("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadHistory();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  }

  const activeDevice = devices.find((d) => d.id === deviceId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Single Chat</h1>
        <p className="mt-1 text-sm text-slate-600">
          Kirim pesan ke satu nomor, dengan opsi lampiran gambar atau dokumen.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={onSubmit} className="card card-pad space-y-4 lg:col-span-3">
          {activeDevice && activeDevice.status !== "connected" && (
            <div className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              Device terpilih belum terhubung. Buka menu{" "}
              <a href="/dashboard/connect" className="font-medium underline">Koneksi Device</a>.
            </div>
          )}

          <div>
            <label className="label" htmlFor="device">Device pengirim</label>
            <select
              id="device"
              className="input"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.length === 0 && <option value="">Belum ada device</option>}
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} {device.phoneNumber ? `(+${device.phoneNumber})` : ""} — {device.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="to">Nomor tujuan</label>
            <input
              id="to"
              className="input"
              placeholder="08123456789 atau 628123456789"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Format lokal (08…) maupun internasional (+62…) didukung.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="body">Isi pesan</label>
            <textarea
              id="body"
              rows={6}
              className="input resize-y"
              placeholder="Tulis pesan Anda di sini…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="mt-1.5 text-right text-xs text-slate-400">{body.length} / 4096</p>
          </div>

          <div>
            <label className="label" htmlFor="media">Lampiran (opsional)</label>
            <input
              id="media"
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:border-brand-400"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-2 text-xs text-slate-500">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          <button type="submit" className="btn-primary w-full py-3" disabled={sending}>
            {sending ? "Mengirim…" : "Kirim pesan"}
          </button>
        </form>

        <div className="card card-pad lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Riwayat terakhir</h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Belum ada pesan terkirim.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-slate-900">
                      +{item.to.split("@")[0]}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{item.body || "(media)"}</p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString("id-ID")}
                  </p>
                  {item.error && <p className="mt-1.5 text-xs text-red-600">{item.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
