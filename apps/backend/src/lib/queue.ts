import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger';
import prisma from './prisma';
import { getWhatsAppService } from '../services/whatsapp.service';
import { emitToAll } from './socket';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let connection: IORedis | null = null;
let broadcastQueue: Queue | null = null;
let broadcastWorker: Worker | null = null;
let queueReady = false;

function createRedisConnection(): IORedis {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      const delay = Math.min(times * 1000, 10000);
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: false,
  });

  conn.on('connect', () => {
    logger.info('Queue Redis connected');
  });

  conn.on('error', (err) => {
    logger.error('Queue Redis error:', err.message);
  });

  conn.on('close', () => {
    logger.warn('Queue Redis connection closed');
    queueReady = false;
  });

  return conn;
}

export async function initQueues(): Promise<void> {
  try {
    connection = createRedisConnection();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 10000);

      connection!.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      connection!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    broadcastQueue = new Queue('broadcast', { connection });

    broadcastWorker = new Worker(
      'broadcast',
      async (job: Job) => {
        const { broadcastId, deviceId, recipient, content, type, mediaUrl } = job.data;

        const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
        if (!broadcast || broadcast.status === 'cancelled') {
          logger.info(`Skipping job ${job.id}: broadcast ${broadcastId} is ${broadcast?.status || 'not found'}`);
          return;
        }

        const waService = getWhatsAppService();

        if (!waService.isConnected(deviceId)) {
          logger.info(`Device ${deviceId} not connected, waiting for connection...`);
          try {
            if (!waService.getDeviceStatus(deviceId)) {
              await waService.connectDevice(deviceId);
            }
            await waService.waitForConnection(deviceId, 30000);
          } catch (waitErr) {
            const errMsg = waitErr instanceof Error ? waitErr.message : String(waitErr);
            if (errMsg === 'QR_NEEDED') {
              logger.warn(`Device ${deviceId} needs QR scan, skipping ${recipient}`);
              await markMessageFailed(broadcastId, recipient, 'Device needs QR code scan. Please scan from Devices page.');
              return;
            }
            logger.error(`Device ${deviceId} connection failed: ${errMsg}`);
            await markMessageFailed(broadcastId, recipient, `Device connection failed: ${errMsg}`);
            return;
          }
        }

        try {
          await waService.sendMessage(deviceId, recipient, content, type, mediaUrl);
          await markMessageSent(broadcastId, recipient);
          logger.info(`Message sent to ${recipient}`);
        } catch (error) {
          logger.error(`Failed to send to ${recipient}: ${error}`);
          await markMessageFailed(broadcastId, recipient, String(error));
        }
      },
      { connection, concurrency: 1 },
    );

    broadcastWorker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    broadcastWorker.on('completed', (job) => {
      logger.debug(`Job ${job.id} completed`);
    });

    broadcastWorker.on('error', (err) => {
      logger.error('Worker error:', err.message);
    });

    queueReady = true;
    logger.info('Queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize queues:', error);
    queueReady = false;

    setTimeout(() => {
      logger.info('Retrying queue initialization...');
      initQueues();
    }, 5000);
  }
}

async function markMessageSent(broadcastId: string, recipient: string): Promise<void> {
  await prisma.message.updateMany({
    where: { broadcastId, recipient },
    data: { status: 'sent', sentAt: new Date() },
  });

  const updated = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { sentCount: { increment: 1 } },
  });

  emitToAll('broadcast:progress', {
    broadcastId,
    sent: updated.sentCount,
    failed: updated.failedCount,
    total: updated.totalRecipients,
  });

  if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'completed', completedAt: new Date() },
    });
    emitToAll('broadcast:completed', { broadcastId });
  }
}

async function markMessageFailed(broadcastId: string, recipient: string, errorMessage: string): Promise<void> {
  await prisma.message.updateMany({
    where: { broadcastId, recipient, status: 'pending' },
    data: { status: 'failed', errorMessage },
  });

  const updated = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { failedCount: { increment: 1 } },
  });

  emitToAll('broadcast:progress', {
    broadcastId,
    sent: updated.sentCount,
    failed: updated.failedCount,
    total: updated.totalRecipients,
  });

  if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'completed', completedAt: new Date() },
    });
    emitToAll('broadcast:completed', { broadcastId });
  }
}

export function isQueueReady(): boolean {
  return queueReady && broadcastQueue !== null;
}

export async function addBroadcastJob(data: {
  broadcastId: string;
  deviceId: string;
  recipient: string;
  content: string;
  type?: string;
  mediaUrl?: string;
  delay?: number;
}): Promise<void> {
  if (!broadcastQueue) {
    throw new Error('Queue not initialized. Redis may not be running.');
  }

  await broadcastQueue.add('send-message', data, {
    delay: data.delay ?? 0,
    attempts: 1,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  });
}

export async function getBroadcastQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  if (!broadcastQueue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    broadcastQueue.getWaitingCount(),
    broadcastQueue.getActiveCount(),
    broadcastQueue.getCompletedCount(),
    broadcastQueue.getFailedCount(),
    broadcastQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

export { broadcastWorker };
