"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useDeviceStatus } from "@/lib/socket";
import { StatusBadge } from "@/components/StatusBadge";
import { toastError, toastSuccess } from "@/components/Toast";
import type { Device } from "@/lib/types";

export default function ConnectPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<Device | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDevices = useCallback(async () => {
    const data = await api<{ devices: Device[] }>("/api/devices");
    setDevices(data.devices);
    return data.devices;
  }, []);

  useEffect(() => {
    loadDevices()
      .then((list) => setSelected(list[0] ?? null))
      .catch((err) => toastError(err.message))
      .finally(() => setLoading(false));
  }, [loadDevices]);

  const fetchQr = useCallback(async (deviceId: string) => {
    try {
      const data = await api<{ status: string; qr: string | null }>(`/api/devices/${deviceId}/qr`);
      setQr(data.qr);
      if (data.status === "connected") setQr(null);
    } catch {
      // silent: poll again next tick
    }
  }, []);

  // Poll the QR while the selected device is not connected
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selected || selected.status === "connected") {
      setQr(null);
      return;
    }
    fetchQr(selected.id);
    pollRef.current = setInterval(() => fetchQr(selected.id), 3500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selected, fetchQr]);

  useDeviceStatus((event) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === event.deviceId
          ? { ...d, status: event.status, phoneNumber: event.phoneNumber ?? d.phoneNumber }
          : d,
      ),
    );
    setSelected((prev) =>
      prev && prev.id === event.deviceId
        ? { ...prev, status: event.status, phoneNumber: event.phoneNumber ?? prev.phoneNumber }
        : prev,
    );

    if (event.status === "connected") {
      setQr(null);
      toastSuccess("WhatsApp berhasil terhubung!");
    }
    if (event.qr) setQr(event.qr);
  });

  async function addDevice() {
    setBusy(true);
    try {
      const data = await api<{ device: Device }>("/api/devices", {
        method: "POST",
        body: { name: `Device ${devices.length + 1}` },
      });
      const list = await loadDevices();
      setSelected(list.find((d) => d.id === data.device.id) ?? data.device);
      toastSuccess("Device dibuat. Scan QR untuk menghubungkan.");
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal membuat device");
    } finally {
      setBusy(false);
    }
  }

  async function reconnect(device: Device) {
    setBusy(true);
    try {
      await api(`/api/devices/${device.id}/reconnect`, { method: "POST" });
      toastSuccess("Menyambungkan ulang…");
      await loadDevices();
      fetchQr(device.id);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal reconnect");
    } finally {
      setBusy(false);
    }
  }

  async function logoutDevice(device: Device) {
    if (!window.confirm(`Putuskan "${device.name}" dari WhatsApp? Sesi akan dihapus.`)) return;
    setBusy(true);
    try {
      await api(`/api/devices/${device.id}/logout`, { method: "POST" });
      toastSuccess("Device telah logout");
      const list = await loadDevices();
      setSelected(list[0] ?? null);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal logout");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDevice(device: Device) {
    if (!window.confirm(`Hapus device "${device.name}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/devices/${device.id}`, { method: "DELETE" });
      toastSuccess("Device dihapus");
      const list = await loadDevices();
      setSelected(list[0] ?? null);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal menghapus device");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-slate-500">Memuat device…</div>;

  const isConnected = selected?.status === "connected";
  const isLoggedOut = selected?.status === "logged_out";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Koneksi Device</h1>
          <p className="mt-1 text-sm text-slate-600">
            Scan QR code dengan WhatsApp di ponsel Anda: Perangkat tertaut → Tautkan perangkat.
          </p>
        </div>
        <button
          onClick={addDevice}
          className="btn-primary"
          disabled={busy || (user?.deviceLimit !== undefined && devices.length >= user.deviceLimit)}
        >
          + Tambah device
        </button>
      </div>

      {user?.deviceLimit !== undefined && (
        <p className="rounded-lg bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600">
          Menggunakan {devices.length} dari {user.deviceLimit} device
          {user.planName ? ` (paket ${user.planName})` : ""}.
          {devices.length >= user.deviceLimit && " Upgrade paket untuk menambah device."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-1">
          <h2 className="font-semibold text-slate-900">Daftar device</h2>
          {devices.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Belum ada device. Klik &ldquo;Tambah device&rdquo; untuk memulai.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {devices.map((device) => (
                <li key={device.id}>
                  <button
                    onClick={() => setSelected(device)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-3 text-left transition ${
                      selected?.id === device.id
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{device.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {device.phoneNumber ? `+${device.phoneNumber}` : "Belum terhubung"}
                      </p>
                    </div>
                    <StatusBadge status={device.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card card-pad lg:col-span-2">
          {!selected ? (
            <div className="grid h-72 place-items-center text-center">
              <div>
                <p className="text-slate-600">Pilih atau tambahkan device untuk menampilkan QR code.</p>
                <button onClick={addDevice} className="btn-primary mt-4" disabled={busy}>
                  Tambah device pertama
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="mb-5 flex w-full items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">{selected.name}</h2>
                  <p className="text-sm text-slate-500">
                    {selected.phoneNumber ? `+${selected.phoneNumber}` : "Menunggu koneksi"}
                  </p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              {isConnected ? (
                <div className="grid w-full place-items-center rounded-xl border border-brand-200 bg-brand-50 py-14 text-center">
                  <svg viewBox="0 0 24 24" className="h-14 w-14 text-brand-600" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-4 text-lg font-semibold text-brand-800">WhatsApp terhubung</p>
                  <p className="mt-1 text-sm text-brand-700">
                    Anda siap mengirim pesan dari {selected.name}.
                  </p>
                  <div className="mt-6 flex w-full max-w-[280px] flex-col gap-2 sm:max-w-none sm:flex-row">
                    <button onClick={() => reconnect(selected)} className="btn-secondary" disabled={busy}>
                      Reconnect
                    </button>
                    <button onClick={() => logoutDevice(selected)} className="btn-danger" disabled={busy}>
                      Logout
                    </button>
                  </div>
                </div>
              ) : isLoggedOut ? (
                <div className="grid w-full place-items-center rounded-xl border border-slate-200 py-14 text-center">
                  <p className="text-slate-700">Sesi device ini sudah di-logout.</p>
                  <p className="mt-1 text-sm text-slate-500">Hubungkan ulang dengan scan QR baru.</p>
                  <button onClick={() => reconnect(selected)} className="btn-primary mt-4" disabled={busy}>
                    Hubungkan ulang
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative w-full max-w-[280px] rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    {qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qr}
                        alt="QR code WhatsApp"
                        className="aspect-square w-full"
                      />
                    ) : (
                      <div className="grid aspect-square w-full place-items-center">
                        <div className="flex flex-col items-center gap-3 text-slate-500">
                          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
                          <span className="text-sm">Menyiapkan QR…</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="mt-5 max-w-md text-center text-sm text-slate-600">
                    Buka WhatsApp → <span className="font-medium">Perangkat tertaut</span> →{" "}
                    <span className="font-medium">Tautkan perangkat</span>, lalu arahkan kamera ke QR di atas.
                    QR diperbarui otomatis.
                  </p>
                  {selected.lastError && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2 text-xs text-amber-800">
                      {selected.lastError}
                    </p>
                  )}
                  <div className="mt-6 flex w-full max-w-[280px] flex-col gap-2 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center">
                    <button onClick={() => fetchQr(selected.id)} className="btn-secondary">
                      Refresh QR
                    </button>
                    <button onClick={() => reconnect(selected)} className="btn-secondary" disabled={busy}>
                      Reconnect
                    </button>
                    <button onClick={() => deleteDevice(selected)} className="btn-ghost text-red-600" disabled={busy}>
                      Hapus device
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
