import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__waPrisma ??
  new PrismaClient({
    log: env.isProd ? ["warn", "error"] : ["warn", "error"],
  });

if (!env.isProd) globalForPrisma.__waPrisma = prisma;

export async function connectDatabase() {
  await prisma.$connect();
  logger.info("database connected");
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
