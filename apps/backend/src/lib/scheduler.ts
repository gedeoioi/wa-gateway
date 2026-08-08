import cron from 'node-cron';
import { logger } from './logger';
import prisma from './prisma';
import { addBroadcastJob } from './queue';
import { getWhatsAppService } from '../services/whatsapp.service';
import { emitToAll } from './socket';

export function initScheduler(): void {
  cron.schedule('* * * * *', async () => {
    try {
      const scheduledBroadcasts = await prisma.broadcast.findMany({
        where: {
          status: 'scheduled',
          scheduledAt: { lte: new Date() },
        },
      });

      for (const broadcast of scheduledBroadcasts) {
        const waService = getWhatsAppService();
        if (!waService.isConnected(broadcast.deviceId)) {
          logger.warn(`Skipping scheduled broadcast ${broadcast.id}: device ${broadcast.deviceId} not connected`);
          continue;
        }

        logger.info(`Starting scheduled broadcast: ${broadcast.id}`);

        await prisma.broadcast.update({
          where: { id: broadcast.id },
          data: { status: 'sending', startedAt: new Date() },
        });

        const messages = await prisma.message.findMany({
          where: { broadcastId: broadcast.id, status: 'pending' },
          orderBy: { createdAt: 'asc' },
        });

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          if (!msg) continue;
          await addBroadcastJob({
            broadcastId: broadcast.id,
            deviceId: broadcast.deviceId,
            recipient: msg.recipient,
            content: broadcast.message,
            type: broadcast.type,
            mediaUrl: broadcast.mediaUrl || undefined,
            delay: i * broadcast.delayBetweenMessages,
          });
        }

        emitToAll('broadcast:progress', {
          broadcastId: broadcast.id,
          sent: 0,
          failed: 0,
          total: broadcast.totalRecipients,
        });

        logger.info(`Scheduled broadcast ${broadcast.id} started with ${messages.length} messages`);
      }
    } catch (error) {
      logger.error('Scheduler error:', error);
    }
  });

  logger.info('Scheduler initialized');
}
