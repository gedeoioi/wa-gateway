import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { authRoutes } from './routes/auth.routes';
import { deviceRoutes } from './routes/device.routes';
import { messageRoutes } from './routes/message.routes';
import { broadcastRoutes } from './routes/broadcast.routes';
import { contactRoutes } from './routes/contact.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { uploadRoutes } from './routes/upload.routes';
import path from 'path';
import { errorHandler } from './middleware/error-handler';
import { logger } from './lib/logger';
import { isQueueReady, getBroadcastQueueStats } from './lib/queue';
import { API_PREFIX } from './constants';

export const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression() as unknown as express.RequestHandler);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later.' },
  });
  app.use(`${API_PREFIX}/`, limiter as unknown as express.RequestHandler);
}

app.use(morgan('combined', {
  stream: { write: (message: string) => logger.info(message.trim()) },
}));

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WA Gateway API',
      version: '1.0.0',
      description: 'WhatsApp Gateway Enterprise API',
    },
    servers: [{ url: `http://localhost:${process.env.BACKEND_PORT || 3001}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
});

const swaggerUiHandler = swaggerUi.serve as unknown as express.RequestHandler;
const swaggerSetupHandler = swaggerUi.setup(swaggerSpec) as unknown as express.RequestHandler;
app.use('/api-docs', swaggerUiHandler, swaggerSetupHandler);

app.get('/health', async (_req, res) => {
  const queueStats = isQueueReady() ? await getBroadcastQueueStats() : null;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    queue: {
      ready: isQueueReady(),
      stats: queueStats,
    },
  });
});

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/devices`, deviceRoutes);
app.use(`${API_PREFIX}/messages`, messageRoutes);
app.use(`${API_PREFIX}/broadcasts`, broadcastRoutes);
app.use(`${API_PREFIX}/contacts`, contactRoutes);
app.use(`${API_PREFIX}/webhooks`, webhookRoutes);
app.use(`${API_PREFIX}/upload`, uploadRoutes);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(errorHandler);
