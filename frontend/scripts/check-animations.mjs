#!/usr/bin/env node
/**
 * Verifies that every animation class used in the markup has its @keyframes
 * present in the built CSS.
 *
 * Why this exists: Tailwind only emits @keyframes for `animate-*` utilities that
 * appear in the scanned markup. Declaring an animation inside @layer components
 * (or @layer utilities) and referencing a keyframe name that Tailwind never
 * emits produces CSS like:
 *
 *   .stagger-item { animation: fade-in-up .32s ... both }
 *   /* ...but no @keyframes fade-in-up anywhere *\/
 *
 * With `animation-fill-mode: both`, the element then sits at the `from` state
 * (opacity: 0) and is INVISIBLE. That is a silent, visual-only failure: the
 * build succeeds, the HTML is correct, HTTP is 200 — the page just looks empty.
 *
 * Run after `next build`: node scripts/check-animations.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const CSS_DIR = join(ROOT, ".next", "static", "css");

let failures = 0;
const fail = (m) => { console.error(`  FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`  pass  ${m}`);

if (!existsSync(CSS_DIR)) {
  console.error("No built CSS found. Run `npm run build` first.");
  process.exit(1);
}

const css = readdirSync(CSS_DIR)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(CSS_DIR, f), "utf8"))
  .join("\n");

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * Strip comments so explanations that mention a pattern are not flagged.
 *
 * Handles block comments and both kinds of line comment, including `//` inside
 * JSX (where it appears on its own line within an element's attributes) — that
 * case is what produced a false positive for a class name written in a comment.
 * The `[^:]` guard keeps `https://` style sequences intact.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line) && !/\{\s*\/\*/.test(line))
    .map((line) => line.replace(/(^|[^:"'`])\/\/[^\n]*$/g, "$1"))
    .join("\n");
}

const sourceFiles = walk(SRC).filter((f) => /\.(tsx|ts|css)$/.test(f));

console.log("\n[animation keyframes]");

// 1. Collect every @keyframes name present in the built CSS
const defined = new Set(
  [...css.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)].map((m) => m[1]),
);
console.log(`        keyframes tersedia: ${[...defined].sort().join(", ")}`);

// 2. Collect every animation name referenced in source.
//
// Two sources:
//   a) local CSS shorthand `animation: <name> ...` inside globals.css — these
//      names must exist as @keyframes.
//   b) `animate-<class>` utilities in markup — these are custom class names, not
//      keyframe names, so they are only checked against the CSS class list
//      (not against @keyframes).
const keyframeRefs = new Map(); // keyframe name -> where it was referenced
const animateClasses = new Map(); // css class suffix -> where it was used

for (const file of sourceFiles) {
  const text = stripComments(readFileSync(file, "utf8"));
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const isCss = file.endsWith(".css");
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    // (a) CSS shorthand animation declarations -> keyframe names
    if (isCss) {
      for (const m of line.matchAll(/(?:^|[\s;{])animation:\s*([A-Za-z_][\w-]*)/g)) {
        const name = m[1];
        if (name === "none") continue;
        if (!keyframeRefs.has(name)) keyframeRefs.set(name, `${rel}:${i + 1}`);
      }
    }

    // (b) animate-* utilities in markup -> class names
    for (const attr of line.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const value = attr[1] ?? attr[2] ?? "";
      for (const token of value.split(/\s+/)) {
        const bare = token.includes(":") ? token.slice(token.lastIndexOf(":") + 1) : token;
        if (!bare.startsWith("animate-")) continue;
        const name = bare.slice("animate-".length);
        if (!name || ["spin", "ping", "pulse", "bounce"].includes(name)) continue;
        if (!animateClasses.has(name)) animateClasses.set(name, `${rel}:${i + 1}`);
      }
    }
  });
}

// 3. Every keyframe actually referenced by a CSS `animation:` must be defined
const missingKeyframes = [];
for (const [name, where] of keyframeRefs) {
  if (!defined.has(name)) missingKeyframes.push(`${name} (dipakai di ${where})`);
}

if (missingKeyframes.length) {
  fail(`keyframes tidak terdefinisi — elemen bisa tidak terlihat (opacity: 0):`);
  for (const m of missingKeyframes) console.error(`          ${m}`);
  console.error(
    "\n  Perbaikan: deklarasikan @keyframes langsung di globals.css\n" +
    "  (Tailwind hanya memancarkan keyframes untuk utility animate-* yang dipakai).",
  );
} else {
  pass(`semua ${keyframeRefs.size} keyframe yang direferensikan terdefinisi`);
}

// 4. Every animate-* class used in markup must exist in the built CSS.
//    A typo or a purged class means the element never animates; combined with
//    fill-mode `both` it can also stay invisible.
const missingClasses = [];
for (const [name, where] of animateClasses) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Matches `.animate-x{`, `.sm\:animate-x{`, etc.
  const re = new RegExp(`\\.(?:[a-z0-9-]+\\\\:)?animate-${escaped}\\s*\\{`);
  if (!re.test(css)) missingClasses.push(`animate-${name} (dipakai di ${where})`);
}

if (missingClasses.length) {
  fail(`kelas animate-* tidak ada di CSS hasil build:`);
  for (const m of missingClasses) console.error(`          ${m}`);
  console.error(
    "\n  Perbaikan: pastikan kelasnya didefinisikan di globals.css atau\n" +
    "  tailwind.config.ts, dan nilainya tidak typo.",
  );
} else {
  pass(`semua ${animateClasses.size} kelas animate-* ada di CSS`);
}

console.log("\n[reduced motion]");

if (/prefers-reduced-motion/.test(css)) {
  pass("prefers-reduced-motion ditangani di CSS");
} else {
  fail("prefers-reduced-motion tidak ada — WCAG 2.3.3 tidak terpenuhi");
}

console.log("\n[layout-shifting transitions]");

// `transition-all` animates every property, including layout ones (width,
// height, top, left), which forces reflow each frame.
const transitionAll = [];
for (const file of sourceFiles) {
  const text = stripComments(readFileSync(file, "utf8"));
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  text.split("\n").forEach((line, i) => {
    if (/transition-all/.test(line)) transitionAll.push(`${rel}:${i + 1}`);
  });
}
if (transitionAll.length) {
  fail(`transition-all ditemukan (animasi properti layout): ${transitionAll.join(", ")}`);
} else {
  pass("tidak ada transition-all");
}

// Progress bars must not animate `width`
const progress = readFileSync(join(SRC, "components", "ProgressBar.tsx"), "utf8");
if (/transition[^;]*width/.test(progress)) {
  fail("ProgressBar menganimasikan width (memaksa layout setiap frame)");
} else {
  pass("ProgressBar memakai transform, bukan width");
}

console.log(
  failures === 0 ? "\nANIMATION CHECKS PASSED\n" : `\n${failures} PERMASALAHAN ANIMASI\n`,
);
process.exit(failures === 0 ? 0 : 1);
