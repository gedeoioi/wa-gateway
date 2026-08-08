import { Router } from 'express';
import {
  getBroadcasts,
  getBroadcast,
  createBroadcast,
  startBroadcast,
  cancelBroadcast,
  deleteBroadcast,
} from '../controllers/broadcast.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const createBroadcastSchema = z.object({
  body: z.object({
    deviceId: z.string().uuid(),
    name: z.string().min(1).max(255),
    message: z.string().min(1).max(4096),
    type: z.enum(['text', 'image', 'video', 'document', 'audio']).optional(),
    mediaUrl: z.string().url().optional(),
    recipients: z.array(z.string()).min(1).max(10000),
    scheduledAt: z.string().datetime().optional(),
    delayBetweenMessages: z.number().min(1000).max(30000).optional(),
  }),
});

/**
 * @swagger
 * /api/v1/broadcasts:
 *   get:
 *     summary: Get all broadcasts
 *     tags: [Broadcasts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of broadcasts
 */
router.get('/', authenticate, getBroadcasts);
router.get('/:id', authenticate, getBroadcast);
router.post('/', authenticate, authorize('admin', 'operator'), validate(createBroadcastSchema), createBroadcast);
router.post('/:id/start', authenticate, authorize('admin', 'operator'), startBroadcast);
router.post('/:id/cancel', authenticate, authorize('admin', 'operator'), cancelBroadcast);
router.delete('/:id', authenticate, authorize('admin', 'operator'), deleteBroadcast);

export { router as broadcastRoutes };
