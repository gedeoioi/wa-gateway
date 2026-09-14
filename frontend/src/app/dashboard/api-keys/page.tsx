"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, DOCS_URL } from "@/lib/api";
import { toastError, toastSuccess } from "@/components/Toast";
import type { ApiKey } from "@/lib/types";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["send", "read"]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ keys: ApiKey[] }>("/api/keys");
      setKeys(data.keys);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal memuat API key");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ secret: string }>("/api/keys", {
        method: "POST",
        body: { name: name || undefined, scopes },
      });
      setNewSecret(data.secret);
      setName("");
      await load();
      toastSuccess("API key dibuat");
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal membuat API key");
    } finally {
      setBusy(false);
    }
  }

  async function reveal(key: ApiKey) {
    try {
      const data = await api<{ secret: string }>(`/api/keys/${key.id}/reveal`);
      setNewSecret(data.secret);
      toastSuccess("API key ditampilkan");
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal menampilkan key");
    }
  }

  async function revoke(key: ApiKey) {
    if (!window.confirm(`Cabut API key "${key.name}"? Aplikasi yang memakainya akan berhenti bekerja.`)) return;
    try {
      await api(`/api/keys/${key.id}`, { method: "DELETE" });
      toastSuccess("API key dicabut");
      load();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Gagal mencabut key");
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toastSuccess("Disalin ke clipboard");
    } catch {
      toastError("Gagal menyalin. Salin manual dari kotak di atas.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">API Keys</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gunakan key ini pada header <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">X-API-Key</code>.
          </p>
        </div>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          Buka dokumentasi API
        </a>
      </div>

      {newSecret && (
        <div className="card card-pad border-brand-300 bg-brand-50">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-semibold text-brand-900">API key Anda</h2>
              <p className="mt-1 text-xs text-brand-800">
                Simpan di tempat aman. Jangan pernah membagikannya ke publik.
              </p>
            </div>
            <button onClick={() => setNewSecret(null)} className="btn-ghost text-brand-800">Tutup</button>
          </div>
          <div className="mt-4 flex gap-2">
            <code className="flex-1 truncate rounded-lg border border-brand-200 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-800">
              {newSecret}
            </code>
            <button onClick={() => copy(newSecret)} className="btn-primary shrink-0">Salin</button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={createKey} className="card card-pad space-y-4">
          <h2 className="font-semibold text-slate-900">Buat API key baru</h2>

          <div>
            <label className="label" htmlFor="key-name">Nama key</label>
            <input
              id="key-name"
              className="input"
              placeholder="Website toko"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <fieldset>
            <legend className="label">Scope</legend>
            <div className="space-y-2">
              {[
                { value: "send", label: "send", desc: "Kirim pesan & broadcast" },
                { value: "read", label: "read", desc: "Baca status device, pesan, broadcast" },
              ].map((option) => (
                <label key={option.value} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={scopes.includes(option.value)}
                    onChange={(e) =>
                      setScopes((prev) =>
                        e.target.checked
                          ? [...new Set([...prev, option.value])]
                          : prev.filter((s) => s !== option.value),
                      )
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="btn-primary w-full" disabled={busy || scopes.length === 0}>
            {busy ? "Membuat…" : "Buat API key"}
          </button>
        </form>

        <div className="card lg:col-span-2">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">Key aktif</h2>
          </div>

          {loading ? (
            <p className="p-5 text-sm text-slate-500">Memuat…</p>
          ) : keys.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Belum ada API key. Buat satu untuk mulai integrasi.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-slate-900">{key.name}</p>
                      {key.revokedAt && <span className="badge bg-red-50 text-red-700">Dicabut</span>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {key.revokedAt ? key.prefix : key.masked}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Scope: {key.scopes.join(", ")} · dibuat {new Date(key.createdAt).toLocaleDateString("id-ID")}
                      {key.lastUsedAt && ` · terakhir dipakai ${new Date(key.lastUsedAt).toLocaleString("id-ID")}`}
                    </p>
                  </div>

                  {!key.revokedAt && (
                    <div className="flex gap-2">
                      <button onClick={() => reveal(key)} className="btn-secondary px-3 py-1.5 text-xs">
                        Lihat
                      </button>
                      <button onClick={() => revoke(key)} className="btn-ghost px-3 py-1.5 text-xs text-red-600">
                        Cabut
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="font-semibold text-slate-900">Contoh penggunaan</h2>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`# Single message
curl -X POST http://localhost:4000/api/send-message \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"6281234567890","body":"Halo dari API"}'

# Broadcast
curl -X POST http://localhost:4000/api/send-broadcast \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template": "Halo {{nama}}, pesanan {{nomor}} sedang diproses.",
    "recipients": "628111111111,Budi\\n628222222222,Siti",
    "delayMs": 5000
  }'

# Status device
curl http://localhost:4000/api/device/status -H "X-API-Key: $API_KEY"`}
        </pre>
      </div>
    </div>
  );
}
