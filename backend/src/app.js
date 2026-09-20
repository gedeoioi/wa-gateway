import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler, notFoundHandler, apiLimiter } from "./middleware/auth.js";
import { openApiDocument } from "./lib/openapi.js";
import { publicPlanCatalog, GLOBAL_MAX_DEVICES } from "./config/plans.js";

/**
 * Route demultiplexer.
 *
 * `GET /api/messages` and `GET /api/broadcast/:id` are served to two different
 * clients: the dashboard (JWT) and the public API (API key). Express dispatches
 * by registration order, so whichever router is registered first would always
 * win — breaking the other client.
 *
 * This guard inspects the request: when an API-key credential is present it lets
 * the public handler run; otherwise it calls next() so the request reaches the
 * JWT router. That keeps one documented URL working for both audiences.
 */
function hasApiKey(req) {
  if (req.headers["x-api-key"]) return true;
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer wag_");
}

function onlyIfApiKey(req, res, next) {
  if (hasApiKey(req)) return next();
  // "route" skips this route entirely and continues with the next matching one,
  // which is how a JWT request reaches the dashboard router behind it.
  return next("route");
}

// ---------------------------------------------------------------------------
// Public API (API key)
//
// `shared` routes also exist on a dashboard router under the same path, so they
// are guarded with onlyIfApiKey to let JWT requests fall through.
// The rest exist only here and let their own requireApiKey middleware produce a
// proper 401 when the key is missing.
// ---------------------------------------------------------------------------
const shared = (handler) => [onlyIfApiKey, ...handler];

import authRoutes from "./modules/auth/auth.routes.js";
import deviceRoutes from "./modules/device/device.routes.js";
import messageRoutes from "./modules/message/message.routes.js";
import broadcastRoutes from "./modules/broadcast/broadcast.routes.js";
import apiKeyRoutes from "./modules/apikey/apikey.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import { publicApiHandlers } from "./routes/public-api.routes.js";

export function createApp() {
  const app = express();

  // ---------------------------------------------------------------------------
  // Proxy trust.
  //
  // `req.ip` and express-rate-limit keying depend on this. The number of hops
  // must match the real topology or the recorded client IP is wrong:
  //   direct / single Nginx            -> 1
  //   Cloudflare -> Nginx -> app       -> 2
  //
  // Cloudflare also sends a spoofable X-Forwarded-For, so trusting too many
  // hops would let a client forge its own IP and bypass rate limiting.
  // Configure with TRUST_PROXY_HOPS (default 2).
  // ---------------------------------------------------------------------------
  app.set("trust proxy", env.trustProxyHops);

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

  // ---------------------------------------------------------------------------
  // Tell Cloudflare never to cache API or realtime responses.
  //
  // The edge caches by file extension/URL heuristics. A cached /health or
  // Socket.IO polling response would report stale state, and a cached API
  // response could leak one user's data to another. These endpoints are dynamic
  // by nature and must always reach the origin.
  // ---------------------------------------------------------------------------
  app.use(["/api", "/socket.io", "/health", "/openapi.json"], (_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    // Cloudflare-specific: bypass cache entirely for these paths
    res.set("CDN-Cache-Control", "no-store");
    res.set("Cloudflare-CDN-Cache-Control", "no-store");
    next();
  });

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

  app.get(
    "/api/plans",
    (_req, res) => res.json({ plans: publicPlanCatalog(), globalMaxDevices: GLOBAL_MAX_DEVICES }),
  );

  // ---------------------------------------------------------------------------
  // Public API (API key) — mounted BEFORE the dashboard routes.
  //
  // Two of these paths also exist on the dashboard routers with different auth
  // (`GET /api/messages` and `GET /api/broadcast/:id`). Express matches in
  // registration order, so if the JWT routers were registered first they would
  // swallow API-key requests and reply "Token tidak ditemukan".
  //
  // `shared` routes only handle the request when an API key is present;
  // otherwise they fall through to the dashboard router so both clients keep
  // working on the same documented URL.
  // ---------------------------------------------------------------------------
  app.post("/api/send-message", ...publicApiHandlers["/send-message"]);
  app.post("/api/send-broadcast", ...publicApiHandlers["/send-broadcast"]);
  app.get("/api/device/status", ...publicApiHandlers["/device/status"]);
  app.get("/api/broadcast/:id", ...shared(publicApiHandlers["/broadcast/:id"]));
  app.get("/api/messages", ...shared(publicApiHandlers["/messages"]));

  // Dashboard API (JWT) — registered second, so an API-key request is already
  // handled above and only JWT requests reach these routers.
  app.use("/api/auth", authRoutes);
  app.use("/api/devices", deviceRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/broadcasts", broadcastRoutes);
  app.use("/api/keys", apiKeyRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
