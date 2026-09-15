/**
 * Docker healthcheck entrypoint for the broadcast worker.
 *
 * Exits 0 when the worker heartbeat is fresh, 1 otherwise. Referenced by
 * docker-compose.prod.yml:
 *
 *   test: ["CMD", "node", "src/queue/healthcheck.js"]
 *
 * Kept as its own file so the check has no shell dependency (no pgrep/ps in
 * node:bookworm-slim) and so it can be unit-tested from Node directly.
 */
import { isHeartbeatFresh, heartbeatPath, STALE_AFTER_MS } from "./heartbeat.js";

if (isHeartbeatFresh()) {
  process.exit(0);
}

console.error(
  `Worker heartbeat missing or stale (> ${Math.round(STALE_AFTER_MS / 1000)}s): ${heartbeatPath()}`,
);
process.exit(1);
