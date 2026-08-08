import { Router } from 'express';
import { getSiteSettings, updateSiteSettings } from '../controllers/site-settings.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/v1/site-settings:
 *   get:
 *     summary: Get site appearance settings
 *     tags: [Site Settings]
 *     responses:
 *       200:
 *         description: Site settings (name, logo, colors, etc.)
 *   put:
 *     summary: Update site appearance settings (admin only)
 *     tags: [Site Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               siteName:
 *                 type: string
 *               siteDescription:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               faviconUrl:
 *                 type: string
 *               primaryColor:
 *                 type: string
 *                 description: "Hex color code (e.g. #075E54)"
 *               accentColor:
 *                 type: string
 *                 description: "Hex color code (e.g. #128C7E)"
 *               footerText:
 *                 type: string
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.get('/', getSiteSettings);
router.put('/', authenticate, authorize('admin'), updateSiteSettings);

export { router as siteSettingsRoutes };
