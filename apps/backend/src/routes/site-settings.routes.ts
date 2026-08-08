import { Router } from 'express';
import { getSiteSettings, updateSiteSettings } from '../controllers/site-settings.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', getSiteSettings);
router.put('/', authenticate, authorize('admin'), updateSiteSettings);

export { router as siteSettingsRoutes };
