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
    message: z.string().max(4096).optional().default(''),
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
 *     summary: Get all broadcasts for current user
 *     tags: [Broadcasts]
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
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, scheduled, sending, completed, failed, cancelled]
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of broadcasts with pagination
 *   post:
 *     summary: Create a new broadcast
 *     tags: [Broadcasts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [deviceId, name, recipients]
 *             properties:
 *               deviceId:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [text, image, video, document, audio]
 *               mediaUrl:
 *                 type: string
 *                 format: uri
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of phone numbers
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *               delayBetweenMessages:
 *                 type: integer
 *                 default: 2000
 *     responses:
 *       201:
 *         description: Broadcast created
 */
router.get('/', authenticate, getBroadcasts);
router.post('/', authenticate, authorize('admin', 'operator'), validate(createBroadcastSchema), createBroadcast);

/**
 * @swagger
 * /api/v1/broadcasts/{id}:
 *   get:
 *     summary: Get broadcast details with messages
 *     tags: [Broadcasts]
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
 *         description: Broadcast details
 *       404:
 *         description: Broadcast not found
 */
router.get('/:id', authenticate, getBroadcast);

/**
 * @swagger
 * /api/v1/broadcasts/{id}/start:
 *   post:
 *     summary: Start a broadcast
 *     tags: [Broadcasts]
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
 *         description: Broadcast started
 *       400:
 *         description: Broadcast cannot be started
 */
router.post('/:id/start', authenticate, authorize('admin', 'operator'), startBroadcast);

/**
 * @swagger
 * /api/v1/broadcasts/{id}/cancel:
 *   post:
 *     summary: Cancel a sending broadcast
 *     tags: [Broadcasts]
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
 *         description: Broadcast cancelled
 */
router.post('/:id/cancel', authenticate, authorize('admin', 'operator'), cancelBroadcast);

/**
 * @swagger
 * /api/v1/broadcasts/{id}:
 *   delete:
 *     summary: Delete a broadcast
 *     tags: [Broadcasts]
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
 *         description: Broadcast deleted
 *       400:
 *         description: Cannot delete a sending broadcast
 */
router.delete('/:id', authenticate, authorize('admin', 'operator'), deleteBroadcast);

export { router as broadcastRoutes };
