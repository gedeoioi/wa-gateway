import { Router } from "express";
import { z } from "zod";
import fs from "node:fs/promises";
import { prisma } from "../../db/prisma.js";
import { asyncHandler, badRequest } from "../../lib/security.js";
import { requireAuth, upload } from "../../middleware/auth.js";
import { dispatchMessage, assertQuota } from "../../whatsapp/dispatcher.js";
import { normalizePhone } from "../../lib/phone.js";

const router = Router();
router.use(requireAuth);

const sendSchema = z.object({
  to: z.string().min(6),
  body: z.string().max(4096).optional().default(""),
  deviceId: z.string().optional(),
});

/** Single chat send (multipart/form-data when attaching a file). */
router.post(
  "/",
  upload.single("media"),
  asyncHandler(async (req, res) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);
    }
    const { to, body, deviceId } = parsed.data;

    if (!body && !req.file) {
      throw badRequest("Isi pesan atau lampiran wajib diisi");
    }

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
        source: "dashboard",
      });

      res.status(201).json({
        message: serialize(message),
      });
    } finally {
      // Buffer is already in memory; the temp file is only needed for the URL
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
    }
  }),
);

/** Check whether a number is registered on WhatsApp (needs a live socket). */
router.post(
  "/check-number",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ to: z.string().min(6), deviceId: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);

    const jid = normalizePhone(parsed.data.to);
    const { waManager } = await import("../../whatsapp/manager.js");
    const device = await prisma.device.findFirst({
      where: { userId: req.user.id, ...(parsed.data.deviceId ? { id: parsed.data.deviceId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    if (!device) throw badRequest("Belum ada device terhubung");

    const session = waManager.get(device.id);
    if (!session?.sock || session.status !== "connected") {
      throw badRequest("Device belum terhubung");
    }

    const results = await session.sock.onWhatsApp(jid.split("@")[0]);
    res.json({
      exists: Boolean(results?.length),
      jid: results?.[0]?.jid ?? null,
    });
  }),
);

/** Paginated message log with filters. */
router.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const { status, source, deviceId, direction, q } = req.query;

    const where = { userId: req.user.id };
    if (status) where.status = String(status);
    if (source) where.source = String(source);
    if (direction) where.direction = String(direction);
    if (deviceId) where.deviceId = String(deviceId);
    if (q) {
      where.OR = [
        { to: { contains: String(q), mode: "insensitive" } },
        { body: { contains: String(q), mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { device: { select: { id: true, name: true } } },
      }),
      prisma.message.count({ where }),
    ]);

    res.json({
      items: items.map(serialize),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);

function serialize(message) {
  return {
    id: message.id,
    to: message.to,
    body: message.body,
    type: message.type,
    status: message.status,
    error: message.error,
    source: message.source,
    direction: message.direction,
    deviceId: message.deviceId,
    deviceName: message.device?.name ?? null,
    mediaUrl: message.mediaUrl,
    providerId: message.providerId,
    sentAt: message.sentAt,
    createdAt: message.createdAt,
  };
}

export default router;
