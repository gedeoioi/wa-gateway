import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env, isQueueEnabled } from "../config/env.js";
import { childLogger } from "../config/logger.js";

const log = childLogger({ mod: "queue" });

export const BROADCAST_QUEUE = "broadcast";
export const SEND_MESSAGE_QUEUE = "send-message";

export const QUEUE_NAME = BROADCAST_QUEUE;

/** @type {Queue | null} */
let broadcastQueue = null;
/** @type {IORedis | null} */
let redis = null;
let lastRedisErrorAt = 0;

/**
 * ioredis emits an AggregateError whose `message` is often empty, and it
 * re-emits on every reconnect attempt. Collapse those into one bounded log
 * line so an unreachable Redis does not flood the console.
 */
function logRedisError(err) {
  const now = Date.now();
  if (now - lastRedisErrorAt < 30_000) return;
  lastRedisErrorAt = now;

  const detail =
    err?.message ||
    err?.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
    err?.code ||
    String(err);
  log.warn(
    { err: detail || "unreachable", url: env.redisUrl },
    "Redis unreachable - broadcast queue disabled, falling back to inline mode",
  );
}

export function getRedis() {
  if (!isQueueEnabled) return null;
  if (!redis) {
    redis = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      // Keep retrying in the background but stop spamming: ioredis re-emits
      // on every attempt, throttled by logRedisError above.
      retryStrategy: (times) => Math.min(times * 500, 10_000),
    });
    redis.on("error", logRedisError);
  }
  return redis;
}

/**
 * Whether Redis is currently usable. Broadcasts fall back to inline execution
 * when it is not, so a missing Redis degrades the app instead of breaking it.
 */
export function isRedisReady() {
  const client = getRedis();
  if (!client) return false;
  return client.status === "ready";
}

export function getBroadcastQueue() {
  if (!isQueueEnabled) return null;
  if (!broadcastQueue) {
    broadcastQueue = new Queue(BROADCAST_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return broadcastQueue;
}

export async function closeQueue() {
  if (broadcastQueue) await broadcastQueue.close().catch(() => {});
  if (redis) await redis.quit().catch(() => {});
  broadcastQueue = null;
  redis = null;
}
