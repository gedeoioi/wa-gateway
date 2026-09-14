import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { asyncHandler, badRequest, notFound, conflict } from "../../lib/security.js";
import { requireAuth } from "../../middleware/auth.js";
import { waManager } from "../../whatsapp/manager.js";
import { effectiveDeviceLimit, getPlan } from "../../config/plans.js";

const router = Router();
router.use(requireAuth);

function shape(device) {
  const session = waManager.get(device.id);
  return {
    id: device.id,
    name: device.name,
    phoneNumber: device.phoneNumber,
    status: session?.status ?? device.status,
    lastError: device.lastError,
    lastSeenAt: device.lastSeenAt,
    isActive: device.isActive,
    createdAt: device.createdAt,
    realtime: Boolean(session),
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const devices = await prisma.device.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
    });
    res.json({ devices: devices.map(shape) });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ name: z.string().min(2).max(60).optional() }).safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);

    const count = await prisma.device.count({ where: { userId: req.user.id } });

    // Allowance comes from the plan, optionally overridden per user by an admin.
    // requireAuth only selects a subset of fields, so read the override fresh.
    const account = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { plan: true, deviceLimitOverride: true },
    });
    const limit = effectiveDeviceLimit(account ?? {});
    if (count >= limit) {
      const planName = getPlan(account?.plan).name;
      throw conflict(
        `Batas device untuk paket ${planName} adalah ${limit}. ` +
          `Hapus device lain atau upgrade paket untuk menambah.`,
      );
    }

    const device = await prisma.device.create({
      data: {
        userId: req.user.id,
        name: parsed.data.name || `Device ${count + 1}`,
        sessionId: crypto.randomUUID(),
        status: "connecting",
      },
    });

    await waManager.start(device.id);
    res.status(201).json({ device: shape(device) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!device) throw notFound("Device tidak ditemukan");

    const session = waManager.get(device.id);
    res.json({ device: shape(device), qr: session?.qr ?? null });
  }),
);

/** Returns a fresh QR data URL (the UI polls this while pairing). */
router.get(
  "/:id/qr",
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!device) throw notFound("Device tidak ditemukan");

    const session = await waManager.start(device.id);
    // Give Baileys a moment to produce the first QR on a cold start
    if (!session.qr && session.status !== "connected") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    res.json({
      status: session.status,
      qr: session.qr,
      phoneNumber: device.phoneNumber,
    });
  }),
);

router.post(
  "/:id/reconnect",
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!device) throw notFound("Device tidak ditemukan");

    await waManager.stop(device.id);
    await prisma.device.update({
      where: { id: device.id },
      data: { status: "connecting", lastError: null, isActive: true },
    });
    await waManager.start(device.id);

    res.json({ ok: true });
  }),
);

router.post(
  "/:id/logout",
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!device) throw notFound("Device tidak ditemukan");

    await waManager.stop(device.id, { logout: true });
    res.json({ ok: true, status: "logged_out" });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ name: z.string().min(2).max(60).optional(), isActive: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);

    const device = await prisma.device.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!device) throw notFound("Device tidak ditemukan");

    const updated = await prisma.device.update({ where: { id: device.id }, data: parsed.data });
    res.json({ device: shape(updated) });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!device) throw notFound("Device tidak ditemukan");

    await waManager.stop(device.id, { logout: true });
    await prisma.device.delete({ where: { id: device.id } });
    res.json({ ok: true });
  }),
);

export default router;
