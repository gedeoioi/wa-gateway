import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

function bool(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: num(process.env.PORT, 4000),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${num(process.env.PORT, 4000)}`,

  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  apiKeyEncryptionSecret:
    process.env.API_KEY_ENCRYPTION_SECRET || "dev-only-api-key-encryption-secret-000000",

  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "",

  waSessionDir: path.resolve(rootDir, process.env.WA_SESSION_DIR || "./.wa-sessions"),
  waDebug: bool(process.env.WA_DEBUG, false),

  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || "./uploads"),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 16),

  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 120),
  },
};

export const isQueueEnabled = Boolean(env.redisUrl);
