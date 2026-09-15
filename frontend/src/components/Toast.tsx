"use client";

import { useCallback, useEffect, useState } from "react";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
  /** Set while the exit animation plays; the item is removed afterwards. */
  leaving?: boolean;
}

/** Matches the exit transition duration below, so removal is not premature. */
const EXIT_MS = 200;
const DEFAULT_TTL_MS = 4000;

let counter = 0;
const listeners = new Set<(toast: Toast) => void>();

export function toast(message: string, tone: Toast["tone"] = "info") {
  const item = { id: ++counter, message, tone };
  listeners.forEach((fn) => fn(item));
}

export const toastSuccess = (message: string) => toast(message, "success");
export const toastError = (message: string) => toast(message, "error");

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);

  /**
   * Mark the toast as leaving, then remove it once the exit animation has
   * finished. Removing it in the same tick (as before) made the toast vanish
   * abruptly, which reads as a glitch rather than a dismissal.
   */
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    const listener = (item: Toast) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => dismiss(item.id), DEFAULT_TTL_MS);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [dismiss]);

  const tones = {
    success: "border-brand-200 bg-brand-50 text-brand-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-slate-200 bg-white text-slate-800",
  } as const;

  return (
    // The live region lets screen readers announce toasts that appear
    // asynchronously, which they otherwise miss entirely.
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
      role="region"
      aria-live="polite"
      aria-label="Notifikasi"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${tones[item.tone]}`}
          style={{
            transform: item.leaving ? "translateX(110%)" : undefined,
            opacity: item.leaving ? 0 : undefined,
            transition: `transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1)`,
          }}
          role="status"
        >
          <span className="min-w-0 flex-1 break-words">{item.message}</span>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label="Tutup notifikasi"
            className="-mr-1 -mt-1 shrink-0 rounded p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
