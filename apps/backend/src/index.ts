import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import { createServer } from 'node:http';
import { app } from './app';
import { logger } from './lib/logger';
import { initSocket } from './lib/socket';
import { initQueues } from './lib/queue';
import { initScheduler } from './lib/scheduler';
import prisma from './lib/prisma';
import { getWhatsAppService } from './services/whatsapp.service';

const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

async function autoConnectDevices(): Promise<void> {
  try {
    const devices = await prisma.device.findMany({
      where: {
        status: 'connected',
        isActive: true,
      },
    });

    if (devices.length === 0) {
      logger.info('No devices to auto-connect');
      return;
    }

    const waService = getWhatsAppService();
    for (const device of devices) {
      logger.info(`Auto-connecting device: ${device.name} (${device.id})`);
      try {
        await waService.connectDevice(device.id);
      } catch (err) {
        logger.error(`Auto-connect failed for ${device.name}: ${err}`);
        await prisma.device.update({
          where: { id: device.id },
          data: { status: 'disconnected' },
        });
      }
    }
  } catch (err) {
    logger.error('Auto-connect error:', err);
  }
}

async function main() {
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (dbErr) {
    logger.error('Database connection failed:', dbErr);
    process.exit(1);
  }

  const server = createServer(app);

  initSocket(server);

  initQueues().catch((err) => {
    logger.error('Queue init failed (will retry):', err.message);
  });

  initScheduler();

  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    autoConnectDevices();
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
