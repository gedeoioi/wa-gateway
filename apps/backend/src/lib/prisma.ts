import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient({
  log: [
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

prisma.$on('error', (e: { message: string }) => logger.error('Prisma Error:', e));
prisma.$on('warn', (e: { message: string }) => logger.warn('Prisma Warning:', e));

export default prisma;
