import { prisma } from "../db/prisma.js";
import { waManager } from "./manager.js";
import { normalizePhone } from "../lib/phone.js";
import { HttpError, badRequest } from "../lib/security.js";
import { childLogger } from "../config/logger.js";

const log = childLogger({ mod: "dispatcher" });

/**
 * Single send path shared by:
 *  - POST /api/dashboard/messages      (dashboard single chat)
 *  - POST /api/v1/send-message         (public API)
 *  - broadcast worker                  (bulk)
 *
 * Always writes a Message row so every attempt is auditable.
 */
export async function dispatchMessage({
  userId,
  deviceId,
  to,
  body,
  media = null,
  mediaMime = null,
  mediaName = null,
  mediaUrl = null,
  source = "dashboard",
  broadcastId = null,
  messageId = null,
}) {
  const jid = normalizePhone(to);

  if (!body && !media) throw badRequest("Isi pesan tidak boleh kosong");

  const device = await resolveDevice(userId, deviceId);

  if (device.status !== "connected") {
    throw new HttpError(409, `Device "${device.name}" belum terhubung ke WhatsApp`);
  }

  const record = messageId
    ? await prisma.message.update({
        where: { id: messageId },
        data: { status: "sending", deviceId: device.id, to: jid },
      })
    : await prisma.message.create({
        data: {
          userId,
          deviceId: device.id,
          direction: "outbound",
          to: jid,
          body: body ?? "",
          type: media ? (mediaMime?.startsWith("image/") ? "image" : "document") : "text",
          mediaUrl,
          mediaMime,
          mediaName,
          status: "sending",
          source,
          broadcastId,
        },
      });

  try {
    const result = await waManager.send(device.id, {
      to: jid,
      body,
      media: media ? { buffer: media } : undefined,
      mediaMime,
      mediaName,
    });

    const updated = await prisma.message.update({
      where: { id: record.id },
      data: {
        status: "sent",
        providerId: result.providerId,
        sentAt: new Date(),
        error: null,
      },
    });

    await bumpUsage(userId);

    return updated;
  } catch (err) {
    log.warn({ err: err.message, to: jid }, "send failed");
    await prisma.message.update({
      where: { id: record.id },
      data: { status: "failed", error: truncate(err.message, 480) },
    });
    throw new HttpError(502, err.message);
  }
}

async function resolveDevice(userId, deviceId) {
  if (deviceId) {
    const device = await prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw new HttpError(404, "Device tidak ditemukan");

    // Lazy-start sessions that were not restored yet (e.g. server restarted)
    if (device.status !== "connected" && !waManager.get(device.id)) {
      await waManager.start(device.id).catch(() => {});
      const refreshed = await prisma.device.findUnique({ where: { id: device.id } });
      return refreshed;
    }
    return device;
  }

  const device = await prisma.device.findFirst({
    where: { userId, isActive: true },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  if (!device) throw new HttpError(400, "Belum ada device. Hubungkan WhatsApp terlebih dahulu.");

  const connected = await prisma.device.findFirst({
    where: { userId, status: "connected", isActive: true },
  });
  if (!connected && !waManager.get(device.id)) {
    await waManager.start(device.id).catch(() => {});
  }
  return connected ?? device;
}

async function bumpUsage(userId) {
  await prisma.user
    .update({ where: { id: userId }, data: { usedThisMonth: { increment: 1 } } })
    .catch(() => {});
}

function truncate(str, max) {
  if (!str) return null;
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export async function assertQuota(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { usedThisMonth: true, monthlyQuota: true, isActive: true },
  });
  if (!user) throw new HttpError(401, "User tidak ditemukan");
  if (!user.isActive) throw new HttpError(403, "Akun dinonaktifkan");
  if (user.usedThisMonth >= user.monthlyQuota) {
    throw new HttpError(429, "Kuota bulanan habis. Upgrade paket untuk melanjutkan.");
  }
  return user;
}
