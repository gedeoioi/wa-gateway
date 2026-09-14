import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import {
  asyncHandler,
  badRequest,
  notFound,
  generateApiKey,
  encryptSecret,
  decryptSecret,
  maskKey,
} from "../../lib/security.js";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        masked: maskKey(decryptSecret(k.secretEnc)),
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })),
    });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(60).optional(),
        scopes: z.array(z.enum(["send", "read"])).min(1).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest("Data tidak valid", parsed.error.flatten().fieldErrors);

    const count = await prisma.apiKey.count({
      where: { userId: req.user.id, revokedAt: null },
    });
    if (count >= 10) throw badRequest("Maksimal 10 API key aktif");

    const { plain, prefix, secretHash } = generateApiKey();

    const key = await prisma.apiKey.create({
      data: {
        userId: req.user.id,
        name: parsed.data.name || `Key ${count + 1}`,
        prefix,
        secretHash,
        secretEnc: encryptSecret(plain),
        scopes: parsed.data.scopes ?? ["send", "read"],
      },
    });

    // The plaintext is only ever returned here and via the reveal endpoint
    res.status(201).json({
      key: {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        createdAt: key.createdAt,
      },
      secret: plain,
      warning: "Simpan key ini. Gunakan header X-API-Key pada setiap request.",
    });
  }),
);

router.get(
  "/:id/reveal",
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!key) throw notFound("API key tidak ditemukan");
    if (key.revokedAt) throw badRequest("API key sudah dicabut");

    res.json({ secret: decryptSecret(key.secretEnc) });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!key) throw notFound("API key tidak ditemukan");

    await prisma.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

export default router;
