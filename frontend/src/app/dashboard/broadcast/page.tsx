"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useBroadcastProgress } from "@/lib/socket";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { toastError, toastSuccess } from "@/components/Toast";
import type { BroadcastRecipient, BroadcastSummary, Device } from "@/lib/types";

interface PreviewRow {
  phone: string;
  name: string | null;
  body: string;
}

interface BroadcastDetail {
  broadcast: BroadcastSummary & { template: string; progress: number };
  recipients: BroadcastRecipient[];
}

export default function BroadcastPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(
    "Halo {{nama}}, ini informasi terbaru untuk Anda. Terima kasih telah menjadi pelanggan kami!",
  );
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [batchSize, setBatchSize] = useState(20);
  const [batchPauseSeconds, setBatchPauseSeconds] = useState(60);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [history, setHistory] = useState<BroadcastSummary[]>([]);
  const [active, setActive] = useState<BroadcastDetail | null>(null);
  const [liveSync, setLiveSync] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const recipientCount = useMemo(() => countRecipients(recipientsRaw), [recipientsRaw]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api<{ items: BroadcastSummary[] }>("/api/broadcasts?limit=10");
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

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!template.trim() || !recipientsRaw.trim()) {
        setPreview([]);
        return;
      }
      try {
        const data = await api<{ preview: PreviewRow[]; variables: string[] }>(
          "/api/broadcasts/preview",
          { method: "POST", body: { template, recipients: recipientsRaw, limit: 3 } },
        );
        setPreview(data.preview);
        setVariables(data.variables);
      } catch {
        // ignore preview errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [template, recipientsRaw]);

  const openDetail = useCallback(async (id: string) => {
    try {
      const data = await api<BroadcastDetail>(`/api/broadcasts/${id}`);
      setActive(data);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal memuat detail");
    }
  }, []);

  useBroadcastProgress(active?.broadcast.id ?? null, (event) => {
    setLiveSync(true);
    setActive((prev) => {
      if (!prev) return prev;
      const delta =
        event.lastStatus === "sent"
          ? { sent: prev.broadcast.sent + 1, pending: Math.max(0, prev.broadcast.pending - 1) }
          : event.lastStatus === "failed"
            ? { failed: prev.broadcast.failed + 1, pending: Math.max(0, prev.broadcast.pending - 1) }
            : {};

      const next: BroadcastDetail["broadcast"] = {
        ...prev.broadcast,
        ...delta,
        status: (event.status as BroadcastDetail["broadcast"]["status"]) ?? prev.broadcast.status,
      };
      return {
        broadcast: {
          ...next,
          progress: next.total ? Math.round(((next.sent + next.failed) / next.total) * 100) : 0,
        },
        recipients: event.lastPhone
          ? prev.recipients.map((r) =>
              r.phone === event.lastPhone
                ? {
                    ...r,
                    status: event.lastStatus ?? r.status,
                    error: event.lastError ?? null,
                    sentAt: new Date().toISOString(),
                  }
                : r,
            )
          : prev.recipients,
      };
    });
  });

  // Poll as a safety net when the socket misses an event
  useEffect(() => {
    if (!active || !["queued", "running"].includes(active.broadcast.status)) return;
    const timer = setInterval(() => openDetail(active.broadcast.id), 4000);
    return () => clearInterval(timer);
  }, [active, openDetail]);

  async function onImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());

    // XLSX is a binary format; without a parser we can only take the CSV-ish sheet
    const rows = lines
      .filter((line) => !/^(phone|nomor|number|no)\b/i.test(line))
      .map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ""));
        return parts.slice(0, 2).join(",");
      })
      .filter(Boolean);

    setRecipientsRaw((prev) => (prev ? `${prev}\n${rows.join("\n")}` : rows.join("\n")));
    toastSuccess(`${rows.length} baris diimpor dari ${file.name}`);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onStart(event: React.FormEvent) {
    event.preventDefault();
    if (!recipientCount) {
      toastError("Daftar nomor masih kosong");
      return;
    }

    setStarting(true);
    try {
      const data = await api<{
        broadcast: { id: string; total: number };
        skipped: { phone: string; reason: string }[];
      }>("/api/broadcasts", {
        method: "POST",
        body: {
          name: name || undefined,
          deviceId: deviceId || undefined,
          template,
          recipients: recipientsRaw,
          delayMs: Math.round(delaySeconds * 1000),
          batchSize,
          batchPauseMs: Math.round(batchPauseSeconds * 1000),
          startNow: true,
        },
      });

      if (data.skipped.length) {
        toastError(`${data.skipped.length} nomor dilewati (tidak valid)`);
      }
      toastSuccess(`Broadcast dimulai untuk ${data.broadcast.total} nomor`);
      setLiveSync(false);
      await openDetail(data.broadcast.id);
      loadHistory();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal memulai broadcast");
    } finally {
      setStarting(false);
    }
  }

  async function control(id: string, action: "start" | "cancel" | "delete") {
    try {
      if (action === "delete") {
        if (!window.confirm("Hapus data broadcast ini?")) return;
        await api(`/api/broadcasts/${id}`, { method: "DELETE" });
        setActive(null);
        toastSuccess("Broadcast dihapus");
      } else {
        await api(`/api/broadcasts/${id}/${action}`, { method: "POST" });
        toastSuccess(action === "start" ? "Broadcast dijalankan" : "Broadcast dibatalkan");
        await openDetail(id);
      }
      loadHistory();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Aksi gagal");
    }
  }

  const activeDevice = devices.find((d) => d.id === deviceId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Broadcast Massal</h1>
        <p className="mt-1 text-sm text-slate-600">
          Kirim pesan ke banyak nomor sekaligus dengan template dinamis dan delay anti-blokir.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <form onSubmit={onStart} className="card card-pad space-y-5 xl:col-span-3">
          {activeDevice && activeDevice.status !== "connected" && (
            <div className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              Device terpilih belum terhubung. Hubungkan dulu di menu Koneksi Device.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="bc-name">Nama broadcast</label>
              <input
                id="bc-name"
                className="input"
                placeholder="Promo Agustus"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="bc-device">Device pengirim</label>
              <select
                id="bc-device"
                className="input"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.length === 0 && <option value="">Belum ada device</option>}
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} — {device.status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="bc-template">Template pesan</label>
            <textarea
              id="bc-template"
              rows={5}
              className="input resize-y"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {["nama", "nomor"].map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => setTemplate((prev) => `${prev} {{${variable}}}`)}
                  className="badge bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  + {`{{${variable}}}`}
                </button>
              ))}
              {variables.length > 0 && (
                <span className="text-xs text-slate-500">
                  Variabel terpakai: {variables.join(", ")}
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between">
              <label className="label mb-0" htmlFor="bc-recipients">Daftar nomor</label>
              <label className="cursor-pointer text-xs font-medium text-brand-700 hover:underline">
                Import CSV/Excel
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={onImportFile}
                />
              </label>
            </div>
            <textarea
              id="bc-recipients"
              rows={7}
              className="input resize-y font-mono text-xs"
              placeholder={"628123456789,Budi\n628987654321,Siti\n\natau tempel satu nomor per baris"}
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              {recipientCount} nomor terdeteksi · format <code>nomor,nama</code> per baris
            </p>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1.5 text-sm font-medium text-slate-700">Pengaturan pengiriman</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="bc-delay">Delay antar pesan (detik)</label>
                <input
                  id="bc-delay"
                  type="number"
                  min={1}
                  max={120}
                  className="input"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="bc-batch">Pesan per batch</label>
                <input
                  id="bc-batch"
                  type="number"
                  min={1}
                  max={200}
                  className="input"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="bc-pause">Jeda antar batch (detik)</label>
                <input
                  id="bc-pause"
                  type="number"
                  min={0}
                  max={3600}
                  className="input"
                  value={batchPauseSeconds}
                  onChange={(e) => setBatchPauseSeconds(Number(e.target.value))}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Estimasi durasi: {estimateDuration(recipientCount, delaySeconds, batchSize, batchPauseSeconds)}
            </p>
          </fieldset>

          <button type="submit" className="btn-primary w-full py-3" disabled={starting || !recipientCount}>
            {starting ? "Memulai…" : `Mulai broadcast (${recipientCount} nomor)`}
          </button>
        </form>

        <div className="space-y-6 xl:col-span-2">
          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Pratinjau pesan</h2>
            {preview.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Isi template dan daftar nomor untuk melihat pratinjau.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {preview.map((row) => (
                  <li key={row.phone} className="rounded-lg bg-slate-50 p-3.5">
                    <p className="text-xs font-medium text-slate-500">
                      +{row.phone} {row.name ? `· ${row.name}` : ""}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{row.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {active && (
            <div className="card card-pad">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-slate-900">{active.broadcast.name}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {active.broadcast.deviceName ?? "—"}
                    {liveSync && ["queued", "running"].includes(active.broadcast.status) && (
                      <span className="ml-2 text-brand-600">· live</span>
                    )}
                  </p>
                </div>
                <StatusBadge status={active.broadcast.status} />
              </div>

              <div className="mt-4">
                <ProgressBar value={active.broadcast.sent + active.broadcast.failed} max={active.broadcast.total} />
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-brand-50 py-2.5">
                  <dt className="text-xs text-brand-700">Terkirim</dt>
                  <dd className="text-lg font-semibold text-brand-800">{active.broadcast.sent}</dd>
                </div>
                <div className="rounded-lg bg-red-50 py-2.5">
                  <dt className="text-xs text-red-700">Gagal</dt>
                  <dd className="text-lg font-semibold text-red-800">{active.broadcast.failed}</dd>
                </div>
                <div className="rounded-lg bg-slate-100 py-2.5">
                  <dt className="text-xs text-slate-600">Sisa</dt>
                  <dd className="text-lg font-semibold text-slate-800">{active.broadcast.pending}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {["draft", "cancelled", "failed"].includes(active.broadcast.status) && (
                  <button onClick={() => control(active.broadcast.id, "start")} className="btn-primary">
                    Mulai / Lanjutkan
                  </button>
                )}
                {["queued", "running"].includes(active.broadcast.status) && (
                  <button onClick={() => control(active.broadcast.id, "cancel")} className="btn-secondary">
                    Hentikan
                  </button>
                )}
                {active.broadcast.status !== "running" && (
                  <button onClick={() => control(active.broadcast.id, "delete")} className="btn-ghost text-red-600">
                    Hapus
                  </button>
                )}
              </div>

              <div className="mt-5 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                {/* Mobile: list rows that fit a phone width */}
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {active.recipients.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-slate-700">+{row.phone}</p>
                        <p className="mt-0.5 break-words text-xs text-slate-500">
                          {row.error ?? (row.sentAt ? new Date(row.sentAt).toLocaleTimeString("id-ID") : "—")}
                        </p>
                      </div>
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>

                {/* Desktop: table with sticky header */}
                <table className="hidden w-full text-sm sm:table">
                  <thead className="table-head sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Nomor</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {active.recipients.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">+{row.phone}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-500">
                          {row.error ?? (row.sentAt ? new Date(row.sentAt).toLocaleTimeString("id-ID") : "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Broadcast terakhir</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Belum ada broadcast.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => openDetail(item.id)}
                      className={`w-full rounded-lg border px-3.5 py-3 text-left transition ${
                        active?.broadcast.id === item.id
                          ? "border-brand-500 bg-brand-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-slate-900">{item.name}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.sent}/{item.total} terkirim
                        {item.failed > 0 && ` · ${item.failed} gagal`}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function countRecipients(raw: string) {
  if (!raw.trim()) return 0;
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(phone|nomor|number|no)\b/i.test(line)).length;
}

function estimateDuration(count: number, delaySec: number, batchSize: number, pauseSec: number) {
  if (!count) return "—";
  const batches = Math.floor((count - 1) / Math.max(1, batchSize));
  const seconds = (count - 1) * delaySec + batches * pauseSec;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `± ${rest} detik`;
  return `± ${minutes} menit ${rest} detik`;
}
