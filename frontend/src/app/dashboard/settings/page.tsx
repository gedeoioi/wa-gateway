"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toastError, toastSuccess } from "@/components/Toast";
import type { User } from "@/lib/types";

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();

    if (password && password !== confirm) {
      toastError("Konfirmasi password tidak cocok");
      return;
    }
    if (password && password.length < 8) {
      toastError("Password minimal 8 karakter");
      return;
    }

    setSaving(true);
    try {
      await api<{ user: User }>("/api/auth/me", {
        method: "PATCH",
        body: {
          ...(name !== user?.name ? { name } : {}),
          ...(password ? { password } : {}),
        },
      });
      await refresh();
      setPassword("");
      setConfirm("");
      toastSuccess("Pengaturan tersimpan");
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pengaturan Akun</h1>
        <p className="mt-1 text-sm text-slate-600">Kelola profil dan keamanan akun Anda.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={onSave} className="card card-pad space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Profil</h2>

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input bg-slate-50" value={user.email} disabled />
            <p className="mt-1.5 text-xs text-slate-500">Email tidak dapat diubah.</p>
          </div>

          <div>
            <label className="label" htmlFor="name">Nama</label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama Anda"
            />
          </div>

          <hr className="border-slate-100" />

          <h2 className="font-semibold text-slate-900">Ubah password</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="password">Password baru</label>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete="new-password"
                placeholder="Kosongkan jika tidak diubah"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="confirm">Konfirmasi password</label>
              <input
                id="confirm"
                type="password"
                className="input"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan perubahan"}
          </button>
        </form>

        <div className="space-y-6">
          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Paket &amp; kuota</h2>
            <p className="mt-3">
              <span className="badge bg-brand-50 text-brand-700">
                {user.planName ?? user.plan}
              </span>
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Batas device</dt>
                <dd className="font-medium text-slate-900">
                  {user.deviceLimit !== undefined ? `${user.deviceLimit} device` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Kuota pesan</dt>
                <dd className="font-medium text-slate-900">
                  {user.monthlyQuota.toLocaleString("id-ID")} / bulan
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Pemakaian bulan ini</span>
                <span className="font-medium text-slate-900">
                  {user.usedThisMonth.toLocaleString("id-ID")} / {user.monthlyQuota.toLocaleString("id-ID")}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{
                    width: `${Math.min(100, (user.usedThisMonth / Math.max(1, user.monthlyQuota)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Kuota direset otomatis setiap 30 hari sejak tanggal reset terakhir.
            </p>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              Ingin menambah kuota atau device? Hubungi admin untuk upgrade paket. Perubahan paket
              dilakukan manual setelah pembayaran dikonfirmasi.
            </p>
          </div>

          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Informasi akun</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">User ID</dt>
                <dd className="font-mono text-xs text-slate-700">{user.id.slice(0, 12)}…</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Role</dt>
                <dd className="capitalize text-slate-700">{user.role}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Terdaftar</dt>
                <dd className="text-slate-700">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString("id-ID") : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
