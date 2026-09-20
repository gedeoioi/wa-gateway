import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase, disconnectDatabase } from "./db/prisma.js";
import { realtime } from "./realtime/socket.js";
import { waManager } from "./whatsapp/manager.js";
import { startBroadcastWorker, stopBroadcastWorker } from "./queue/broadcast.worker.js";
import { closeQueue } from "./queue/queue.js";

async function main() {
  // Insecure production config is rejected at import time by
  // assertProductionSecrets() in config/env.js, so no runtime warning is needed.

  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  // ---------------------------------------------------------------------------
  // Timeouts tuned for a reverse proxy (Cloudflare / Nginx).
  //
  // Node's default keepAliveTimeout is 5000ms, but Cloudflare keeps idle
  // upstream connections for up to ~100s and reuses them. When Node closes the
  // socket first, Cloudflare's next request goes out on a dead connection; if
  // the retry also fails the edge returns 522 even though the app is healthy.
  //
  // headersTimeout must stay ABOVE keepAliveTimeout, otherwise Node aborts
  // requests that arrive just as the keep-alive window closes.
  // ---------------------------------------------------------------------------
  server.keepAliveTimeout = 120_000; // > Cloudflare's ~100s idle window
  server.headersTimeout = 125_000; // must exceed keepAliveTimeout
  server.requestTimeout = 0; // uploads/broadcast can be slow; no hard cap

  realtime.attach(server);
  startBroadcastWorker();

  server.listen(env.port, () => {
    logger.info(`API ready on http://localhost:${env.port} (docs: /docs)`);
  });

  // Restore previously paired WhatsApp sessions
  waManager.restoreAll().catch((err) =>
    logger.error({ err: err.message }, "device restore failed"),
  );

  // Quota reset sweep (cheap, runs hourly).
  // Semantics: a rolling 30-day window that starts at signup (or at the last
  // reset), not a calendar month. The dashboard copy matches this wording.
  const QUOTA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const quotaTimer = setInterval(async () => {
    try {
      const { prisma } = await import("./db/prisma.js");
      const cutoff = new Date(Date.now() - QUOTA_WINDOW_MS);
      await prisma.user.updateMany({
        where: { quotaResetAt: { lt: cutoff } },
        data: { usedThisMonth: 0, quotaResetAt: new Date() },
      });
    } catch (err) {
      logger.warn({ err: err.message }, "quota reset failed");
    }
  }, 60 * 60 * 1000);
  quotaTimer.unref?.();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");

    server.close();
    await realtime.close().catch(() => {});
    await stopBroadcastWorker().catch(() => {});
    await closeQueue().catch(() => {});

    for (const deviceId of [...waManager.sessions.keys()]) {
      await waManager.stop(deviceId).catch(() => {});
    }

    await disconnectDatabase().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) =>
    logger.error({ reason: String(reason) }, "unhandled rejection"),
  );
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, "fatal startup error");
  process.exit(1);
});
