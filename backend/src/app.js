import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler, notFoundHandler, apiLimiter } from "./middleware/auth.js";
import { openApiDocument } from "./lib/openapi.js";

import authRoutes from "./modules/auth/auth.routes.js";
import deviceRoutes from "./modules/device/device.routes.js";
import messageRoutes from "./modules/message/message.routes.js";
import broadcastRoutes from "./modules/broadcast/broadcast.routes.js";
import apiKeyRoutes from "./modules/apikey/apikey.routes.js";
import { publicApiHandlers } from "./routes/public-api.routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    }),
  );

  // Serve uploaded media referenced by message logs
  app.use("/uploads", express.static(env.uploadDir, { maxAge: "1h" }));

  app.get("/health", (_req, res) =>
    res.json({ ok: true, uptime: process.uptime(), env: env.nodeEnv }),
  );

  // Swagger UI - convenient to open straight from the dashboard
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "WA Gateway API Docs",
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
  );

  // Dashboard API (JWT)
  app.use("/api/auth", authRoutes);
  app.use("/api/devices", deviceRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/broadcasts", broadcastRoutes);
  app.use("/api/keys", apiKeyRoutes);

  // Public API (API key) - same paths as in the docs.
  // Mounted per-route so unmatched /api/* falls through to a real 404 instead
  // of being rejected by the API-key guard.
  app.post("/api/send-message", publicApiHandlers["/send-message"]);
  app.post("/api/send-broadcast", publicApiHandlers["/send-broadcast"]);
  app.get("/api/device/status", publicApiHandlers["/device/status"]);
  app.get("/api/broadcast/:id", publicApiHandlers["/broadcast/:id"]);
  app.get("/api/messages", publicApiHandlers["/messages"]);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
