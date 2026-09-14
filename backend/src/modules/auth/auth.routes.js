import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import {
  asyncHandler,
  hashPassword,
  verifyPassword,
  badRequest,
  unauthorized,
  conflict,
} from "../../lib/security.js";
import { signToken, requireAuth, authLimiter } from "../../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password minimal 8 karakter"),
  name: z.string().min(2).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    role: user.role,
    usedThisMonth: user.usedThisMonth,
    monthlyQuota: user.monthlyQuota,
    createdAt: user.createdAt,
  };
}

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);
    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw conflict("Email sudah terdaftar");

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name ?? email.split("@")[0],
        passwordHash: await hashPassword(password),
      },
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw unauthorized("Email atau password salah");
    if (!user.isActive) throw unauthorized("Akun dinonaktifkan");

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized("Email atau password salah");

    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({ user: publicUser(user) });
  }),
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      password: z.string().min(8).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);

    const data = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.password) data.passwordHash = await hashPassword(parsed.data.password);

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: publicUser(user) });
  }),
);

router.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [sent, failed, queued, todaySent, devices, connected, broadcasts] = await Promise.all([
      prisma.message.count({ where: { userId, direction: "outbound", status: "sent" } }),
      prisma.message.count({ where: { userId, direction: "outbound", status: "failed" } }),
      prisma.message.count({ where: { userId, direction: "outbound", status: "queued" } }),
      prisma.message.count({
        where: { userId, direction: "outbound", status: "sent", sentAt: { gte: startOfDay } },
      }),
      prisma.device.count({ where: { userId } }),
      prisma.device.count({ where: { userId, status: "connected" } }),
      prisma.broadcast.count({ where: { userId } }),
    ]);

    // 7-day trend for the dashboard chart.
    // Buckets are keyed in LOCAL time to match the setHours(0,0,0,0)
    // normalization above; using toISOString() here would shift buckets to UTC
    // and drop the earliest day's data in non-UTC timezones.
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);
    const recent = await prisma.message.findMany({
      where: { userId, direction: "outbound", sentAt: { gte: since } },
      select: { sentAt: true, status: true },
    });

    const localDayKey = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`;

    const trend = Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = localDayKey(day);
      const rows = recent.filter((m) => m.sentAt && localDayKey(m.sentAt) === key);
      return {
        date: key,
        sent: rows.filter((r) => r.status === "sent").length,
        failed: rows.filter((r) => r.status === "failed").length,
      };
    });

    res.json({
      stats: {
        sent,
        failed,
        queued,
        todaySent,
        devices,
        connected,
        broadcasts,
        quota: {
          used: req.user.usedThisMonth,
          limit: req.user.monthlyQuota,
        },
      },
      trend,
    });
  }),
);

export default router;
