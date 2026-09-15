import Image from "next/image";

/**
 * Single source of truth for the brand mark.
 *
 * To use your own artwork, drop files into `frontend/public/brand/` — no other
 * code changes are needed:
 *   public/brand/logo.svg       icon only (square, ~1:1)
 *   public/brand/logo-full.svg  icon + wordmark
 *
 * IMPORTANT: this must stay a Server Component. It renders inside the landing
 * page, which is server-rendered. Passing an event handler (e.g. `onError`) to a
 * DOM element here throws "Event handlers cannot be passed to Client Component
 * props" at runtime — and `next build` does NOT catch it, so it only surfaces as
 * a 500 on the deployed page. Both SVG files above are committed to the repo, so
 * no runtime fallback is needed.
 */

export const BRAND_NAME = "WA Gateway";

const ASSETS = {
  square: "/brand/logo.svg",
  full: "/brand/logo-full.svg",
} as const;

interface LogoProps {
  /** "square" for the icon alone, "full" for artwork that includes the wordmark */
  shape?: keyof typeof ASSETS;
  /** Tailwind size classes applied to the mark */
  className?: string;
  /** Render the brand name next to the icon (always false for shape="full") */
  showName?: boolean;
  nameClassName?: string;
}

/** Built-in glyph, for places that need a bare mark without a network request. */
function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72A7.88 7.88 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

export function Logo({
  shape = "square",
  className = "h-5 w-5",
  showName = true,
  nameClassName = "font-semibold text-slate-900",
}: LogoProps) {
  const isFull = shape === "full";
  // A "full" logo already contains the wordmark, so never repeat it
  const withName = showName && !isFull;

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
        {isFull ? (
          <Image
            src={ASSETS.full}
            alt={BRAND_NAME}
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
          />
        ) : (
          <Image
            src={ASSETS.square}
            alt=""
            width={20}
            height={20}
            className={`${className} object-contain`}
          />
        )}
      </span>

      {withName && <span className={`truncate ${nameClassName}`}>{BRAND_NAME}</span>}
    </span>
  );
}

/** Bare glyph without the brand chip, for empty states and large marks. */
export function LogoGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return <BrandGlyph className={className} />;
}
