"use client";

import { useEffect, useState } from "react";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}

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

  useEffect(() => {
    const listener = (item: Toast) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, 4000);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const tones = {
    success: "border-brand-200 bg-brand-50 text-brand-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-slate-200 bg-white text-slate-800",
  } as const;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto animate-fade-in rounded-lg border px-4 py-3 text-sm shadow-lg ${tones[item.tone]}`}
          role="status"
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
