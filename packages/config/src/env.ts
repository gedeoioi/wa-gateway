import 'dotenv/config';

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: getEnv('NODE_ENV', 'development'),
  isDev: process.env.NODE_ENV !== 'production',
  backend: {
    port: parseInt(getEnv('BACKEND_PORT', '3001'), 10),
    url: getEnv('BACKEND_URL', 'http://localhost:3001'),
  },
  frontend: {
    url: getEnv('FRONTEND_URL', 'http://localhost:3000'),
  },
  database: {
    url: getEnv('DATABASE_URL'),
  },
  redis: {
    url: getEnv('REDIS_URL', 'redis://localhost:6379'),
  },
  jwt: {
    secret: getEnv('JWT_SECRET'),
    refreshSecret: getEnv('JWT_REFRESH_SECRET'),
    expiresIn: getEnv('JWT_EXPIRES_IN', '15m'),
    refreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  encryption: {
    key: getEnv('ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef'),
  },
  log: {
    level: getEnv('LOG_LEVEL', 'info'),
  },
} as const;
