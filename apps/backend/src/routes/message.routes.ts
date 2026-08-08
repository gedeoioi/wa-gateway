import { Router } from 'express';
import { getMessages, sendMessage, getMessageStats, deleteMessage, deleteAllMessages } from '../controllers/message.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const sendMessageSchema = z.object({
  body: z.object({
    deviceId: z.string().uuid(),
    recipient: z.string().min(8).max(20),
    content: z.string().max(4096).optional().default(''),
    type: z.enum(['text', 'image', 'video', 'document', 'audio']).optional(),
    mediaUrl: z.string().url().optional(),
  }),
});

/**
 * @swagger
 * /api/v1/messages:
 *   get:
 *     summary: Get messages
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of messages
 */
router.get('/', authenticate, getMessages);
router.get('/stats', authenticate, getMessageStats);
router.post('/send', authenticate, authorize('admin', 'operator'), validate(sendMessageSchema), sendMessage);
router.delete('/all', authenticate, authorize('admin', 'operator'), deleteAllMessages);
router.delete('/:id', authenticate, authorize('admin', 'operator'), deleteMessage);

export { router as messageRoutes };
