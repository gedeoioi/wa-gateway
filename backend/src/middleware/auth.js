import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { sha256, unauthorized, forbidden } from "../lib/security.js";

/* ---------------------------------- JWT ----------------------------------- */

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthorized("Token tidak ditemukan");

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        isActive: true,
        usedThisMonth: true,
        monthlyQuota: true,
        // Needed by effectiveDeviceLimit(); without it an admin override
        // would be silently ignored on routes that rely on req.user.
        deviceLimitOverride: true,
      },
    });
    if (!user) throw unauthorized("User tidak ditemukan");
    if (!user.isActive) throw forbidden("Akun dinonaktifkan");

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return next(unauthorized("Token kadaluarsa"));
    if (err.name === "JsonWebTokenError") return next(unauthorized("Token tidak valid"));
    next(err);
  }
}

/* -------------------------------- API key --------------------------------- */

function extractApiKey(req) {
  const header = req.headers["x-api-key"];
  if (header) return String(header).trim();

  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    const value = auth.slice(7).trim();
    if (value.startsWith("wag_")) return value;
  }

  // Credentials are only ever read from headers. A query-string fallback would
  // leak keys into proxy/access logs, browser history, and Referer headers.
  return null;
}

export async function requireApiKey(req, _res, next) {
  try {
    const plain = extractApiKey(req);
    if (!plain) throw unauthorized("API key tidak ditemukan. Kirim header X-API-Key.");

    // O(1) lookup by deterministic hash; never compare plaintext in the DB
    const key = await prisma.apiKey.findUnique({
      where: { secretHash: sha256(plain) },
      include: {
        user: { select: { id: true, email: true, plan: true, isActive: true } },
      },
    });

    if (!key || key.revokedAt) throw unauthorized("API key tidak valid atau sudah dicabut");
    if (!key.user.isActive) throw forbidden("Akun dinonaktifkan");

    if (req.requiredScope && !key.scopes.includes(req.requiredScope)) {
      throw forbidden(`API key tidak punya scope "${req.requiredScope}"`);
    }

    prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    req.apiKey = key;
    req.user = key.user;
    next();
  } catch (err) {
    next(err);
  }
}

export const scope = (name) => (req, _res, next) => {
  req.requiredScope = name;
  next();
};

/* --------------------------------- admin ---------------------------------- */

/**
 * Role gate. This is the single place in the codebase that trusts `User.role`;
 * every other route scopes data by ownership (userId) instead.
 * Must run AFTER requireAuth so req.user is populated from the database
 * (not from the JWT payload, which can be stale after a role change).
 */
export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized("Token tidak ditemukan"));
  if (req.user.role !== "admin") return next(forbidden("Akses khusus admin"));
  next();
}

/* ------------------------------- rate limits ------------------------------ */

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKey?.id || req.ip,
  message: { error: "Terlalu banyak request. Coba lagi nanti." },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." },
});

/* ------------------------------ error handler ----------------------------- */

export function notFoundHandler(req, res) {
  // A 404 on an API path is usually a typo or a missing /api prefix. Point the
  // caller at the docs rather than leaving them to guess.
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: `Endpoint ${req.method} ${req.path} tidak ditemukan. Lihat dokumentasi di /docs.`,
    });
  }
  res.status(404).json({ error: "Endpoint tidak ditemukan" });
}

export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;

  /**
   * Malformed JSON body.
   *
   * Express's body parser throws a SyntaxError with the raw parser message
   * ("Expected property name or '}' in JSON at position 1"). That is noise for
   * an API consumer: it names no field, no endpoint, and leaks parser internals.
   * Replace it with something actionable.
   */
  if (err.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err)) {
    return res.status(400).json({
      error:
        "Body request bukan JSON yang valid. Kirim Content-Type: application/json " +
        "dengan body JSON yang benar.",
    });
  }

  // Payload larger than the configured limit
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      error: `Body request terlalu besar. Maksimal ${env.maxUploadMb} MB.`,
    });
  }

  // Database connectivity problems are operational, not client errors
  if (
    err.name === "PrismaClientInitializationError" ||
    err.name === "PrismaClientRustPanicError" ||
    /Can't reach database server/i.test(err.message || "")
  ) {
    status = 503;
  }

  const isServer = status >= 500;

  if (isServer) {
    req.log?.error?.({ err: err.message }, "request failed");
  }

  const safeMessages = {
    503: "Database tidak dapat dijangkau. Periksa koneksi PostgreSQL Anda.",
    500: "Terjadi kesalahan pada server",
  };

  res.status(status).json({
    error: isServer ? (safeMessages[status] ?? safeMessages[500]) : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}

/* --------------------------------- uploads -------------------------------- */

import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { env as config } from "../config/env.js";

fs.mkdirSync(config.uploadDir, { recursive: true });

const safeExt = (name) => {
  const ext = path.extname(name).toLowerCase();
  // Keep only conventional short extensions; drop anything exotic or empty
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    // The original name is kept in Message.mediaName, so the on-disk name only
    // needs to be unique and safe. Deriving the extension from a sanitized
    // basename avoids producing an extension-less or dot-only filename.
    const base = path.basename(file.originalname || "").replace(/[^\w.-]+/g, "_");
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${safeExt(base)}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});
