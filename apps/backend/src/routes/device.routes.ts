import { Router } from 'express';
import {
  getDevices,
  getDevice,
  createDevice,
  connectDevice,
  disconnectDevice,
  deleteDevice,
  updateDevice,
  getDeviceQR,
} from '../controllers/device.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
  }),
});

/**
 * @swagger
 * /api/v1/devices:
 *   get:
 *     summary: Get all devices for current user
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of devices
 *   post:
 *     summary: Create a new device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *     responses:
 *       201:
 *         description: Device created
 */
router.get('/', authenticate, getDevices);
router.post('/', authenticate, authorize('admin', 'operator'), validate(createDeviceSchema), createDevice);

/**
 * @swagger
 * /api/v1/devices/{id}:
 *   get:
 *     summary: Get device by ID
 *     tags: [Devices]
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
 *         description: Device details
 *       404:
 *         description: Device not found
 *   put:
 *     summary: Update device name or status
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Device updated
 *   delete:
 *     summary: Delete device
 *     tags: [Devices]
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
 *         description: Device deleted
 */
router.get('/:id', authenticate, getDevice);
router.put('/:id', authenticate, authorize('admin', 'operator'), updateDevice);
router.delete('/:id', authenticate, authorize('admin', 'operator'), deleteDevice);

/**
 * @swagger
 * /api/v1/devices/{id}/qr:
 *   get:
 *     summary: Get QR code for device pairing
 *     tags: [Devices]
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
 *         description: QR code data URL or null
 */
router.get('/:id/qr', authenticate, getDeviceQR);

/**
 * @swagger
 * /api/v1/devices/{id}/connect:
 *   post:
 *     summary: Connect device (start WhatsApp session)
 *     tags: [Devices]
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
 *         description: Device connecting
 */
router.post('/:id/connect', authenticate, authorize('admin', 'operator'), connectDevice);

/**
 * @swagger
 * /api/v1/devices/{id}/disconnect:
 *   post:
 *     summary: Disconnect device
 *     tags: [Devices]
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
 *         description: Device disconnected
 */
router.post('/:id/disconnect', authenticate, authorize('admin', 'operator'), disconnectDevice);

export { router as deviceRoutes };
