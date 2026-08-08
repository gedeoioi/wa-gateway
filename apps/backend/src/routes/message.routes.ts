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
 *     summary: Get messages for current user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, delivered, read, failed]
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [inbound, outbound]
 *       - in: query
 *         name: recipient
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of messages with pagination
 */
router.get('/', authenticate, getMessages);

/**
 * @swagger
 * /api/v1/messages/stats:
 *   get:
 *     summary: Get message statistics
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Message counts (total, sent, delivered, failed)
 */
router.get('/stats', authenticate, getMessageStats);

/**
 * @swagger
 * /api/v1/messages/send:
 *   post:
 *     summary: Send a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [deviceId, recipient]
 *             properties:
 *               deviceId:
 *                 type: string
 *                 format: uuid
 *               recipient:
 *                 type: string
 *                 description: Phone number with country code
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [text, image, video, document, audio]
 *               mediaUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Message sent
 *       400:
 *         description: Device not connected
 */
router.post('/send', authenticate, authorize('admin', 'operator'), validate(sendMessageSchema), sendMessage);

/**
 * @swagger
 * /api/v1/messages/all:
 *   delete:
 *     summary: Delete all messages for current user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All messages deleted
 */
router.delete('/all', authenticate, authorize('admin', 'operator'), deleteAllMessages);

/**
 * @swagger
 * /api/v1/messages/{id}:
 *   delete:
 *     summary: Delete a single message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Message deleted
 *       404:
 *         description: Message not found
 */
router.delete('/:id', authenticate, authorize('admin', 'operator'), deleteMessage);

export { router as messageRoutes };
