/**
 * Guards the worker healthcheck.
 *
 * Two bugs shipped before this test:
 *   1. The worker inherited the API's HTTP healthcheck. It runs no HTTP server,
 *      so it reported "unhealthy" forever while working perfectly.
 *   2. The replacement used `pgrep`, which does not exist in
 *      node:bookworm-slim (procps is not installed). Also always "unhealthy".
 *
 * Both were invisible in `docker ps` output — the container was `running` with
 * `restarts=0`. These checks fail loudly instead.
 *
 * Run: node _healthcheck.test.mjs   (wired into `npm test`)
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ""}`);
  }
}

// This test lives in backend/ but docker-compose.prod.yml is one level up
const BACKEND_DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const REPO_ROOT = join(BACKEND_DIR, "..");
const composeYml = readFileSync(join(REPO_ROOT, "docker-compose.prod.yml"), "utf8");
const dockerfile = readFileSync(join(BACKEND_DIR, "Dockerfile"), "utf8");

console.log("\n[compose: worker healthcheck]");

const workerBlock = composeYml.split(/^  worker:/m)[1] ?? "";
check("blok worker ada di compose", workerBlock.length > 0);

check(
  "worker TIDAK memakai HTTP /health",
  !/healthcheck:[\s\S]{0,400}?\/health/.test(workerBlock) ||
    /healthcheck\.js/.test(workerBlock),
  workerBlock.match(/healthcheck:[\s\S]{0,200}/)?.[0],
);

check(
  "worker memakai healthcheck.js",
  /healthcheck:\s*\n\s*test:\s*\[[^\]]*healthcheck\.js/.test(workerBlock),
  workerBlock.match(/healthcheck:[\s\S]{0,160}/)?.[0],
);

check(
  "tidak memakai pgrep sebagai perintah (tidak ada di node:bookworm-slim)",
  // Only command lines matter; the string appears in an explanatory comment
  !/^\s*test:.*pgrep/m.test(composeYml),
  composeYml.match(/^\s*test:.*pgrep.*$/m)?.[0],
);

console.log("\n[dockerfile: dependencies]");

check(
  "image TIDAK mengandalkan procps/pgrep",
  !/procps/.test(dockerfile) || /pgrep/.test(composeYml),
  "procps diinstall tapi healthcheck tidak butuh",
);

console.log("\n[heartbeat module]");

const mod = await import("./src/queue/heartbeat.js");

check("STALE_AFTER_MS wajar (30s-5m)", mod.STALE_AFTER_MS >= 30_000 && mod.STALE_AFTER_MS <= 300_000, mod.STALE_AFTER_MS);

const dir = mkdtempSync(join(tmpdir(), "wag-hb-"));
process.env.WORKER_HEARTBEAT_DIR = dir;

try {
  check("fresh == false sebelum start", mod.isHeartbeatFresh() === false);

  mod.startHeartbeat(50);
  await new Promise((r) => setTimeout(r, 250));
  check("fresh == true setelah start", mod.isHeartbeatFresh() === true);

  // A zero-width freshness window must report stale, proving the age is used
  check("menghormati batas stale", mod.isHeartbeatFresh(Date.now(), 0) === false);

  mod.stopHeartbeat();
  await new Promise((r) => setTimeout(r, 250));
  check("fresh == false setelah stop", mod.isHeartbeatFresh() === false);
  check("file heartbeat dihapus saat stop", !existsSync(mod.heartbeatPath()));
} finally {
  process.env.WORKER_HEARTBEAT_DIR = undefined;
  rmSync(dir, { recursive: true, force: true });
}

console.log("\n[healthcheck exit codes]");

function runHealthcheck(env) {
  return spawnSync(process.execPath, ["src/queue/healthcheck.js"], {
    cwd: BACKEND_DIR,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// 1. No heartbeat file at all
const emptyDir = mkdtempSync(join(tmpdir(), "wag-hc-empty-"));
try {
  const r = runHealthcheck({ WORKER_HEARTBEAT_DIR: emptyDir });
  check("tanpa heartbeat -> exit 1", r.status === 1, r.status);
  check("pesan error menjelaskan penyebab", /heartbeat/i.test(r.stderr ?? ""), r.stderr?.slice(0, 120));
} finally {
  rmSync(emptyDir, { recursive: true, force: true });
}

// 2. Fresh heartbeat
const freshDir = mkdtempSync(join(tmpdir(), "wag-hc-fresh-"));
try {
  writeFileSync(join(freshDir, "wa-worker-heartbeat"), String(Date.now()));
  const r = runHealthcheck({ WORKER_HEARTBEAT_DIR: freshDir });
  check("heartbeat baru -> exit 0", r.status === 0, r.status);
} finally {
  rmSync(freshDir, { recursive: true, force: true });
}

// 3. Stale heartbeat (simulates a wedged worker)
const staleDir = mkdtempSync(join(tmpdir(), "wag-hc-stale-"));
try {
  const file = join(staleDir, "wa-worker-heartbeat");
  writeFileSync(file, "old");
  const past = (Date.now() - 5 * 60 * 1000) / 1000;
  utimesSync(file, past, past);
  const r = runHealthcheck({ WORKER_HEARTBEAT_DIR: staleDir });
  check("heartbeat basi -> exit 1", r.status === 1, r.status);
} finally {
  rmSync(staleDir, { recursive: true, force: true });
}

console.log("\n[worker entrypoint]");

const entry = readFileSync(join(BACKEND_DIR, "src/queue/worker-entry.js"), "utf8");
check("entrypoint memanggil startHeartbeat()", /startHeartbeat\(\)/.test(entry));
check("entrypoint memanggil stopHeartbeat() saat shutdown", /stopHeartbeat\(\)/.test(entry));
check(
  "heartbeat dimulai SETELAH worker aktif",
  entry.indexOf("startBroadcastWorker()") < entry.indexOf("startHeartbeat()"),
  "urutan salah: heartbeat bisa jalan walau worker gagal start",
);

console.log(`\n${"-".repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
assert.ok(true);
process.exit(failed === 0 ? 0 : 1);
