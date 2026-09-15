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
        {/*
          Animated with scaleX, not width.
          Animating `width` forces layout on every frame; scaleX is composited
          on the GPU. The outer track is the full width and the inner bar is
          scaled, with `origin-left` so it grows from the start edge.
          This matters during a broadcast, where the value updates several
          times a second while other content is on screen.
        */}
        <div
          className={`h-full w-full origin-left rounded-full ${tones[tone]}`}
          style={{
            transform: `scaleX(${pct / 100})`,
            transition: "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progres ${pct}%`}
        />
      </div>
      {showLabel && (
        <div className="mt-1.5 flex justify-between text-xs text-slate-500">
          <span>
            {value} / {max}
          </span>
          <span className="tabular-nums transition-colors duration-slow">{pct}%</span>
        </div>
      )}
    </div>
  );
}
