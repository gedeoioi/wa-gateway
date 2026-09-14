import { Worker } from "bullmq";
import { prisma } from "../db/prisma.js";
import { env, isQueueEnabled } from "../config/env.js";
import { childLogger } from "../config/logger.js";
import { getRedis, BROADCAST_QUEUE } from "./queue.js";
import { dispatchMessage } from "../whatsapp/dispatcher.js";
import { renderTemplate, sleep } from "../lib/phone.js";
import { realtime } from "../realtime/socket.js";

const log = childLogger({ mod: "broadcast-worker" });

/**
 * Runs one broadcast in batches, honouring per-message delay and a longer
 * pause between batches to mimic human pacing and avoid bans.
 */
export async function runBroadcast(broadcastId) {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { recipients: { orderBy: { createdAt: "asc" } } },
  });
  if (!broadcast) {
    log.warn({ broadcastId }, "broadcast not found");
    return;
  }
  if (broadcast.status === "cancelled" || broadcast.status === "completed") return;

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: "running", startedAt: broadcast.startedAt ?? new Date() },
  });
  emitProgress(broadcastId, { status: "running" });

  let processedInBatch = 0;

  for (const recipient of broadcast.recipients) {
    if (await isCancelled(broadcastId)) {
      log.info({ broadcastId }, "broadcast cancelled");
      await finishBroadcast(broadcastId, "cancelled");
      return;
    }

    if (recipient.status !== "pending") continue;

    // Re-check quota per recipient: a broadcast can run for hours, so the
    // single check at request time cannot be trusted to still hold.
    const quota = await prisma.user.findUnique({
      where: { id: broadcast.userId },
      select: { usedThisMonth: true, monthlyQuota: true, isActive: true },
    });
    if (!quota?.isActive || quota.usedThisMonth >= quota.monthlyQuota) {
      log.warn({ broadcastId }, "stopping broadcast: quota exhausted or account inactive");
      await finishBroadcast(broadcastId, "cancelled");
      return;
    }

    try {
      const body = renderTemplate(broadcast.template, {
        nama: recipient.name ?? "",
        name: recipient.name ?? "",
        nomor: recipient.phone,
        phone: recipient.phone,
      });

      await dispatchMessage({
        userId: broadcast.userId,
        deviceId: broadcast.deviceId,
        to: recipient.phone,
        body,
        source: "broadcast",
        broadcastId: broadcast.id,
      });

      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "sent", sentAt: new Date(), error: null },
      });
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { sent: { increment: 1 }, pending: { decrement: 1 } },
      });
      emitProgress(broadcastId, {
        lastPhone: recipient.phone,
        lastStatus: "sent",
      });
    } catch (err) {
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: String(err.message).slice(0, 480) },
      });
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { failed: { increment: 1 }, pending: { decrement: 1 } },
      });
      emitProgress(broadcastId, {
        lastPhone: recipient.phone,
        lastStatus: "failed",
        lastError: err.message,
      });
    }

    processedInBatch += 1;

    if (processedInBatch >= broadcast.batchSize) {
      processedInBatch = 0;
      log.info({ broadcastId }, "batch pause");
      await sleep(broadcast.batchPauseMs);
    } else {
      await sleep(broadcast.delayMs);
    }
  }

  await finishBroadcast(broadcastId, "completed");
}

async function isCancelled(broadcastId) {
  const row = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { status: true },
  });
  return row?.status === "cancelled";
}

async function finishBroadcast(broadcastId, status) {
  const broadcast = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status, finishedAt: new Date() },
  });
  emitProgress(broadcastId, { status });
  log.info({ broadcastId, status, sent: broadcast.sent, failed: broadcast.failed }, "finished");
}

function emitProgress(broadcastId, extra = {}) {
  realtime.emitToRoom(`broadcast:${broadcastId}`, "broadcast.progress", {
    broadcastId,
    ...extra,
  });
}

let worker = null;

export function startBroadcastWorker() {
  if (!isQueueEnabled) {
    log.warn("REDIS_URL not set - broadcasts run inline in the API process");
    return null;
  }
  if (worker) return worker;

  worker = new Worker(
    BROADCAST_QUEUE,
    async (job) => {
      await runBroadcast(job.data.broadcastId);
      return { ok: true };
    },
    {
      connection: getRedis(),
      concurrency: Number(process.env.BROADCAST_CONCURRENCY || 2),
    },
  );

  worker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, err: err.message }, "broadcast job failed"),
  );

  // BullMQ surfaces its own connection errors; route them through the same
  // throttled logger so an unreachable Redis stays quiet.
  worker.on("error", (err) => log.warn({ err: err?.message }, "broadcast worker connection error"));

  log.info("broadcast worker started");
  return worker;
}

export async function enqueueBroadcast(broadcastId) {
  const { isRedisReady } = await import("./queue.js");

  // Fall back to inline execution when Redis is absent OR unreachable, so a
  // configured-but-down Redis degrades instead of hanging the broadcast.
  if (!isQueueEnabled || !isRedisReady()) {
    setImmediate(() => {
      runBroadcast(broadcastId).catch((err) =>
        log.error({ broadcastId, err: err.message }, "inline broadcast failed"),
      );
    });
    return { mode: "inline", broadcastId };
  }

  try {
    const { getBroadcastQueue } = await import("./queue.js");
    await getBroadcastQueue().add("run", { broadcastId }, { jobId: `broadcast:${broadcastId}` });
    return { mode: "queued", broadcastId };
  } catch (err) {
    log.warn({ broadcastId, err: err.message }, "enqueue failed - running broadcast inline");
    setImmediate(() => {
      runBroadcast(broadcastId).catch((inlineErr) =>
        log.error({ broadcastId, err: inlineErr.message }, "inline broadcast failed"),
      );
    });
    return { mode: "inline", broadcastId };
  }
}

export async function stopBroadcastWorker() {
  if (worker) {
    await worker.close().catch(() => {});
    worker = null;
  }
}
