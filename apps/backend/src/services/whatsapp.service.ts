import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'node:path';
import fs from 'node:fs';
import QRCode from 'qrcode';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { emitToAll } from '../lib/socket';
import { SESSION_DATA_DIR } from '../constants';

type WASocket = ReturnType<typeof makeWASocket>;

interface DeviceConnection {
  socket: WASocket | null;
  status: string;
  qrDataUrl: string | null;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  maxReconnectAttempts: number;
}

interface ConnectionWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 60000;

class WhatsAppService {
  private connections: Map<string, DeviceConnection> = new Map();
  private waiters: Map<string, ConnectionWaiter[]> = new Map();

  private resolveWaiters(deviceId: string): void {
    const waiters = this.waiters.get(deviceId) || [];
    waiters.forEach((w) => w.resolve());
    this.waiters.delete(deviceId);
  }

  private rejectWaiters(deviceId: string, error: Error): void {
    const waiters = this.waiters.get(deviceId) || [];
    waiters.forEach((w) => w.reject(error));
    this.waiters.delete(deviceId);
  }

  private getReconnectDelay(attempt: number): number {
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
    return delay + Math.random() * 1000;
  }

  private clearReconnectTimer(deviceId: string): void {
    const conn = this.connections.get(deviceId);
    if (conn?.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }
  }

  waitForConnection(deviceId: string, timeoutMs: number = 30000): Promise<void> {
    if (this.isConnected(deviceId)) {
      return Promise.resolve();
    }

    const conn = this.connections.get(deviceId);
    if (conn && conn.status !== 'connecting' && conn.status !== 'qr_pending') {
      return Promise.reject(new Error(`Device ${deviceId} is ${conn.status}`));
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.waiters.get(deviceId) || [];
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`Connection timeout for device ${deviceId}`));
      }, timeoutMs);

      const wrappedResolve = () => {
        clearTimeout(timer);
        resolve();
      };

      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      if (!this.waiters.has(deviceId)) {
        this.waiters.set(deviceId, []);
      }
      this.waiters.get(deviceId)!.push({ resolve: wrappedResolve, reject: wrappedReject });
    });
  }

  async connectDevice(deviceId: string): Promise<void> {
    this.clearReconnectTimer(deviceId);

    if (this.connections.has(deviceId)) {
      const conn = this.connections.get(deviceId);
      if (conn?.socket) {
        try {
          conn.socket.end(undefined);
        } catch {
          // ignore
        }
      }
    }

    const sessionDir = path.join(SESSION_DATA_DIR, deviceId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, undefined),
      },
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 30000,
    });

    this.connections.set(deviceId, {
      socket: sock,
      status: 'connecting',
      qrDataUrl: null,
      reconnectAttempt: 0,
      reconnectTimer: null,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    });

    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'connecting' },
    });
    emitToAll('device:status', { deviceId, status: 'connecting' });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            width: 256,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });

          const conn = this.connections.get(deviceId);
          if (conn) {
            conn.qrDataUrl = qrDataUrl;
            conn.reconnectAttempt = 0;
          }

          await prisma.device.update({
            where: { id: deviceId },
            data: { status: 'qr_pending' },
          });

          this.rejectWaiters(deviceId, new Error('QR_NEEDED'));

          emitToAll('device:qr', { deviceId, qr: qrDataUrl });
          emitToAll('device:status', { deviceId, status: 'qr_pending' });
          logger.info(`QR code generated for device ${deviceId}`);
        } catch (qrError) {
          logger.error('QR generation error:', qrError);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const conn = this.connections.get(deviceId);

        logger.info(`Device ${deviceId} disconnected. statusCode=${statusCode}`);

        if (conn) conn.qrDataUrl = null;

        if (statusCode === DisconnectReason.loggedOut) {
          logger.warn(`Device ${deviceId} logged out. Clearing session.`);
          this.connections.delete(deviceId);
          this.rejectWaiters(deviceId, new Error('Device logged out'));

          await prisma.device.update({
            where: { id: deviceId },
            data: { status: 'disconnected' },
          });
          emitToAll('device:status', { deviceId, status: 'disconnected' });

          const sessionPath = path.join(SESSION_DATA_DIR, deviceId);
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
          return;
        }

        const attempt = conn?.reconnectAttempt ?? 0;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          logger.error(`Device ${deviceId}: max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
          this.connections.delete(deviceId);
          this.rejectWaiters(deviceId, new Error('Max reconnect attempts reached'));

          await prisma.device.update({
            where: { id: deviceId },
            data: { status: 'disconnected' },
          });
          emitToAll('device:status', { deviceId, status: 'disconnected' });
          return;
        }

        const delay = this.getReconnectDelay(attempt);
        logger.info(`Device ${deviceId}: reconnecting in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);

        if (conn) {
          conn.reconnectAttempt = attempt + 1;
          conn.status = 'connecting';
        }

        await prisma.device.update({
          where: { id: deviceId },
          data: { status: 'connecting' },
        });
        emitToAll('device:status', { deviceId, status: 'connecting' });

        const timer = setTimeout(() => {
          this.connectDevice(deviceId);
        }, delay);

        if (conn) conn.reconnectTimer = timer;
      }

      if (connection === 'open') {
        const conn = this.connections.get(deviceId);
        if (conn) {
          conn.status = 'connected';
          conn.qrDataUrl = null;
          conn.reconnectAttempt = 0;
        }

        const phoneNumber = sock.user?.id?.split(':')[0]?.split('@')[0] || null;

        await prisma.device.update({
          where: { id: deviceId },
          data: {
            status: 'connected',
            phoneNumber,
            lastConnectedAt: new Date(),
          },
        });

        this.resolveWaiters(deviceId);

        emitToAll('device:status', { deviceId, status: 'connected' });
        if (phoneNumber) {
          emitToAll('device:connected', { deviceId, phoneNumber });
        }
        logger.info(`Device ${deviceId} connected. Phone: ${phoneNumber}`);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const sender = msg.key.remoteJid;
        if (!sender) continue;

        const content = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || msg.message?.imageMessage?.caption
          || '';

        if (content) {
          emitToAll('message:received', {
            deviceId,
            message: {
              id: msg.key.id,
              sender,
              content,
              timestamp: msg.messageTimestamp,
            },
          });
        }
      }
    });
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    this.clearReconnectTimer(deviceId);

    const conn = this.connections.get(deviceId);
    if (conn) {
      conn.reconnectAttempt = MAX_RECONNECT_ATTEMPTS;
    }

    if (conn?.socket) {
      try {
        conn.socket.end(undefined);
      } catch {
        // ignore
      }
    }
    this.connections.delete(deviceId);
    this.rejectWaiters(deviceId, new Error('Device disconnected'));

    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'disconnected' },
    });
    emitToAll('device:status', { deviceId, status: 'disconnected' });
    logger.info(`Device ${deviceId} disconnected`);
  }

  getDeviceQR(deviceId: string): string | null {
    const conn = this.connections.get(deviceId);
    return conn?.qrDataUrl || null;
  }

  getDeviceStatus(deviceId: string): string | null {
    const conn = this.connections.get(deviceId);
    return conn?.status || null;
  }

  async sendMessage(
    deviceId: string,
    recipient: string,
    content: string,
    type: string = 'text',
    mediaUrl?: string,
  ): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn?.socket) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    const jid = recipient.includes('@s.whatsapp.net')
      ? recipient
      : `${recipient}@s.whatsapp.net`;

    if (type === 'text') {
      await conn.socket.sendMessage(jid, { text: content });
    } else if (type === 'image' && mediaUrl) {
      await conn.socket.sendMessage(jid, {
        image: { url: mediaUrl },
        caption: content,
      });
    } else if (type === 'video' && mediaUrl) {
      await conn.socket.sendMessage(jid, {
        video: { url: mediaUrl },
        caption: content,
      });
    } else if (type === 'document' && mediaUrl) {
      await conn.socket.sendMessage(jid, {
        document: { url: mediaUrl },
        mimetype: 'application/octet-stream',
        fileName: content,
      });
    } else {
      await conn.socket.sendMessage(jid, { text: content });
    }
  }

  getConnection(deviceId: string): DeviceConnection | undefined {
    return this.connections.get(deviceId);
  }

  isConnected(deviceId: string): boolean {
    const conn = this.connections.get(deviceId);
    return conn?.status === 'connected' && conn.socket !== null;
  }

  getActiveDeviceIds(): string[] {
    const active: string[] = [];
    for (const [id, conn] of this.connections) {
      if (conn.status === 'connected') active.push(id);
    }
    return active;
  }
}

let instance: WhatsAppService | null = null;

export function getWhatsAppService(): WhatsAppService {
  if (!instance) {
    instance = new WhatsAppService();
  }
  return instance;
}

export { WhatsAppService };
