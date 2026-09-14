import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { asyncHandler, badRequest, notFound, conflict } from "../../lib/security.js";
import { requireAuth } from "../../middleware/auth.js";
import { extractTemplateVars, normalizePhone, renderTemplate } from "../../lib/phone.js";
import { enqueueBroadcast } from "../../queue/broadcast.worker.js";
import { assertQuota } from "../../whatsapp/dispatcher.js";

const router = Router();
router.use(requireAuth);

/** Accepts raw text / JSON arrays and parses "62812...,Budi" per line. */
function parseRecipients(input) {
  const rows = [];

  if (!input) return rows;

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") rows.push({ phone: item, name: null });
      else if (item && typeof item === "object") {
        rows.push({ phone: item.phone ?? item.nomor ?? item.number, name: item.name ?? item.nama ?? null });
      }
    }
    return rows;
  }

  const text = String(input).replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let line of lines) {
    // Skip a CSV header row
    if (/^(phone|nomor|number|no)/i.test(line) && /name|nama/i.test(line)) continue;
    const parts = line.split(/[,;\t|]/).map((p) => p.trim());
    const phone = parts[0];
    if (!phone) continue;
    rows.push({ phone, name: parts[1] || null });
  }

  return rows;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);

    const [items, total] = await Promise.all([
      prisma.broadcast.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { device: { select: { id: true, name: true } } },
      }),
      prisma.broadcast.count({ where: { userId: req.user.id } }),
    ]);

    res.json({
      items: items.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.status,
        total: b.total,
        sent: b.sent,
        failed: b.failed,
        pending: b.pending,
        delayMs: b.delayMs,
        deviceName: b.device?.name ?? null,
        startedAt: b.startedAt,
        finishedAt: b.finishedAt,
        createdAt: b.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      deviceId: z.string().optional(),
      template: z.string().min(1).max(4096),
      recipients: z.union([z.string(), z.array(z.union([z.string(), z.record(z.any())]))]),
      delayMs: z.coerce.number().int().min(1000).max(120_000).optional().default(4000),
      batchSize: z.coerce.number().int().min(1).max(200).optional().default(20),
      batchPauseMs: z.coerce.number().int().min(0).max(3_600_000).optional().default(60_000),
      startNow: z.coerce.boolean().optional().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const parsedRows = parseRecipients(data.recipients);
    if (!parsedRows.length) throw badRequest("Daftar nomor kosong");

    const seen = new Set();
    const recipients = [];
    const invalid = [];

    for (const row of parsedRows) {
      try {
        const jid = normalizePhone(row.phone);
        const digits = jid.split("@")[0];
        if (seen.has(digits)) continue;
        seen.add(digits);
        recipients.push({ phone: digits, name: row.name });
      } catch (err) {
        invalid.push({ phone: String(row.phone), reason: err.message });
      }
    }

    if (!recipients.length) {
      throw badRequest("Tidak ada nomor valid dalam daftar", { invalid });
    }
    if (recipients.length > 5000) throw badRequest("Maksimal 5000 nomor per broadcast");

    await assertQuota(req.user.id);

    const device = await prisma.device.findFirst({
      where: { userId: req.user.id, ...(data.deviceId ? { id: data.deviceId } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    if (!device) throw badRequest("Belum ada device. Hubungkan WhatsApp terlebih dahulu.");
    if (device.status !== "connected") throw conflict("Device belum terhubung ke WhatsApp");

    const broadcast = await prisma.broadcast.create({
      data: {
        userId: req.user.id,
        deviceId: device.id,
        name: data.name || `Broadcast ${new Date().toLocaleString("id-ID")}`,
        template: data.template,
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
            body: renderTemplate(data.template, {
              nama: r.name ?? "",
              name: r.name ?? "",
              nomor: r.phone,
              phone: r.phone,
            }),
          })),
        },
      },
    });

    if (data.startNow) await enqueueBroadcast(broadcast.id);

    res.status(201).json({
      broadcast: {
        id: broadcast.id,
        name: broadcast.name,
        status: broadcast.status,
        total: broadcast.total,
      },
      skipped: invalid,
      variables: extractTemplateVars(data.template),
    });
  }),
);

/** Preview the first N rendered bodies without sending anything. */
router.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      template: z.string().min(1),
      recipients: z.union([z.string(), z.array(z.union([z.string(), z.record(z.any())]))]),
      limit: z.coerce.number().int().min(1).max(20).optional().default(5),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);

    const rows = parseRecipients(parsed.data.recipients).slice(0, parsed.data.limit);
    res.json({
      variables: extractTemplateVars(parsed.data.template),
      preview: rows.map((row) => ({
        phone: row.phone,
        name: row.name,
        body: renderTemplate(parsed.data.template, {
          nama: row.name ?? "",
          name: row.name ?? "",
          nomor: row.phone,
          phone: row.phone,
        }),
      })),
    });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        device: { select: { id: true, name: true } },
        recipients: { orderBy: { createdAt: "asc" }, take: 500 },
      },
    });
    if (!broadcast) throw notFound("Broadcast tidak ditemukan");

    res.json({
      broadcast: {
        id: broadcast.id,
        name: broadcast.name,
        status: broadcast.status,
        template: broadcast.template,
        delayMs: broadcast.delayMs,
        total: broadcast.total,
        sent: broadcast.sent,
        failed: broadcast.failed,
        pending: broadcast.pending,
        deviceName: broadcast.device?.name ?? null,
        startedAt: broadcast.startedAt,
        finishedAt: broadcast.finishedAt,
        createdAt: broadcast.createdAt,
        progress: broadcast.total
          ? Math.round(((broadcast.sent + broadcast.failed) / broadcast.total) * 100)
          : 0,
      },
      recipients: broadcast.recipients.map((r) => ({
        id: r.id,
        phone: r.phone,
        name: r.name,
        status: r.status,
        error: r.error,
        sentAt: r.sentAt,
        body: r.body,
      })),
    });
  }),
);

router.post(
  "/:id/start",
  asyncHandler(async (req, res) => {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!broadcast) throw notFound("Broadcast tidak ditemukan");
    if (broadcast.status === "running") throw conflict("Broadcast sedang berjalan");
    if (broadcast.status === "completed") throw conflict("Broadcast sudah selesai");

    await assertQuota(req.user.id);

    // Re-arm failed recipients so "start" acts like a retry
    await prisma.broadcastRecipient.updateMany({
      where: { broadcastId: broadcast.id, status: "failed" },
      data: { status: "pending", error: null },
    });
    const failed = await prisma.broadcastRecipient.count({
      where: { broadcastId: broadcast.id, status: "failed" },
    });
    const pending = await prisma.broadcastRecipient.count({
      where: { broadcastId: broadcast.id, status: "pending" },
    });

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: "queued", failed, pending, finishedAt: null },
    });

    await enqueueBroadcast(broadcast.id);
    res.json({ ok: true, status: "queued" });
  }),
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!broadcast) throw notFound("Broadcast tidak ditemukan");
    if (["completed", "cancelled"].includes(broadcast.status)) {
      throw conflict("Broadcast sudah selesai");
    }

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: "cancelled", finishedAt: new Date() },
    });

    // Drop the queued job if it has not started yet
    const { getBroadcastQueue } = await import("../../queue/queue.js");
    const queue = getBroadcastQueue();
    if (queue) {
      const job = await queue.getJob(`broadcast:${broadcast.id}`).catch(() => null);
      if (job) await job.remove().catch(() => {});
    }

    res.json({ ok: true, status: "cancelled" });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!broadcast) throw notFound("Broadcast tidak ditemukan");
    if (broadcast.status === "running") throw conflict("Hentikan broadcast sebelum menghapus");

    await prisma.broadcast.delete({ where: { id: broadcast.id } });
    res.json({ ok: true });
  }),
);

export default router;
