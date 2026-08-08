import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { AuthRequest } from '../middleware/auth';
import { getWhatsAppService } from '../services/whatsapp.service';
import { logger } from '../lib/logger';

export async function getDevices(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: devices });
  } catch (error) {
    next(error);
  }
}

export async function getDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await prisma.device.findUnique({
      where: { id: req.params.id },
    });
    if (!device) {
      throw new AppError('Device not found', 404);
    }
    res.json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
}

export async function createDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name } = req.body;
    const device = await prisma.device.create({
      data: { name },
    });
    logger.info(`Device created: ${device.id} by ${req.user!.username}`);
    res.status(201).json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
}

export async function connectDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) {
      throw new AppError('Device not found', 404);
    }

    const waService = getWhatsAppService();
    await waService.connectDevice(device.id);

    res.json({ success: true, message: 'Device connecting...' });
  } catch (error) {
    next(error);
  }
}

export async function disconnectDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) {
      throw new AppError('Device not found', 404);
    }

    const waService = getWhatsAppService();
    await waService.disconnectDevice(device.id);

    res.json({ success: true, message: 'Device disconnected' });
  } catch (error) {
    next(error);
  }
}

export async function getDeviceQR(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const waService = getWhatsAppService();
    const qrDataUrl = waService.getDeviceQR(req.params.id);

    if (!qrDataUrl) {
      res.json({ success: true, data: null });
      return;
    }

    res.json({ success: true, data: { qr: qrDataUrl } });
  } catch (error) {
    next(error);
  }
}

export async function deleteDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) {
      throw new AppError('Device not found', 404);
    }

    const waService = getWhatsAppService();
    if (waService.isConnected(device.id)) {
      await waService.disconnectDevice(device.id);
    }

    await prisma.device.delete({ where: { id: device.id } });
    logger.info(`Device deleted: ${device.id} by ${req.user!.username}`);

    res.json({ success: true, message: 'Device deleted' });
  } catch (error) {
    next(error);
  }
}

export async function updateDevice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, isActive } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;

    const device = await prisma.device.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
}
