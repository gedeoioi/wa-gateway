import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import path from 'path';
import { logger } from '../lib/logger';

export async function uploadFile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const file = req.file;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/${file.filename}`;

    logger.info(`File uploaded: ${file.filename} by ${req.user!.username}`);

    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
    });
  } catch (error) {
    next(error);
  }
}
