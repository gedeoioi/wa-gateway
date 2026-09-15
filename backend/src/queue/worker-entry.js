/**
 * Standalone broadcast worker entrypoint.
 *   npm run worker
 * Use this when you want the queue processed in a separate process/container.
 */
import { connectDatabase, disconnectDatabase } from "../db/prisma.js";
import { startBroadcastWorker, stopBroadcastWorker } from "./broadcast.worker.js";
import { closeQueue } from "./queue.js";
import { logger } from "../config/logger.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";

async function main() {
  await connectDatabase();
  const worker = startBroadcastWorker();

  if (!worker) {
    logger.error("Worker requires REDIS_URL. Broadcasts would run inline in the API instead.");
    process.exit(1);
  }

  // Drives the container healthcheck (see src/queue/healthcheck.js). Started
  // only after the worker is up, so a stalled worker stops updating it.
  startHeartbeat();
  logger.info("worker heartbeat started");

  const shutdown = async (signal) => {
    logger.info({ signal }, "worker shutting down");
    stopHeartbeat();
    await stopBroadcastWorker();
    await closeQueue();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err: err.message }, "worker failed to start");
  process.exit(1);
});
