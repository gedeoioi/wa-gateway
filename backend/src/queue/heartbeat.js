/**
 * Worker heartbeat.
 *
 * The worker runs no HTTP server, so Docker's HTTP healthcheck cannot be used
 * and `pgrep` is unavailable in node:bookworm-slim (procps is not installed).
 * Instead the worker touches a file on a timer and the healthcheck reads its
 * mtime, which detects the two cases that actually matter:
 *   - the worker process died
 *   - the worker is alive but its event loop is blocked/stuck
 *
 * Kept dependency-free and in-memory cheap: one integer and one fs.stat.
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_HEARTBEAT_DIR = "/tmp";
const HEARTBEAT_FILENAME = "wa-worker-heartbeat";

/**
 * Resolve the heartbeat file path at call time, not at import time.
 *
 * Reading the env var once at module load made the path impossible to change
 * after import (which broke tests and any runtime reconfiguration).
 */
export function heartbeatPath() {
  const dir = process.env.WORKER_HEARTBEAT_DIR || DEFAULT_HEARTBEAT_DIR;
  return path.join(dir, HEARTBEAT_FILENAME);
}

/** Considered stale after this long without an update. */
export const STALE_AFTER_MS = 90_000;

let timer = null;

function touch() {
  const now = new Date();
  fs.writeFile(heartbeatPath(), String(now.getTime()), () => {
    // Best-effort: a failed heartbeat write must never crash the worker
  });
}

/** Start writing the heartbeat. Idempotent. */
export function startHeartbeat(intervalMs = 30_000) {
  if (timer) return;
  touch();
  timer = setInterval(touch, intervalMs);
  // Never hold the process open on the heartbeat alone
  timer.unref?.();
}

export function stopHeartbeat() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // Synchronous so the file is gone the moment stop() returns; callers (tests,
  // shutdown handlers) should not have to guess when cleanup finished.
  try {
    fs.rmSync(heartbeatPath(), { force: true });
  } catch {
    // Already gone or not writable — cleanup is best-effort
  }
}

export function isHeartbeatFresh(now = Date.now(), staleAfter = STALE_AFTER_MS) {
  try {
    const { mtimeMs } = fs.statSync(heartbeatPath());
    return now - mtimeMs <= staleAfter;
  } catch {
    // No file yet: either the worker has not started or it was cleared
    return false;
  }
}
