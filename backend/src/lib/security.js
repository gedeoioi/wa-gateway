import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

/* ---------------------------------- errors --------------------------------- */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = "Unauthorized") => new HttpError(401, msg);
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);

/* --------------------------------- async ---------------------------------- */

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* -------------------------------- passwords -------------------------------- */

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/* ------------------------------ API key crypto ----------------------------- */
// The raw API key is NEVER stored in plaintext.
//  - secretHash (sha256)  -> deterministic lookup at auth time
//  - secretEnc (aes-gcm)  -> reversible, so the dashboard can reveal it again
// Both are needed; a plain hash alone would make "show my key" impossible.

function encryptionKey() {
  const raw = env.apiKeyEncryptionSecret;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  // Derive a stable 32-byte key from any arbitrary secret string
  return crypto.createHash("sha256").update(raw).digest();
}

export function generateApiKey() {
  const prefix = `wag_${crypto.randomBytes(4).toString("hex")}`;
  const secret = crypto.randomBytes(28).toString("base64url");
  const plain = `${prefix}_${secret}`;
  return { plain, prefix, secretHash: sha256(plain) };
}

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload) {
  const [ivPart, tagPart, dataPart] = String(payload).split(".");
  if (!ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

export function maskKey(plain) {
  if (!plain) return null;
  const [prefix] = plain.split("_");
  return `${prefix}_${"•".repeat(8)}${plain.slice(-4)}`;
}
