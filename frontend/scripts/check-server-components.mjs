/**
 * Guards against the bug class that caused a production 500 on the landing page.
 *
 * Background: `Logo.tsx` is a Server Component that passed an `onError` handler
 * to an <img>. Next.js rejects event handlers in Server Components, but only at
 * RENDER time — `next build` reported success, so the failure surfaced as a 500
 * on the deployed site instead of in CI.
 *
 * This script statically rejects event handlers in files that are NOT marked
 * with "use client", which is the exact condition that broke production.
 *
 * Run: node scripts/check-server-components.mjs   (wired into `npm run check`)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// React event props that must never appear in a Server Component
const EVENT_PROP = /\bon[A-Z][A-Za-z]*\s*=\s*\{/g;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function isClientComponent(source) {
  // "use client" must be the first statement (comments allowed above it)
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(source);
}

/** Strip comments and strings so matches inside them are ignored. */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

const problems = [];

for (const file of walk(SRC)) {
  if (!/\.(tsx|jsx)$/.test(file)) continue;

  const source = readFileSync(file, "utf8");
  if (isClientComponent(source)) continue;

  const code = stripNonCode(source);
  const lines = code.split("\n");

  lines.forEach((line, index) => {
    const matches = line.match(EVENT_PROP);
    if (!matches) return;
    for (const match of matches) {
      const prop = match.replace(/\s*=.*$/, "");
      problems.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        line: index + 1,
        prop,
      });
    }
  });
}

if (problems.length) {
  console.error("\nServer Component contains an event handler.\n");
  console.error("Next.js cannot serialize functions across the server/client boundary,");
  console.error('which throws "Event handlers cannot be passed to Client Component props"');
  console.error("at RENDER time. `next build` does not catch this, so it would ship as a 500.\n");
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  ${p.prop}`);
  }
  console.error("\nFix: add \"use client\" to the file, or remove the handler.");
  console.error("If a fallback is needed for a missing asset, check the file exists instead.\n");
  process.exit(1);
}

console.log("server/client boundary check passed");
