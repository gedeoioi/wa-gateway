#!/usr/bin/env node
/**
 * Static checks for the deployment shell scripts.
 *
 * There is no bash on the dev machine (Windows, no WSL), so `bash -n` cannot be
 * used here. This catches the failure modes that actually bite:
 *   - unbalanced quotes / braces / parentheses
 *   - calling a function that is never defined
 *   - referencing an undefined variable (typo risk)
 *   - CRLF line endings, which break bash with "bad interpreter"
 *   - a missing shebang or missing executable bit (reported as a hint)
 *
 * Run: node scripts/check-deploy-scripts.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = ["deploy.sh", "doctor.sh"];

// Commands provided by the shell or the OS, not by our scripts
const BUILTINS = new Set([
  "alias", "bg", "break", "case", "cd", "command", "continue", "declare",
  "do", "done", "echo", "elif", "else", "esac", "eval", "exec", "exit",
  "export", "fi", "for", "function", "if", "in", "local", "printf", "read",
  "readonly", "return", "select", "set", "shift", "then", "trap", "unset",
  "until", "wait", "while",
]);

const EXTERNALS = new Set([
  "awk", "cat", "chmod", "chown", "cp", "curl", "cut", "date", "dig", "docker",
  "find", "grep", "ls", "mkdir", "mv", "nginx", "node", "npm", "pgrep", "rm",
  "sed", "sleep", "sudo", "tar", "tail", "tee", "test", "tr", "ufw", "wc",
]);

let failures = 0;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++; };
const pass = (msg) => console.log(`  pass  ${msg}`);

/** Remove heredocs so their contents are not parsed as shell code. */
function stripHeredocs(source) {
  const lines = source.split("\n");
  const out = [];
  let terminator = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (terminator) {
      if (trimmed === terminator) terminator = null;
      continue;
    }
    const match = trimmed.match(/<<-?'?([A-Za-z_][A-Za-z0-9_]*)'?/);
    if (match) {
      terminator = match[1];
      out.push(line);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Crude but effective: drop comments and quoted text before counting. */
function stripCommentsAndStrings(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
    .join("\n")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''");
}

for (const name of SCRIPTS) {
  const path = join(ROOT, name);
  console.log(`\n[${name}]`);

  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    fail(`${name} tidak ditemukan`);
    continue;
  }
  pass("file ditemukan");

  // CRLF breaks the shebang on Linux: "/usr/bin/env: 'bash\r': No such file"
  if (source.includes("\r\n")) {
    fail(`${name} memakai CRLF — bash akan gagal dengan "bad interpreter". Jalankan: sed -i 's/\\r$//' ${name}`);
  } else {
    pass("LF line endings");
  }

  if (!source.startsWith("#!/usr/bin/env bash") && !source.startsWith("#!/bin/bash")) {
    fail(`${name} tidak diawali shebang bash`);
  } else {
    pass("shebang bash");
  }

  try {
    const mode = statSync(path).mode;
    if (!(mode & 0o111)) {
      console.warn(`  warn  ${name} belum executable — jalankan: chmod +x ${name}`);
    }
  } catch { /* ignore */ }

  const code = stripCommentsAndStrings(stripHeredocs(source));
  const lines = code.split("\n");

  // Balanced braces. Parentheses are skipped on purpose: `case` labels,
  // `$(...)`, and `((...))` make a naive count unreliable and produce false
  // positives, which is worse than not checking at all.
  const count = (ch) => (code.match(new RegExp(`\\${ch}`, "g")) || []).length;
  const braces = count("{") - count("}");
  if (braces !== 0) fail(`kurung kurawal tidak seimbang (selisih ${braces})`);
  else pass("kurung kurawal seimbang");

  // Every `if` needs a `fi`, `case` needs `esac` (whitespace-delimited words)
  const words = code.split(/\s+/).filter(Boolean);
  const tally = (w) => words.filter((x) => x === w).length;
  const ifs = tally("if") + tally("elif") ? tally("if") : 0;
  const fis = tally("fi");
  if (ifs !== fis) fail(`jumlah "if" (${ifs}) != "fi" (${fis})`);
  else pass(`"if"/"fi" seimbang (${ifs})`);

  const cases = tally("case");
  const esacs = tally("esac");
  if (cases !== esacs) fail(`jumlah "case" (${cases}) != "esac" (${esacs})`);
  else pass(`"case"/"esac" seimbang (${cases})`);

  const dos = tally("do");
  const dones = tally("done");
  if (dos !== dones) fail(`jumlah "do" (${dos}) != "done" (${dones})`);
  else pass(`"do"/"done" seimbang (${dos})`);

  // Function definitions
  const defined = new Set(
    [...code.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{/gm)].map((m) => m[1]),
  );

  // Detect calls to undefined helpers.
  //
  // Only lines whose FIRST token is the whole command are considered, and only
  // when that token is followed by end-of-line, a space, or an argument. Lines
  // that are assignments, case labels, or arguments of a multi-line command are
  // skipped. Anything ambiguous is ignored on purpose: a false "undefined
  // function" report is worse than a missed one, because it trains people to
  // ignore the checker.
  const called = new Set();
  let previousEndedWithContinuation = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    // A line ending in `\` continues onto the next line, so the next line's
    // first token is an argument, not a command.
    const continues = /\\$/.test(trimmed);
    if (previousEndedWithContinuation) {
      previousEndedWithContinuation = continues;
      continue;
    }
    previousEndedWithContinuation = continues;

    if (!trimmed) continue;
    if (trimmed.startsWith("#") || trimmed.startsWith("}")) continue;

    // Assignments (NAME=..., NAME="...", NAME=$(...)) are not calls
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) continue;
    // Case labels: `deploy)`, `--check)`, `*)`
    if (/^[^ \t]+\)\s*$/.test(trimmed)) continue;
    // Continuation of a previous multi-line command
    if (/^[)"'\-]/.test(trimmed)) continue;

    const m = trimmed.match(/^!?\s*([A-Za-z_][A-Za-z0-9_]*)(\s|$)/);
    if (!m) continue;
    const word = m[1];
    if (BUILTINS.has(word) || EXTERNALS.has(word)) continue;
    if (/^[=]/.test(trimmed.slice(m[0].length).trim())) continue;
    called.add(word);
  }

  const unresolved = [...called].filter((c) => !defined.has(c));
  if (unresolved.length) {
    fail(`memanggil fungsi yang tidak terdefinisi: ${unresolved.join(", ")}`);
  } else {
    pass(`semua pemanggilan fungsi terdefinisi (${defined.size} fungsi)`);
  }

  // Report loop-local helpers so typos in helper names are visible
  const helpers = [...defined].filter((d) => /^(step|ok|warn|note|die|pass|fail|info|section|service_health|check_http|read_env|compose|usage|on_error)$/.test(d));
  console.log(`        helper: ${helpers.join(", ")}`);
}

console.log(
  failures === 0
    ? "\nSURFACE CHECKS PASSED (static only — run `bash -n` on the VPS for full validation)\n"
    : `\n${failures} PERMASALAHAN DITEMUKAN\n`,
);
process.exit(failures === 0 ? 0 : 1);
