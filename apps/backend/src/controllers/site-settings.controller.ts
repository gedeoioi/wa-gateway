import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

export async function getSiteSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });

    if (!settings) {
      settings = await prisma.siteSettings.create({
        data: {
          id: 'default',
          siteName: 'WA Gateway',
          siteDescription: 'WhatsApp Gateway Enterprise',
          primaryColor: '#075E54',
          accentColor: '#128C7E',
        },
      });
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updateSiteSettings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { siteName, siteDescription, logoUrl, faviconUrl, primaryColor, accentColor, footerText } = req.body;

    const settings = await prisma.siteSettings.upsert({
      where: { id: 'default' },
      update: {
        ...(siteName !== undefined && { siteName }),
        ...(siteDescription !== undefined && { siteDescription }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
        ...(faviconUrl !== undefined && { faviconUrl: faviconUrl || null }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(accentColor !== undefined && { accentColor }),
        ...(footerText !== undefined && { footerText: footerText || null }),
      },
      create: {
        id: 'default',
        siteName: siteName || 'WA Gateway',
        siteDescription: siteDescription || 'WhatsApp Gateway Enterprise',
        logoUrl: logoUrl || null,
        faviconUrl: faviconUrl || null,
        primaryColor: primaryColor || '#075E54',
        accentColor: accentColor || '#128C7E',
        footerText: footerText || null,
      },
    });

    logger.info(`Admin ${req.user!.username} updated site settings`);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}
