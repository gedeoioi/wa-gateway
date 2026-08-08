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
 *     summary: Get all devices
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of devices
 */
router.get('/', authenticate, getDevices);

router.get('/:id', authenticate, getDevice);
router.get('/:id/qr', authenticate, getDeviceQR);
router.post('/', authenticate, authorize('admin', 'operator'), validate(createDeviceSchema), createDevice);
router.put('/:id', authenticate, authorize('admin', 'operator'), updateDevice);
router.delete('/:id', authenticate, authorize('admin'), deleteDevice);
router.post('/:id/connect', authenticate, authorize('admin', 'operator'), connectDevice);
router.post('/:id/disconnect', authenticate, authorize('admin', 'operator'), disconnectDevice);

export { router as deviceRoutes };
