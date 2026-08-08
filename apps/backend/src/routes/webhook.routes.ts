import { Router } from 'express';
import { handleWebhook } from '../controllers/webhook.controller';

const router = Router();

router.post('/incoming', handleWebhook);

export { router as webhookRoutes };
