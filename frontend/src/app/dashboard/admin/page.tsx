"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { toastError, toastSuccess } from "@/components/Toast";
import type {
  AdminMember,
  AdminMemberDevice,
  AdminStats,
  Pagination,
  PlanOption,
} from "@/lib/types";

const PAGE_SIZE = 20;

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [globalMaxDevices, setGlobalMaxDevices] = useState(20);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selected, setSelected] = useState<AdminMember | null>(null);
  const [devices, setDevices] = useState<AdminMemberDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await api<{ stats: AdminStats }>("/api/admin/stats");
      setStats(data.stats);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (query) params.set("q", query);
      if (planFilter) params.set("plan", planFilter);
      if (statusFilter) params.set("status", statusFilter);

      const data = await api<{ users: AdminMember[]; pagination: Pagination }>(
        `/api/admin/users?${params.toString()}`,
      );
      setMembers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else toastError(err instanceof ApiError ? err.message : "Gagal memuat member");
    } finally {
      setLoading(false);
    }
  }, [page, query, planFilter, statusFilter]);

  useEffect(() => {
    api<{ plans: PlanOption[]; globalMaxDevices: number }>("/api/admin/plans")
      .then((data) => {
        setPlans(data.plans);
        setGlobalMaxDevices(data.globalMaxDevices);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
      });
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    setPage(1);
  }, [query, planFilter, statusFilter]);

  const openMember = useCallback(async (member: AdminMember) => {
    setSelected(member);
    setDevices([]);
    try {
      const data = await api<{ user: AdminMember; devices: AdminMemberDevice[] }>(
        `/api/admin/users/${member.id}`,
      );
      setSelected(data.user);
      setDevices(data.devices);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal memuat detail member");
    }
  }, []);

  const refresh = useCallback(
    async (memberId?: string) => {
      await Promise.all([loadStats(), loadMembers()]);
      if (memberId && selected?.id === memberId) {
        const data = await api<{ user: AdminMember; devices: AdminMemberDevice[] }>(
          `/api/admin/users/${memberId}`,
        ).catch(() => null);
        if (data) {
          setSelected(data.user);
          setDevices(data.devices);
        }
      }
    },
    [loadStats, loadMembers, selected?.id],
  );

  async function patchMember(member: AdminMember, body: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const data = await api<{ user: AdminMember }>(`/api/admin/users/${member.id}`, {
        method: "PATCH",
        body,
      });
      setSelected((prev) => (prev && prev.id === member.id ? data.user : prev));
      await refresh(member.id);
      toastSuccess(label);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Perubahan gagal disimpan");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(member: AdminMember, path: string, label: string, body?: unknown) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${member.id}${path}`, { method: "POST", body });
      await refresh(member.id);
      toastSuccess(label);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Aksi gagal");
    } finally {
      setBusy(false);
    }
  }

  const planCounts = useMemo(() => {
    const map = new Map((stats?.byPlan ?? []).map((row) => [row.plan, row.count]));
    return (planId: string) => map.get(planId) ?? 0;
  }, [stats]);

  if (forbidden) {
    return (
      <div className="card card-pad">
        <h1 className="text-lg font-semibold text-slate-900">Akses ditolak</h1>
        <p className="mt-2 text-sm text-slate-600">
          Halaman ini hanya untuk administrator. Hubungi admin bila Anda memerlukan akses.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate-600">
          Kelola paket, kuota, dan status member. Isi pesan pelanggan tidak ditampilkan di sini.
        </p>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[
              { label: "Total member", value: stats.users.total, sub: `${stats.users.active} aktif` },
              { label: "Device", value: stats.devices.total, sub: `${stats.devices.connected} terhubung` },
              { label: "Pesan terkirim", value: stats.messages.sent, sub: `${stats.messages.failed} gagal` },
              { label: "Broadcast", value: stats.broadcasts, sub: "sepanjang waktu" },
            ].map((card) => (
              <div key={card.label} className="card p-4">
                <p className="text-xs text-slate-500 sm:text-sm">{card.label}</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-900">
                  {card.value.toLocaleString("id-ID")}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{card.sub}</p>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Distribusi paket</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => {
                const count = planCounts(plan.id);
                const pct = stats.users.total ? Math.round((count / stats.users.total) * 100) : 0;
                return (
                  <div key={plan.id} className="rounded-lg border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{plan.name}</span>
                      <span className="text-sm font-semibold text-slate-900">{count}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {plan.priceLabel}
                      {plan.period} · {plan.monthlyQuota.toLocaleString("id-ID")} pesan ·{" "}
                      {plan.maxDevices} device
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Pemakaian kuota platform: {stats.quota.used.toLocaleString("id-ID")} /{" "}
              {stats.quota.allocated.toLocaleString("id-ID")}
            </p>
          </div>
        </>
      )}

      <div className="card">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:flex lg:items-end">
          <div className="min-w-0 sm:col-span-2 lg:flex-1">
            <label className="label" htmlFor="member-search">Cari member</label>
            <input
              id="member-search"
              className="input"
              placeholder="Email atau nama…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(search)}
            />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="member-plan">Paket</label>
            <select
              id="member-plan"
              className="input"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
            >
              <option value="">Semua paket</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="member-status">Status</label>
            <select
              id="member-status"
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Semua status</option>
              <option value="active">Aktif</option>
              <option value="suspended">Nonaktif</option>
            </select>
          </div>
          <button onClick={() => setQuery(search)} className="btn-secondary sm:col-span-2 lg:col-span-1">
            Terapkan
          </button>
        </div>

        {/* Mobile: stacked member cards */}
        <div className="divide-y divide-slate-100 lg:hidden">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Memuat…</p>
          ) : members.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Tidak ada member ditemukan.</p>
          ) : (
            members.map((member) => (
              <button
                key={member.id}
                onClick={() => openMember(member)}
                className="block w-full space-y-2 p-4 text-left hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{member.name || "—"}</p>
                    <p className="truncate text-xs text-slate-500">{member.email}</p>
                  </div>
                  <span className={`badge shrink-0 ${member.isActive ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
                    {member.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="badge bg-slate-100 text-slate-700">{member.planName}</span>
                  <span>{member.devices}/{member.deviceLimit} device</span>
                  <span>{member.messagesSent.toLocaleString("id-ID")} pesan</span>
                  {member.role === "admin" && (
                    <span className="badge bg-amber-50 text-amber-700">admin</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Paket</th>
                <th className="px-4 py-3">Kuota</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Pesan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Memuat…</td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada member ditemukan.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{member.name || "—"}</p>
                          <p className="truncate text-xs text-slate-500">{member.email}</p>
                        </div>
                        {member.role === "admin" && (
                          <span className="badge bg-amber-50 text-amber-700">admin</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-slate-100 text-slate-700">{member.planName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700">
                        {member.usedThisMonth.toLocaleString("id-ID")} /{" "}
                        {member.monthlyQuota.toLocaleString("id-ID")}
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${member.quotaPercent > 90 ? "bg-red-500" : "bg-brand-500"}`}
                          style={{ width: `${member.quotaPercent}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <span className={member.deviceLimitOverride ? "font-medium text-amber-700" : ""}>
                        {member.devices}/{member.deviceLimit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {member.messagesSent.toLocaleString("id-ID")}
                      {member.messagesFailed > 0 && (
                        <span className="text-red-600"> · {member.messagesFailed} gagal</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${member.isActive ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
                        {member.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openMember(member)} className="btn-secondary px-3 text-xs">
                        Kelola
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Halaman {pagination.page} dari {pagination.pages} · {pagination.total} member
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

      {selected && (
        <MemberPanel
          member={selected}
          devices={devices}
          plans={plans}
          globalMaxDevices={globalMaxDevices}
          busy={busy}
          onClose={() => setSelected(null)}
          onPatch={patchMember}
          onAction={runAction}
        />
      )}
    </div>
  );
}

interface MemberPanelProps {
  member: AdminMember;
  devices: AdminMemberDevice[];
  plans: PlanOption[];
  globalMaxDevices: number;
  busy: boolean;
  onClose: () => void;
  onPatch: (member: AdminMember, body: Record<string, unknown>, label: string) => void;
  onAction: (member: AdminMember, path: string, label: string, body?: unknown) => void;
}

function MemberPanel({
  member,
  devices,
  plans,
  globalMaxDevices,
  busy,
  onClose,
  onPatch,
  onAction,
}: MemberPanelProps) {
  const [quotaInput, setQuotaInput] = useState(String(member.monthlyQuota));
  const [deviceInput, setDeviceInput] = useState(
    member.deviceLimitOverride === null ? "" : String(member.deviceLimitOverride),
  );
  const [note, setNote] = useState(member.adminNote ?? "");

  useEffect(() => {
    setQuotaInput(String(member.monthlyQuota));
    setDeviceInput(member.deviceLimitOverride === null ? "" : String(member.deviceLimitOverride));
    setNote(member.adminNote ?? "");
  }, [member.id, member.monthlyQuota, member.deviceLimitOverride, member.adminNote]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Kelola ${member.email}`}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{member.name || member.email}</h2>
            <p className="truncate text-sm text-slate-500">{member.email}</p>
          </div>
          <button onClick={onClose} className="btn-ghost shrink-0 px-2" aria-label="Tutup">✕</button>
        </div>

        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Pesan terkirim", value: member.messagesSent },
              { label: "Gagal", value: member.messagesFailed },
              { label: "Broadcast", value: member.broadcasts },
              { label: "Device", value: member.devices },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Paket</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  disabled={busy || member.plan === plan.id}
                  onClick={() => onPatch(member, { plan: plan.id }, `Paket diubah ke ${plan.name}`)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition disabled:opacity-60 ${
                    member.plan === plan.id
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-medium text-slate-900">{plan.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {plan.monthlyQuota.toLocaleString("id-ID")} pesan · {plan.maxDevices} device
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {plan.priceLabel}
                    {plan.period}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="quota-input">Kuota pesan / bulan</label>
              <div className="flex gap-2">
                <input
                  id="quota-input"
                  type="number"
                  min={0}
                  className="input"
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value)}
                />
                <button
                  className="btn-secondary shrink-0"
                  disabled={busy || quotaInput === String(member.monthlyQuota)}
                  onClick={() =>
                    onPatch(member, { monthlyQuota: Number(quotaInput) }, "Kuota diperbarui")
                  }
                >
                  Simpan
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Terpakai {member.usedThisMonth.toLocaleString("id-ID")} ({member.quotaPercent}%)
              </p>
            </div>

            <div>
              <label className="label" htmlFor="device-input">Batas device (override)</label>
              <div className="flex gap-2">
                <input
                  id="device-input"
                  type="number"
                  min={1}
                  max={globalMaxDevices}
                  className="input"
                  placeholder={`Otomatis (${member.planDeviceLimit})`}
                  value={deviceInput}
                  onChange={(e) => setDeviceInput(e.target.value)}
                />
                <button
                  className="btn-secondary shrink-0"
                  disabled={busy}
                  onClick={() =>
                    onPatch(
                      member,
                      { deviceLimitOverride: deviceInput === "" ? 0 : Number(deviceInput) },
                      deviceInput === "" ? "Batas device dikembalikan ke paket" : "Batas device diperbarui",
                    )
                  }
                >
                  Simpan
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Kosongkan untuk ikut paket ({member.planDeviceLimit}). Maks {globalMaxDevices}. Batas
                efektif: {member.deviceLimit}.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Catatan admin</h3>
            <textarea
              className="input mt-3"
              rows={2}
              placeholder="Mis. upgrade manual karena transfer 12 Sep"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="btn-secondary mt-2"
              disabled={busy || note === (member.adminNote ?? "")}
              onClick={() => onPatch(member, { adminNote: note || null }, "Catatan disimpan")}
            >
              Simpan catatan
            </button>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Device member</h3>
            {devices.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Member belum punya device.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{device.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {device.phoneNumber ? `+${device.phoneNumber}` : "Belum terhubung"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={device.status} />
                      <button
                        className="btn-ghost px-2 text-xs text-red-600"
                        disabled={busy || device.status === "logged_out"}
                        onClick={() =>
                          onAction(member, `/devices/${device.id}/logout`, `Device "${device.name}" di-logout`)
                        }
                      >
                        Logout
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="btn-secondary mt-3"
              disabled={busy || devices.length === 0}
              onClick={() => onAction(member, "/devices/restore", "Perintah reconnect dikirim")}
            >
              Reconnect semua device
            </button>
          </section>

          <section className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => onAction(member, "/reset-usage", "Kuota pemakaian direset")}
            >
              Reset pemakaian
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => onAction(member, "/extend-quota", "Masa kuota diperpanjang 30 hari", { days: 30 })}
            >
              Perpanjang 30 hari
            </button>
            <button
              className={member.isActive ? "btn-danger" : "btn-primary"}
              disabled={busy}
              onClick={() =>
                onPatch(
                  member,
                  { isActive: !member.isActive },
                  member.isActive ? "Member dinonaktifkan" : "Member diaktifkan",
                )
              }
            >
              {member.isActive ? "Nonaktifkan akun" : "Aktifkan akun"}
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() =>
                onPatch(
                  member,
                  { role: member.role === "admin" ? "user" : "admin" },
                  member.role === "admin" ? "Role diubah ke user" : "Role diubah ke admin",
                )
              }
            >
              {member.role === "admin" ? "Jadikan user" : "Jadikan admin"}
            </button>
          </section>

          <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
            Admin tidak dapat mengakses isi pesan atau nomor tujuan pelanggan member, sesuai batasan
            privasi. Member terdaftar {new Date(member.createdAt).toLocaleDateString("id-ID")}.
          </p>
        </div>
      </div>
    </div>
  );
}
