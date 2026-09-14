/**
 * Seed script: creates or promotes an admin account.
 *
 *   npm run seed:admin
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret123 npm run seed:admin
 *
 * Safe to re-run: it promotes an existing account instead of duplicating it.
 * Without explicit env vars it generates a random password and prints it once.
 */
import crypto from "node:crypto";
import { prisma, connectDatabase, disconnectDatabase } from "../src/db/prisma.js";
import { hashPassword } from "../src/lib/security.js";
import { PLANS } from "../src/config/plans.js";

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@wagateway.local").toLowerCase().trim();
  const name = process.env.ADMIN_NAME || "Administrator";
  const provided = process.env.ADMIN_PASSWORD;
  const password = provided || `wag-${crypto.randomBytes(9).toString("base64url")}`;

  if (provided && provided.length < 8) {
    throw new Error("ADMIN_PASSWORD minimal 8 karakter");
  }

  await connectDatabase();

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "admin",
        isActive: true,
        plan: "business",
        monthlyQuota: PLANS.business.monthlyQuota,
        ...(provided ? { passwordHash: await hashPassword(provided) } : {}),
      },
    });
    console.log(`Promoted existing account to admin: ${updated.email}`);
    if (provided) console.log("Password was reset to the value from ADMIN_PASSWORD.");
    else console.log("Password unchanged (set ADMIN_PASSWORD to reset it).");
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        name,
        role: "admin",
        plan: "business",
        monthlyQuota: PLANS.business.monthlyQuota,
        passwordHash: await hashPassword(password),
      },
    });

    console.log("Admin account created.");
    console.log(`  Email    : ${created.email}`);
    if (provided) {
      console.log("  Password : (from ADMIN_PASSWORD)");
    } else {
      console.log(`  Password : ${password}`);
      console.log("  ^ Save this now. It is shown only once.");
    }
  }

  console.log(`  Quota    : ${PLANS.business.monthlyQuota} pesan/bulan`);
  console.log(`  Devices  : sampai ${PLANS.business.maxDevices} device`);

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error("Seed failed:", err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
