/**
 * Focused test for the broadcast worker's per-recipient quota enforcement.
 * The worker must stop mid-broadcast when the sender's quota is exhausted,
 * otherwise a user could enqueue thousands of messages on a nearly-empty quota.
 *
 * Run: node _worker-quota.test.mjs
 */
import assert from "node:assert/strict";
import { prisma } from "./src/db/prisma.js";
import { runBroadcast } from "./src/queue/broadcast.worker.js";
import { waManager } from "./src/whatsapp/manager.js";

const user = {
  id: "u1",
  usedThisMonth: 96,
  monthlyQuota: 100,
  isActive: true,
};

const recipients = Array.from({ length: 10 }).map((_, i) => ({
  id: `r${i}`,
  broadcastId: "b1",
  phone: `6281000000${i}`,
  name: `User ${i}`,
  body: "hi",
  status: "pending",
  error: null,
  sentAt: null,
}));

const broadcast = {
  id: "b1",
  userId: "u1",
  deviceId: "d1",
  name: "Test",
  template: "Halo {{nama}}",
  delayMs: 1,
  batchSize: 20,
  batchPauseMs: 0,
  status: "queued",
  total: recipients.length,
  sent: 0,
  failed: 0,
  pending: recipients.length,
  startedAt: null,
  finishedAt: null,
  recipients,
};

let sendCount = 0;

prisma.broadcast.findUnique = async () => ({ ...broadcast, recipients });
prisma.broadcast.update = async ({ data }) => Object.assign(broadcast, data, { recipients });
prisma.broadcastRecipient.update = async ({ where, data }) => {
  const row = recipients.find((r) => r.id === where.id);
  Object.assign(row, data);
  return row;
};
prisma.user.findUnique = async () => ({ ...user });
prisma.user.update = async ({ data }) => {
  // Mimic Prisma's atomic operators, otherwise `{ increment: 1 }` would be
  // assigned as a literal object and the quota would never advance.
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      user[key] = (user[key] ?? 0) + value.increment;
    } else if (value && typeof value === "object" && "decrement" in value) {
      user[key] = (user[key] ?? 0) - value.decrement;
    } else {
      user[key] = value;
    }
  }
  return { ...user };
};

// Each successful send consumes one unit of quota
waManager.send = async () => {
  sendCount += 1;
  return { providerId: `m${sendCount}`, jid: "x", onWhatsApp: true };
};
waManager.get = () => ({ status: "connected", sock: {}, device: { id: "d1", userId: "u1" } });

// Also stub the message writes performed by dispatchMessage
prisma.message.create = async ({ data }) => ({ id: `msg${sendCount}`, ...data });
prisma.message.update = async ({ data }) => ({ id: "msg", ...data });
prisma.device.findFirst = async () => ({
  id: "d1",
  userId: "u1",
  name: "Dev",
  status: "connected",
  isActive: true,
});

await runBroadcast("b1");

// Only 4 messages fit (96 -> 100); the worker must stop there, not send all 10
assert.equal(sendCount, 4, `expected 4 sends before quota exhaustion, got ${sendCount}`);
assert.equal(broadcast.status, "cancelled", `expected cancelled, got ${broadcast.status}`);
assert.ok(
  recipients.filter((r) => r.status === "pending").length === 6,
  "remaining recipients must stay pending for a later resume",
);

console.log("PASS  worker stops when quota is exhausted");
console.log(`      sent=${sendCount} used=${user.usedThisMonth}/${user.monthlyQuota} status=${broadcast.status}`);
console.log("      remaining pending:", recipients.filter((r) => r.status === "pending").length);

// The worker must not resume sending while quota is exhausted
const before = sendCount;
await runBroadcast("b1");
assert.equal(sendCount, before, "worker must not send after quota exhaustion");
console.log("PASS  re-run does not exceed quota");
