import path from "node:path";
import fs from "node:fs/promises";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode";
import { env } from "../config/env.js";
import { childLogger } from "../config/logger.js";
import { prisma } from "../db/prisma.js";

const RECONNECT_BASE_DELAY = 3_000;
const RECONNECT_MAX_DELAY = 60_000;

/**
 * Owns one Baileys socket per Device row and exposes send/reconnect/prune APIs.
 * Kept deliberately memory-light: only the auth creds + last QR string are held,
 * message history is streamed straight to Postgres.
 */
class WhatsAppManager {
  constructor() {
    /** @type {Map<string, InstanceType<typeof WaSession>>} */
    this.sessions = new Map();
    /** @type {Set<(event: object) => void>} */
    this.listeners = new Set();
    this.log = childLogger({ mod: "wa" });
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.log.warn({ err: err.message }, "ws listener failed");
      }
    }
  }

  sessionDir(sessionId) {
    return path.join(env.waSessionDir, sessionId);
  }

  get(deviceId) {
    return this.sessions.get(deviceId);
  }

  isConnected(deviceId) {
    return this.sessions.get(deviceId)?.status === "connected";
  }

  /** Boot every active device that belongs to a user (used on cold start). */
  async restoreAll() {
    const devices = await prisma.device.findMany({
      where: { isActive: true, status: { not: "logged_out" } },
      select: { id: true, sessionId: true, userId: true },
    });

    this.log.info({ count: devices.length }, "restoring devices");
    for (const device of devices) {
      this.start(device.id).catch((err) =>
        this.log.error({ err: err.message, deviceId: device.id }, "restore failed"),
      );
    }
  }

  /** Create (or reuse) the socket for a device and begin connecting. */
  async start(deviceId) {
    const existing = this.sessions.get(deviceId);
    if (existing && !existing.destroyed) {
      if (existing.status === "disconnected") existing.connect();
      return existing;
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    const session = new WaSession({ manager: this, device });
    this.sessions.set(deviceId, session);
    await session.connect();
    return session;
  }

  async stop(deviceId, { logout = false } = {}) {
    const session = this.sessions.get(deviceId);
    if (session) {
      await session.destroy({ logout });
      this.sessions.delete(deviceId);
    }
    if (logout) {
      await fs.rm(this.sessionDir(session?.device?.sessionId ?? deviceId), {
        recursive: true,
        force: true,
      });
      await prisma.device.update({
        where: { id: deviceId },
        data: { status: "logged_out", phoneNumber: null, lastError: null },
      });
    }
  }

  /** Send a message through a connected session. */
  async send(deviceId, payload) {
    const session = this.sessions.get(deviceId);
    if (!session) throw new Error("Device belum terhubung");
    return session.send(payload);
  }

  async logoutAllForUser(userId) {
    const devices = await prisma.device.findMany({ where: { userId }, select: { id: true } });
    for (const device of devices) {
      await this.stop(device.id, { logout: true });
    }
  }
}

class WaSession {
  constructor({ manager, device }) {
    this.manager = manager;
    this.device = device;
    this.sessionId = device.sessionId;
    this.status = "disconnected";
    this.qr = null;
    this.sock = null;
    this.destroyed = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.profile = null;
    this.log = childLogger({ mod: "wa", deviceId: device.id });
  }

  async updateStatus(status, patch = {}) {
    this.status = status;
    await prisma.device
      .update({
        where: { id: this.device.id },
        data: { status, ...patch },
      })
      .catch((err) => this.log.warn({ err: err.message }, "status persist failed"));

    // QR is only meaningful while pairing; never leak it after connection
    this.manager.emit({
      type: "device.status",
      deviceId: this.device.id,
      status,
      qr: status === "connecting" ? this.qr : null,
      phoneNumber: patch.phoneNumber ?? this.device.phoneNumber ?? null,
      error: patch.lastError ?? null,
    });
  }

  async connect() {
    if (this.destroyed) return;
    this.clearReconnect();
    await this.updateStatus("connecting");

    const { state, saveCreds } = await useMultiFileAuthState(this.manager.sessionDir(this.sessionId));
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 10] }));

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        // Cache signal keys in memory to avoid hammering the filesystem
        keys: makeCacheableSignalKeyStore(state.keys, this.log),
      },
      logger: this.log.child({ mod: "baileys" }, { level: env.waDebug ? "debug" : "silent" }),
      printQRInTerminal: false,
      browser: ["WA Gateway", "Chrome", "1.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        // Baileys calls this when retrying or decrypting a message we sent.
        // Resolve from our own log so retries work without keeping message
        // bodies resident in memory.
        const row = await prisma.message
          .findFirst({
            where: { deviceId: this.device.id, providerId: key.id },
            select: { body: true },
          })
          .catch(() => null);
        if (!row) return undefined;
        return { conversation: row.body ?? "" };
      },
    });

    this.registerEvents(saveCreds);

    if (!this.sock.authState.creds.registered) {
      // qr is emitted by connection.update; nothing else to do here
      this.log.info("awaiting QR scan");
    }
  }

  registerEvents(saveCreds) {
    const sock = this.sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qr = await qrcode.toDataURL(qr, { margin: 1, width: 320 });
        await this.updateStatus("connecting");
      }

      if (connection === "open") {
        this.reconnectAttempts = 0;
        this.qr = null;
        const me = sock.user;
        this.profile = me
          ? { id: jidNormalizedUser(me.id), name: me.name || me.verifiedName || null }
          : null;
        await this.updateStatus("connected", {
          phoneNumber: me?.id ? jidNormalizedUser(me.id).split("@")[0] : null,
          lastSeenAt: new Date(),
          lastError: null,
        });
        this.log.info({ jid: me?.id }, "connected");
      }

      if (connection === "close") {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const replaced = statusCode === DisconnectReason.connectionReplaced;

        if (loggedOut || replaced) {
          this.log.warn({ statusCode }, "session invalidated, stopping");
          this.destroyed = true;
          this.qr = null;
          await this.updateStatus("logged_out", {
            lastError: loggedOut ? "Sesi logout dari perangkat" : "Sesi dipakai perangkat lain",
          });
          this.manager.sessions.delete(this.device.id);
          if (loggedOut) {
            await fs
              .rm(this.manager.sessionDir(this.sessionId), { recursive: true, force: true })
              .catch(() => {});
          }
          return;
        }

        await this.updateStatus("disconnected", {
          lastError: lastDisconnect?.error?.message || "Koneksi terputus",
        });
        this.scheduleReconnect();
      }
    });

    // Incoming messages -> persist so the logs page shows both directions
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const remote = msg.key.remoteJid;
        if (!remote || remote === "status@broadcast") continue;
        try {
          const body =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.documentMessage?.caption ||
            "";
          await prisma.message.create({
            data: {
              userId: this.device.userId,
              deviceId: this.device.id,
              direction: "inbound",
              to: remote,
              body,
              type: msg.message?.imageMessage ? "image" : "text",
              status: "sent",
              providerId: msg.key.id,
              source: "inbound",
              sentAt: new Date(),
            },
          });
          this.manager.emit({
            type: "message.inbound",
            deviceId: this.device.id,
            from: remote,
          });
        } catch (err) {
          this.log.warn({ err: err.message }, "failed to store inbound message");
        }
      }
    });
  }

  scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY);
    this.reconnectAttempts += 1;
    this.log.info({ delay, attempt: this.reconnectAttempts }, "reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        this.log.error({ err: err.message }, "reconnect failed");
        this.scheduleReconnect();
      });
    }, delay);
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async send({ to, body, media, mediaMime, mediaName }) {
    if (this.status !== "connected" || !this.sock) {
      throw new Error("Device tidak terhubung. Scan QR terlebih dahulu.");
    }

    const jid = jidNormalizedUser(to);
    let content;

    if (media?.buffer) {
      const isImage = (mediaMime || "").startsWith("image/");
      const payload = {
        [isImage ? "image" : "document"]: media.buffer,
        mimetype: mediaMime || "application/octet-stream",
        caption: body || undefined,
        fileName: mediaName || "file",
      };
      content = payload;
    } else {
      content = { text: body ?? "" };
    }

    const result = await this.sock.sendMessage(jid, content);
    return {
      providerId: result?.key?.id ?? null,
      jid,
      onWhatsApp: true,
    };
  }

  async downloadMedia(message) {
    return downloadMediaMessage(message, "buffer", {}, { reuploadRequest: this.sock.updateMediaMessage });
  }

  async destroy({ logout = false } = {}) {
    this.destroyed = true;
    this.clearReconnect();
    try {
      if (this.sock) {
        if (logout) await this.sock.logout().catch(() => {});
        await this.sock.end(undefined);
        this.sock.ws?.close?.();
      }
    } catch (err) {
      this.log.warn({ err: err.message }, "socket teardown error");
    }
    this.sock = null;
  }
}

export const waManager = new WhatsAppManager();
