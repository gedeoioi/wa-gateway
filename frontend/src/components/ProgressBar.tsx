"use client";

interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  tone?: "brand" | "amber" | "red";
}

export function ProgressBar({ value, max = 100, showLabel = true, tone = "brand" }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const tones = {
    brand: "bg-brand-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  } as const;

  return (
    <div className="w-full">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tones[tone]}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showLabel && (
        <div className="mt-1.5 flex justify-between text-xs text-slate-500">
          <span>
            {value} / {max}
          </span>
          <span>{pct}%</span>
        </div>
      )}
    </div>
  );
}
