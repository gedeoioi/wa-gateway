import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { AuthRequest } from '../middleware/auth';
import { addBroadcastJob, isQueueReady } from '../lib/queue';
import { formatPhoneNumber } from '../utils/phone';
import { logger } from '../lib/logger';
import { emitToAll } from '../lib/socket';
import { getWhatsAppService } from '../services/whatsapp.service';

export async function getBroadcasts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { device: { userId: req.user!.id } };
    if (req.query.status) where.status = req.query.status;
    if (req.query.deviceId) where.deviceId = req.query.deviceId;

    const [broadcasts, total] = await Promise.all([
      prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { device: { select: { id: true, name: true, status: true } } },
      }),
      prisma.broadcast.count({ where }),
    ]);

    res.json({
      success: true,
      data: broadcasts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getBroadcast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, device: { userId: req.user!.id } },
      include: {
        device: { select: { id: true, name: true, status: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!broadcast) {
      throw new AppError('Broadcast not found', 404);
    }
    res.json({ success: true, data: broadcast });
  } catch (error) {
    next(error);
  }
}

export async function createBroadcast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deviceId, name, message, type = 'text', mediaUrl, recipients, scheduledAt, delayBetweenMessages = 2000 } = req.body;

    const device = await prisma.device.findFirst({
      where: { id: deviceId, userId: req.user!.id },
    });
    if (!device) {
      throw new AppError('Device not found', 404);
    }

    const broadcast = await prisma.broadcast.create({
      data: {
        name,
        deviceId,
        message,
        type,
        mediaUrl,
        totalRecipients: recipients.length,
        delayBetweenMessages,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? 'scheduled' : 'draft',
      },
    });

    const formattedRecipients = recipients.map((r: string) => formatPhoneNumber(r));

    await prisma.message.createMany({
      data: formattedRecipients.map((recipient: string) => ({
        deviceId,
        recipient,
        content: message,
        type,
        mediaUrl,
        status: 'pending' as const,
        direction: 'outbound' as const,
        broadcastId: broadcast.id,
      })),
    });

    logger.info(`Broadcast created: ${broadcast.id} with ${recipients.length} recipients`);
    res.status(201).json({ success: true, data: broadcast });
  } catch (error) {
    next(error);
  }
}

export async function startBroadcast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isQueueReady()) {
      throw new AppError('Server queue is not ready. Redis may not be running. Please restart the backend.', 503);
    }

    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, device: { userId: req.user!.id } },
    });
    if (!broadcast) {
      throw new AppError('Broadcast not found', 404);
    }
    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      throw new AppError(`Broadcast cannot be started (current status: ${broadcast.status})`, 400);
    }

    const waService = getWhatsAppService();
    if (!waService.isConnected(broadcast.deviceId)) {
      logger.info(`Device ${broadcast.deviceId} not in memory, attempting reconnect...`);
      try {
        await waService.connectDevice(broadcast.deviceId);
      } catch (reconnectErr) {
        logger.error(`Reconnect attempt failed: ${reconnectErr}`);
      }
    }

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'sending', startedAt: new Date() },
    });

    const messages = await prisma.message.findMany({
      where: { broadcastId: broadcast.id, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      await prisma.broadcast.update({
        where: { id: broadcast.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      emitToAll('broadcast:completed', { broadcastId: broadcast.id });
      res.json({ success: true, message: 'Broadcast completed (no pending messages)' });
      return;
    }

    let queuedCount = 0;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;
      try {
        await addBroadcastJob({
          broadcastId: broadcast.id,
          deviceId: broadcast.deviceId,
          recipient: msg.recipient,
          content: broadcast.message,
          type: broadcast.type,
          mediaUrl: broadcast.mediaUrl || undefined,
          delay: i * broadcast.delayBetweenMessages,
        });
        queuedCount++;
      } catch (jobErr) {
        logger.error(`Failed to queue message to ${msg.recipient}: ${jobErr}`);
        await prisma.message.update({
          where: { id: msg.id },
          data: { status: 'failed', errorMessage: 'Failed to queue job' },
        });
        await prisma.broadcast.update({
          where: { id: broadcast.id },
          data: { failedCount: { increment: 1 } },
        });
      }
    }

    emitToAll('broadcast:progress', {
      broadcastId: broadcast.id,
      sent: 0,
      failed: broadcast.totalRecipients - queuedCount,
      total: broadcast.totalRecipients,
    });

    if (queuedCount === 0) {
      await prisma.broadcast.update({
        where: { id: broadcast.id },
        data: { status: 'failed', completedAt: new Date() },
      });
      throw new AppError('Failed to queue any messages. Check Redis connection.', 500);
    }

    logger.info(`Broadcast started: ${broadcast.id} with ${queuedCount}/${messages.length} messages queued`);
    res.json({ success: true, message: `Broadcast started with ${queuedCount} messages` });
  } catch (error) {
    next(error);
  }
}

export async function cancelBroadcast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, device: { userId: req.user!.id } },
    });
    if (!broadcast) {
      throw new AppError('Broadcast not found', 404);
    }

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'cancelled' },
    });

    await prisma.message.updateMany({
      where: { broadcastId: broadcast.id, status: 'pending' },
      data: { status: 'failed', errorMessage: 'Broadcast cancelled' },
    });

    logger.info(`Broadcast cancelled: ${broadcast.id}`);
    res.json({ success: true, message: 'Broadcast cancelled' });
  } catch (error) {
    next(error);
  }
}

export async function deleteBroadcast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, device: { userId: req.user!.id } },
    });
    if (!broadcast) {
      throw new AppError('Broadcast not found', 404);
    }
    if (broadcast.status === 'sending') {
      throw new AppError('Cannot delete a sending broadcast', 400);
    }

    await prisma.message.deleteMany({ where: { broadcastId: broadcast.id } });
    await prisma.broadcast.delete({ where: { id: broadcast.id } });

    logger.info(`Broadcast deleted: ${broadcast.id}`);
    res.json({ success: true, message: 'Broadcast deleted' });
  } catch (error) {
    next(error);
  }
}
