import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { asyncHandler, badRequest, notFound, conflict } from "../../lib/security.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import {
  PLANS,
  PLAN_IDS,
  GLOBAL_MAX_DEVICES,
  getPlan,
  isValidPlan,
  effectiveDeviceLimit,
  publicPlanCatalog,
} from "../../config/plans.js";
import { waManager } from "../../whatsapp/manager.js";

const router = Router();

// Every admin route requires a valid session AND role=admin
router.use(requireAuth, requireAdmin);

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Admin-facing user shape.
 * Deliberately excludes message bodies and recipient phone numbers: admins may
 * see counts and device state but not the content of a member's customer chats.
 */
function shapeUser(user, counts = {}) {
  const limit = effectiveDeviceLimit(user);
  const plan = getPlan(user.plan);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    planName: plan.name,
    isActive: user.isActive,
    monthlyQuota: user.monthlyQuota,
    usedThisMonth: user.usedThisMonth,
    quotaPercent: user.monthlyQuota
      ? Math.min(100, Math.round((user.usedThisMonth / user.monthlyQuota) * 100))
      : 0,
    quotaResetAt: user.quotaResetAt,
    deviceLimit: limit,
    deviceLimitOverride: user.deviceLimitOverride ?? null,
    planDeviceLimit: plan.maxDevices,
    adminNote: user.adminNote ?? null,
    devices: counts.devices ?? 0,
    devicesConnected: counts.devicesConnected ?? 0,
    messagesSent: counts.messagesSent ?? 0,
    messagesFailed: counts.messagesFailed ?? 0,
    broadcasts: counts.broadcasts ?? 0,
    createdAt: user.createdAt,
  };
}

async function countsFor(userIds) {
  const [devices, connected, sent, failed, broadcasts] = await Promise.all([
    prisma.device.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: true }),
    prisma.device.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "connected" },
      _count: true,
    }),
    prisma.message.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, direction: "outbound", status: "sent" },
      _count: true,
    }),
    prisma.message.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, direction: "outbound", status: "failed" },
      _count: true,
    }),
    prisma.broadcast.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: true }),
  ]);

  const map = new Map();
  for (const id of userIds) {
    map.set(id, { devices: 0, devicesConnected: 0, messagesSent: 0, messagesFailed: 0, broadcasts: 0 });
  }
  const apply = (rows, field) => {
    for (const row of rows) {
      const entry = map.get(row.userId);
      if (entry) entry[field] = row._count;
    }
  };
  apply(devices, "devices");
  apply(connected, "devicesConnected");
  apply(sent, "messagesSent");
  apply(failed, "messagesFailed");
  apply(broadcasts, "broadcasts");
  return map;
}

/** Catalog of plans so the UI never hardcodes quota/price values. */
router.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    res.json({ plans: publicPlanCatalog(), globalMaxDevices: GLOBAL_MAX_DEVICES });
  }),
);

/** Platform-wide summary shown at the top of the admin dashboard. */
router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      adminUsers,
      totalDevices,
      connectedDevices,
      totalMessages,
      failedMessages,
      totalBroadcasts,
      quotaAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.device.count(),
      prisma.device.count({ where: { status: "connected" } }),
      prisma.message.count({ where: { direction: "outbound", status: "sent" } }),
      prisma.message.count({ where: { direction: "outbound", status: "failed" } }),
      prisma.broadcast.count(),
      prisma.user.aggregate({ _sum: { usedThisMonth: true, monthlyQuota: true } }),
    ]);

    // Plan distribution drives the pricing decision, so surface it directly
    const byPlan = await Promise.all(
      PLAN_IDS.map(async (planId) => ({
        plan: planId,
        count: await prisma.user.count({ where: { plan: planId } }),
      })),
    );

    res.json({
      stats: {
        users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, admins: adminUsers },
        devices: { total: totalDevices, connected: connectedDevices },
        messages: { sent: totalMessages, failed: failedMessages },
        broadcasts: totalBroadcasts,
        quota: {
          used: quotaAgg._sum.usedThisMonth ?? 0,
          allocated: quotaAgg._sum.monthlyQuota ?? 0,
        },
        byPlan,
      },
    });
  }),
);

/** Paginated member list with search + filters. */
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const { q, plan, status, role } = req.query;

    const where = {};
    if (plan) {
      if (!isValidPlan(String(plan))) throw badRequest("Paket tidak dikenal");
      where.plan = String(plan);
    }
    if (status === "active") where.isActive = true;
    if (status === "suspended") where.isActive = false;
    if (role) where.role = String(role);
    if (q) {
      where.OR = [
        { email: { contains: String(q), mode: "insensitive" } },
        { name: { contains: String(q), mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const counts = await countsFor(users.map((u) => u.id));

    res.json({
      users: users.map((u) => shapeUser(u, counts.get(u.id))),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);

/** Single member detail, including their devices (no message bodies). */
router.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("Member tidak ditemukan");

    const [devices, messagesSent, messagesFailed, broadcasts] = await Promise.all([
      prisma.device.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          status: true,
          lastError: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
      prisma.message.count({ where: { userId: user.id, direction: "outbound", status: "sent" } }),
      prisma.message.count({ where: { userId: user.id, direction: "outbound", status: "failed" } }),
      prisma.broadcast.count({ where: { userId: user.id } }),
    ]);

    res.json({
      user: shapeUser(user, {
        devices: devices.length,
        devicesConnected: devices.filter((d) => d.status === "connected").length,
        messagesSent,
        messagesFailed,
        broadcasts,
      }),
      // Live session status takes precedence over the persisted column
      devices: devices.map((d) => ({
        ...d,
        status: waManager.get(d.id)?.status ?? d.status,
        live: Boolean(waManager.get(d.id)),
      })),
    });
  }),
);

/**
 * Update a member's plan, quota, device limit, status, role, or note.
 * Changing the plan also re-derives the quota, unless an explicit
 * monthlyQuota is provided in the same request.
 */
router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      plan: z.enum(PLAN_IDS).optional(),
      monthlyQuota: z.coerce.number().int().min(0).max(10_000_000).optional(),
      deviceLimitOverride: z.coerce.number().int().min(0).max(GLOBAL_MAX_DEVICES).nullable().optional(),
      isActive: z.boolean().optional(),
      role: z.enum(["user", "admin"]).optional(),
      adminNote: z.string().max(500).nullable().optional(),
      resetUsage: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("Member tidak ditemukan");

    // Guard against an admin locking themselves out of the panel
    if (user.id === req.user.id) {
      if (data.role && data.role !== "admin") {
        throw conflict("Tidak dapat menurunkan role akun Anda sendiri");
      }
      if (data.isActive === false) {
        throw conflict("Tidak dapat menonaktifkan akun Anda sendiri");
      }
    }

    // Demoting the last remaining admin would leave the platform unmanageable
    if (data.role === "user" && user.role === "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) throw conflict("Harus ada minimal satu admin");
    }

    const patch = {};
    if (data.plan !== undefined) {
      patch.plan = data.plan;
      // Plan change re-derives the quota unless one is set explicitly below
      if (data.monthlyQuota === undefined) {
        patch.monthlyQuota = PLANS[data.plan].monthlyQuota;
      }
    }
    if (data.monthlyQuota !== undefined) patch.monthlyQuota = data.monthlyQuota;
    if (data.deviceLimitOverride !== undefined) {
      patch.deviceLimitOverride = data.deviceLimitOverride === 0 ? null : data.deviceLimitOverride;
    }
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.role !== undefined) patch.role = data.role;
    if (data.adminNote !== undefined) patch.adminNote = data.adminNote;
    if (data.resetUsage) {
      patch.usedThisMonth = 0;
      patch.quotaResetAt = new Date();
    }

    if (Object.keys(patch).length === 0) throw badRequest("Tidak ada perubahan dikirim");

    const updated = await prisma.user.update({ where: { id: user.id }, data: patch });
    const counts = await countsFor([updated.id]);

    res.json({ user: shapeUser(updated, counts.get(updated.id)) });
  }),
);

/** Reconnect every device belonging to a member (after a restart, etc.). */
router.post(
  "/users/:id/devices/restore",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("Member tidak ditemukan");

    const devices = await prisma.device.findMany({
      where: { userId: user.id, isActive: true, status: { not: "logged_out" } },
      select: { id: true, name: true },
    });

    const results = [];
    for (const device of devices) {
      try {
        await waManager.start(device.id);
        results.push({ deviceId: device.id, name: device.name, ok: true });
      } catch (err) {
        results.push({ deviceId: device.id, name: device.name, ok: false, error: err.message });
      }
    }

    res.json({ ok: true, attempted: devices.length, results });
  }),
);

/** Logout a member's device (session removed, requires a fresh QR). */
router.post(
  "/users/:id/devices/:deviceId/logout",
  asyncHandler(async (req, res) => {
    const device = await prisma.device.findFirst({
      where: { id: req.params.deviceId, userId: req.params.id },
    });
    if (!device) throw notFound("Device tidak ditemukan");

    await waManager.stop(device.id, { logout: true });
    res.json({ ok: true, status: "logged_out" });
  }),
);

/** Reset a member's monthly usage counter. */
router.post(
  "/users/:id/reset-usage",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("Member tidak ditemukan");

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { usedThisMonth: 0, quotaResetAt: new Date() },
    });
    res.json({ ok: true, user: shapeUser(updated) });
  }),
);

/**
 * Extend a member's quota window without touching usage. Useful when a
 * subscription is renewed manually before the 30-day sweep fires.
 */
router.post(
  "/users/:id/extend-quota",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ days: z.coerce.number().int().min(1).max(365).optional().default(30) })
      .safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("Member tidak ditemukan");

    const base = Math.max(user.quotaResetAt?.getTime() ?? Date.now(), Date.now());
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { quotaResetAt: new Date(base + parsed.data.days * 24 * 60 * 60 * 1000) },
    });

    res.json({ ok: true, user: shapeUser(updated) });
  }),
);

export default router;

// Exported for tests
export { shapeUser, MONTH_MS };
