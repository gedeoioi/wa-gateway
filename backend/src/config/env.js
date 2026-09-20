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

/** Secrets that must never reach production with a default value. */
const INSECURE_DEFAULTS = [
  "dev-only-insecure-secret",
  "dev-only-api-key-encryption-secret-000000",
  "change-me-in-production-please-use-a-long-random-string",
  "change-me-too-32-bytes-hex-or-64-chars",
];

function isInsecureSecret(value) {
  if (!value) return true;
  if (INSECURE_DEFAULTS.includes(value)) return true;
  return value.startsWith("change-me") || value.startsWith("dev-only");
}

export const nodeEnv = process.env.NODE_ENV || "development";
export const isProd = nodeEnv === "production";

/**
 * Resolve whether we are in production at call time.
 *
 * This deliberately reads process.env instead of the module-level `isProd`
 * constant: the constant is frozen at import, which made the guard impossible
 * to exercise in tests (and would break any code that sets NODE_ENV later).
 */
function resolveIsProd() {
  return (process.env.NODE_ENV || nodeEnv) === "production";
}

/**
 * Refuse to boot in production with missing or placeholder secrets.
 * A silent fallback here is a forgery risk: the default JWT secret is public
 * in the source, so anyone could mint a valid token and log in as any user,
 * including an admin.
 */
export function assertProductionSecrets({
  jwtSecret,
  apiKeyEncryptionSecret,
  databaseUrl,
  frontendUrl,
} = {}) {
  if (!resolveIsProd()) return;

  const problems = [];
  if (isInsecureSecret(jwtSecret)) {
    problems.push("JWT_SECRET is missing or still a placeholder value");
  }
  if (isInsecureSecret(apiKeyEncryptionSecret)) {
    problems.push("API_KEY_ENCRYPTION_SECRET is missing or still a placeholder value");
  }
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set");
  }
  if (!frontendUrl || /localhost|127\.0\.0\.1/.test(frontendUrl)) {
    problems.push(`FRONTEND_URL must be the public origin (got "${frontendUrl}")`);
  }

  if (problems.length) {
    const message =
      "Refusing to start in production:\n" +
      problems.map((p) => `  - ${p}`).join("\n") +
      "\n\nGenerate secrets with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";
    const err = new Error(message);
    err.code = "INSECURE_CONFIG";
    throw err;
  }
}

export const env = {
  nodeEnv,
  isProd,
  port: num(process.env.PORT, 4000),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3100",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${num(process.env.PORT, 4000)}`,

  // Fallbacks are kept so local development works without a .env file, but
  // assertProductionSecrets() refuses to boot in production when these are
  // still the defaults.
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

  /**
   * Number of reverse-proxy hops in front of the app, used for `trust proxy`.
   *   1 = single Nginx
   *   2 = Cloudflare -> Nginx (default)
   * Set higher only if you add more proxies; over-trusting lets clients spoof
   * their IP via X-Forwarded-For and evade rate limits.
   */
  trustProxyHops: num(process.env.TRUST_PROXY_HOPS, 2),
};

assertProductionSecrets(env);

export const isQueueEnabled = Boolean(env.redisUrl);
