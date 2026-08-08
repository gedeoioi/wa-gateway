import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

export async function handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info('Webhook received:', { body: req.body });
    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    next(error);
  }
}

export async function getApiKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: apiKeys });
  } catch (error) {
    next(error);
  }
}
