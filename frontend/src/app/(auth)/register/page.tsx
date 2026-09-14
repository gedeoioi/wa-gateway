"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const { register, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password minimal 8 karakter");
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password, name || undefined);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const first = Object.values(err.details)[0]?.[0];
        setError(first ?? err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Terjadi kesalahan. Coba lagi.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Buat akun baru</h1>
      <p className="mt-2 text-sm text-slate-600">
        Gratis 1.000 pesan pertama. Tidak perlu kartu kredit.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div>
          <label className="label" htmlFor="name">Nama</label>
          <input
            id="name"
            className="input"
            placeholder="Nama Anda"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="nama@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            placeholder="Minimal 8 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary w-full py-3" disabled={submitting || loading}>
          {submitting ? "Membuat akun…" : "Daftar sekarang"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
