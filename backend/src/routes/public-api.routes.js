import { z } from "zod";
import fs from "node:fs/promises";
import { prisma } from "../db/prisma.js";
import { asyncHandler, badRequest, notFound } from "../lib/security.js";
import { requireApiKey, scope, apiLimiter, upload } from "../middleware/auth.js";
import { dispatchMessage, assertQuota } from "../whatsapp/dispatcher.js";
import { normalizePhone } from "../lib/phone.js";
import { enqueueBroadcast } from "../queue/broadcast.worker.js";
import { waManager } from "../whatsapp/manager.js";

/**
 * Routes are exported as individual handler chains (instead of one router
 * mounted at /api) so that an unknown /api/* path returns a genuine 404
 * rather than being intercepted by the API-key guard.
 */
const guard = [requireApiKey, apiLimiter];

/**
 * @openapi
 * /api/send-message:
 *   post:
 *     tags: [Messaging]
 *     summary: Kirim pesan ke satu nomor
 *     security: [{ ApiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SendMessageRequest' }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               to: { type: string, example: '6281234567890' }
 *               body: { type: string, example: 'Halo dari API' }
 *               deviceId: { type: string }
 *               media: { type: string, format: binary }
 *     responses:
 *       201: { description: Pesan terkirim }
 *       401: { description: API key tidak valid }
 *       429: { description: Rate limit / kuota habis }
 */
const sendMessageHandler = [
  scope("send"),
  ...guard,
  upload.single("media"),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        to: z.string().min(6),
        body: z.string().max(4096).optional().default(""),
        deviceId: z.string().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);
    }

    const { to, body, deviceId } = parsed.data;
    if (!body && !req.file) throw badRequest("Parameter 'body' atau media wajib diisi");

    await assertQuota(req.user.id);

    let media = null;
    let mediaUrl = null;
    if (req.file) {
      media = await fs.readFile(req.file.path);
      mediaUrl = `/uploads/${req.file.filename}`;
    }

    try {
      const message = await dispatchMessage({
        userId: req.user.id,
        deviceId,
        to,
        body,
        media,
        mediaMime: req.file?.mimetype ?? null,
        mediaName: req.file?.originalname ?? null,
        mediaUrl,
        source: "api",
      });

      res.status(201).json({
        success: true,
        data: {
          id: message.id,
          to: message.to,
          status: message.status,
          providerId: message.providerId,
          sentAt: message.sentAt,
        },
      });
    } finally {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
    }
  }),
];

/**
 * @openapi
 * /api/send-broadcast:
 *   post:
 *     tags: [Messaging]
 *     summary: Kirim pesan massal
 *     description: |
 *       Menerima daftar nomor (string multiline atau array). Mendukung template
 *       `{{nama}}` dan `{{nomor}}`. Broadcast dijalankan lewat queue dengan delay.
 *     security: [{ ApiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SendBroadcastRequest' }
 *     responses:
 *       202: { description: Broadcast masuk queue }
 */
const sendBroadcastHandler = [
  scope("send"),
  ...guard,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().max(80).optional(),
      deviceId: z.string().optional(),
      template: z.string().min(1).max(4096).optional(),
      message: z.string().min(1).max(4096).optional(),
      recipients: z.union([z.string(), z.array(z.union([z.string(), z.record(z.any())]))]),
      delayMs: z.coerce.number().int().min(1000).max(120_000).optional().default(4000),
      batchSize: z.coerce.number().int().min(1).max(200).optional().default(20),
      batchPauseMs: z.coerce.number().int().min(0).max(3_600_000).optional().default(60_000),
      startNow: z.coerce.boolean().optional().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);
    const data = parsed.data;
    const template = data.template || data.message;
    if (!template) throw badRequest("Parameter 'template' wajib diisi");

    const rows = normalizeRecipientInput(data.recipients);
    if (!rows.length) throw badRequest("Daftar recipients kosong");

    const seen = new Set();
    const recipients = [];
    const invalid = [];
    for (const row of rows) {
      try {
        const jid = normalizePhone(row.phone);
        const digits = jid.split("@")[0];
        if (seen.has(digits)) continue;
        seen.add(digits);
        recipients.push({ phone: digits, name: row.name ?? null });
      } catch (err) {
        invalid.push({ phone: String(row.phone), reason: err.message });
      }
    }

    if (!recipients.length) throw badRequest("Tidak ada nomor valid", { invalid });
    if (recipients.length > 5000) throw badRequest("Maksimal 5000 recipients per request");

    await assertQuota(req.user.id);

    const device = await prisma.device.findFirst({
      where: { userId: req.user.id, ...(data.deviceId ? { id: data.deviceId } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    if (!device) throw badRequest("Belum ada device terhubung");
    if (device.status !== "connected") throw badRequest("Device belum terhubung ke WhatsApp");

    const broadcast = await prisma.broadcast.create({
      data: {
        userId: req.user.id,
        deviceId: device.id,
        name: data.name || `API Broadcast ${new Date().toISOString()}`,
        template,
        delayMs: data.delayMs,
        batchSize: data.batchSize,
        batchPauseMs: data.batchPauseMs,
        total: recipients.length,
        pending: recipients.length,
        status: data.startNow ? "queued" : "draft",
        recipients: {
          create: recipients.map((r) => ({
            phone: r.phone,
            name: r.name,
            body: render(template, r),
          })),
        },
      },
    });

    if (data.startNow) await enqueueBroadcast(broadcast.id);

    res.status(202).json({
      success: true,
      data: {
        broadcastId: broadcast.id,
        status: broadcast.status,
        total: broadcast.total,
        accepted: recipients.length,
        rejected: invalid,
      },
    });
  }),
];

/**
 * @openapi
 * /api/device/status:
 *   get:
 *     tags: [Device]
 *     summary: Cek status koneksi device
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: deviceId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Status device }
 */
const deviceStatusHandler = [
  scope("read"),
  ...guard,
  asyncHandler(async (req, res) => {
    const { deviceId } = req.query;

    const devices = await prisma.device.findMany({
      where: { userId: req.user.id, ...(deviceId ? { id: String(deviceId) } : {}) },
      orderBy: { createdAt: "asc" },
    });

    if (deviceId && !devices.length) throw notFound("Device tidak ditemukan");

    res.json({
      success: true,
      data: devices.map((d) => ({
        id: d.id,
        name: d.name,
        status: waManager.get(d.id)?.status ?? d.status,
        connected: (waManager.get(d.id)?.status ?? d.status) === "connected",
        phoneNumber: d.phoneNumber,
        lastSeenAt: d.lastSeenAt,
      })),
    });
  }),
];

/**
 * @openapi
 * /api/broadcast/{id}:
 *   get:
 *     tags: [Messaging]
 *     summary: Status & progress broadcast
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Detail broadcast }
 */
const broadcastStatusHandler = [
  scope("read"),
  ...guard,
  asyncHandler(async (req, res) => {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { recipients: { orderBy: { createdAt: "asc" }, take: 1000 } },
    });
    if (!broadcast) throw notFound("Broadcast tidak ditemukan");

    res.json({
      success: true,
      data: {
        id: broadcast.id,
        name: broadcast.name,
        status: broadcast.status,
        total: broadcast.total,
        sent: broadcast.sent,
        failed: broadcast.failed,
        pending: broadcast.pending,
        progress: broadcast.total
          ? Math.round(((broadcast.sent + broadcast.failed) / broadcast.total) * 100)
          : 0,
        startedAt: broadcast.startedAt,
        finishedAt: broadcast.finishedAt,
        recipients: broadcast.recipients.map((r) => ({
          phone: r.phone,
          status: r.status,
          error: r.error,
          sentAt: r.sentAt,
        })),
      },
    });
  }),
];

/**
 * @openapi
 * /api/messages:
 *   get:
 *     tags: [Messaging]
 *     summary: Riwayat pesan
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [queued, sending, sent, failed] }
 *     responses:
 *       200: { description: Daftar pesan }
 */
const messagesHandler = [
  scope("read"),
  ...guard,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = { userId: req.user.id };
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.deviceId) where.deviceId = String(req.query.deviceId);

    const [items, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where }),
    ]);

    res.json({
      success: true,
      data: items.map((m) => ({
        id: m.id,
        to: m.to,
        body: m.body,
        type: m.type,
        status: m.status,
        error: m.error,
        sentAt: m.sentAt,
        createdAt: m.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
];

function normalizeRecipientInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) =>
        typeof item === "string"
          ? { phone: item, name: null }
          : item && typeof item === "object"
            ? { phone: item.phone ?? item.number ?? item.nomor, name: item.name ?? item.nama ?? null }
            : null,
      )
      .filter(Boolean);
  }
  return String(input)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(phone|nomor|number|no)\b/i.test(line))
    .map((line) => {
      const [phone, name] = line.split(/[,;\t|]/).map((p) => p.trim());
      return { phone, name: name || null };
    })
    .filter((r) => r.phone);
}

function render(template, r) {
  return String(template).replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => {
    const map = { nama: r.name, name: r.name, nomor: r.phone, phone: r.phone };
    const value = map[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export const publicApiHandlers = {
  "/send-message": sendMessageHandler,
  "/send-broadcast": sendBroadcastHandler,
  "/device/status": deviceStatusHandler,
  "/broadcast/:id": broadcastStatusHandler,
  "/messages": messagesHandler,
};
