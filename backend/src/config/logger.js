import pino from "pino";
import { env } from "./env.js";

/**
 * Pretty transport is dev-only and optional: if pino-pretty is not installed
 * we silently fall back to plain JSON logs instead of crashing at boot.
 */
function prettyTransport() {
  if (env.isProd) return undefined;
  try {
    return {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: env.nodeEnv === "production" ? "info" : "debug",
  ...(prettyTransport() ? { transport: prettyTransport() } : {}),
});

export function childLogger(bindings) {
  return logger.child(bindings);
}
