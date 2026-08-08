import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { AuthRequest } from '../middleware/auth';
import { getWhatsAppService } from '../services/whatsapp.service';
import { formatPhoneNumber } from '../utils/phone';
import { logger } from '../lib/logger';

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { device: { userId: req.user!.id } };
    if (req.query.deviceId) where.deviceId = req.query.deviceId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.direction) where.direction = req.query.direction;
    if (req.query.recipient) where.recipient = { contains: req.query.recipient as string };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { device: { select: { id: true, name: true } } },
      }),
      prisma.message.count({ where }),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deviceId, recipient, content, type = 'text', mediaUrl } = req.body;

    const device = await prisma.device.findFirst({
      where: { id: deviceId, userId: req.user!.id },
    });
    if (!device) {
      throw new AppError('Device not found', 404);
    }

    const waService = getWhatsAppService();
    if (!waService.isConnected(deviceId)) {
      throw new AppError('Device not connected', 400);
    }

    const formattedRecipient = formatPhoneNumber(recipient);

    const message = await prisma.message.create({
      data: {
        deviceId,
        recipient: formattedRecipient,
        content,
        type,
        mediaUrl,
        status: 'pending',
        direction: 'outbound',
      },
    });

    try {
      await waService.sendMessage(deviceId, formattedRecipient, content, type, mediaUrl);

      await prisma.message.update({
        where: { id: message.id },
        data: { status: 'sent', sentAt: new Date() },
      });
    } catch (sendError) {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: 'failed', errorMessage: String(sendError) },
      });
      logger.error('Send message error:', sendError);
    }

    const updatedMessage = await prisma.message.findUnique({ where: { id: message.id } });
    res.status(201).json({ success: true, data: updatedMessage });
  } catch (error) {
    next(error);
  }
}

export async function getMessageStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userDeviceFilter = { device: { userId: req.user!.id } };

    const [total, sent, delivered, failed] = await Promise.all([
      prisma.message.count({ where: userDeviceFilter }),
      prisma.message.count({ where: { ...userDeviceFilter, status: 'sent' } }),
      prisma.message.count({ where: { ...userDeviceFilter, status: 'delivered' } }),
      prisma.message.count({ where: { ...userDeviceFilter, status: 'failed' } }),
    ]);

    res.json({
      success: true,
      data: { total, sent, delivered, failed },
    });
  } catch (error) {
    next(error);
  }
}
