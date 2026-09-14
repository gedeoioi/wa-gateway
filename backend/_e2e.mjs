/**
 * End-to-end flow test using an in-memory Prisma double.
 * Exercises the real routes, middleware, validation, and business logic
 * without requiring a live PostgreSQL instance.
 *
 * Run: npm test   (or: node _e2e.mjs)
 */
import http from "node:http";
import assert from "node:assert/strict";

/* --------------------------- in-memory prisma ---------------------------- */

const store = { users: [], devices: [], apiKeys: [], messages: [], broadcasts: [], recipients: [] };
let seq = 0;
const id = (p) => `${p}_${(++seq).toString().padStart(4, "0")}`;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return cond.some((c) => matches(row, c));
    if (key === "AND") return cond.every((c) => matches(row, c));
    if (cond && typeof cond === "object") {
      if ("contains" in cond) {
        const hay = String(row[key] ?? "").toLowerCase();
        return hay.includes(String(cond.contains).toLowerCase());
      }
      if ("gte" in cond) return row[key] >= cond.gte;
      if ("lt" in cond) return row[key] < cond.lt;
      if ("not" in cond) return row[key] !== cond.not;
      if ("in" in cond) return cond.in.includes(row[key]);
    }
    return row[key] === cond;
  });
}

// Prisma accepts both `orderBy: { field: 'asc' }` and the array form
// `orderBy: [{ status: 'asc' }, { createdAt: 'asc' }]`.
function applyOrder(rows, orderBy) {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field] = Object.keys(spec);
      const dir = spec[field] === "desc" ? -1 : 1;
      if (a[field] > b[field]) return dir;
      if (a[field] < b[field]) return -dir;
    }
    return 0;
  });
}

function project(row, args) {
  if (!row) return row;
  // Callers pass either `{ include }` or the parsed args object; normalize both
  const include = args?.include ?? args;
  const out = { ...row };
  if (!include || typeof include !== "object") return out;
  if (include.device) out.device = store.devices.find((d) => d.id === row.deviceId) ?? null;
  if (include.user) out.user = store.users.find((u) => u.id === row.userId) ?? null;
  if (include.recipients) {
    out.recipients = applyOrder(
      store.recipients.filter((r) => r.broadcastId === row.id),
      include.recipients.orderBy,
    ).slice(0, include.recipients.take ?? undefined);
  }
  return out;
}

// Prisma applies @default() values in the database layer, so the double has to
// reproduce them explicitly (otherwise `isActive` would be undefined -> falsy).
const DEFAULTS = {
  users: {
    name: null,
    role: "user",
    plan: "free",
    isActive: true,
    monthlyQuota: 1000,
    usedThisMonth: 0,
    quotaResetAt: new Date(),
  },
  devices: { phoneNumber: null, status: "disconnected", lastError: null, isActive: true, lastSeenAt: null },
  apiKeys: { scopes: ["send", "read"], lastUsedAt: null, revokedAt: null },
  messages: {
    deviceId: null,
    direction: "outbound",
    type: "text",
    mediaUrl: null,
    mediaMime: null,
    mediaName: null,
    status: "queued",
    providerId: null,
    error: null,
    source: "dashboard",
    broadcastId: null,
    sentAt: null,
  },
  broadcasts: {
    deviceId: null,
    delayMs: 4000,
    batchSize: 20,
    batchPauseMs: 60000,
    status: "queued",
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    startedAt: null,
    finishedAt: null,
  },
  recipients: { name: null, status: "pending", error: null, sentAt: null },
};

function model(name) {
  const key = name;
  return {
    async create({ data, include }) {
      const row = {
        id: data.id ?? id(key),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...DEFAULTS[key],
        ...data,
      };
      if (key === "recipients") row.createdAt = new Date();

      // Prisma supports nested writes; reproduce the `recipients: { create: [...] }`
      // shape used by the broadcast endpoint so child rows actually exist.
      const nested = data.recipients?.create;
      delete row.recipients;
      store[key].push(row);

      if (nested) {
        for (const child of Array.isArray(nested) ? nested : [nested]) {
          store.recipients.push({
            id: id("recipients"),
            createdAt: new Date(),
            ...DEFAULTS.recipients,
            broadcastId: row.id,
            ...child,
          });
        }
      }

      return project(row, { include });
    },
    async createMany({ data }) {
      for (const d of data) store[key].push({ id: id(key), createdAt: new Date(), ...d });
      return { count: data.length };
    },
    async findUnique({ where, include }) {
      const row = store[key].find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      return project(row ?? null, { include, args: { include } });
    },
    async findFirst({ where, include, orderBy }) {
      let rows = store[key].filter((r) => matches(r, where));
      rows = applyOrder(rows, orderBy);
      return project(rows[0] ?? null, { include });
    },
    async findMany({ where, include, orderBy, skip = 0, take } = {}) {
      let rows = store[key].filter((r) => matches(r, where));
      rows = applyOrder(rows, orderBy);
      rows = rows.slice(skip, take ? skip + take : undefined);
      return rows.map((r) => project(r, { include }));
    },
    async count({ where } = {}) {
      return store[key].filter((r) => matches(r, where)).length;
    },
    async update({ where, data, include }) {
      const row = store[key].find((r) => r.id === where.id);
      if (!row) throw new Error(`${key} not found`);
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "increment" in v) row[k] = (row[k] ?? 0) + v.increment;
        else if (v && typeof v === "object" && "decrement" in v) row[k] = (row[k] ?? 0) - v.decrement;
        else row[k] = v;
      }
      row.updatedAt = new Date();
      return project(row, { include });
    },
    async updateMany({ where, data }) {
      const rows = store[key].filter((r) => matches(r, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    async delete({ where }) {
      const i = store[key].findIndex((r) => r.id === where.id);
      return store[key].splice(i, 1)[0];
    },
  };
}

const prismaMock = {
  user: model("users"),
  device: model("devices"),
  apiKey: model("apiKeys"),
  message: model("messages"),
  broadcast: model("broadcasts"),
  broadcastRecipient: model("recipients"),
  $connect: async () => {},
  $disconnect: async () => {},
};

// Intercept the Prisma module so route modules receive the double
const prismaModulePath = new URL("./src/db/prisma.js", import.meta.url).href;
const realPrisma = await import(prismaModulePath);
realPrisma.prisma.user = prismaMock.user;
realPrisma.prisma.device = prismaMock.device;
realPrisma.prisma.apiKey = prismaMock.apiKey;
realPrisma.prisma.message = prismaMock.message;
realPrisma.prisma.broadcast = prismaMock.broadcast;
realPrisma.prisma.broadcastRecipient = prismaMock.broadcastRecipient;

const { createApp } = await import("./src/app.js");

// Surface real stacks for failing requests during the test run
const app = createApp();
const originalErrorHandler = null;

/* ------------------------------- test harness ----------------------------- */

const server = http.createServer(createApp());
await new Promise((r) => server.listen(4601, r));
const base = "http://127.0.0.1:4601";

let passed = 0;
let failed = 0;

async function call(method, path, { body, token, apiKey, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(base + path, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? ` :: ${JSON.stringify(extra)}` : ""}`);
  }
}

/* --------------------------------- tests --------------------------------- */

console.log("\n[auth]");
const reg = await call("POST", "/api/auth/register", {
  body: { email: "Budi@Example.com", password: "rahasia123", name: "Budi" },
});
check("register returns 201 + token", reg.status === 201 && !!reg.data.token, reg);
check("email normalized to lowercase", reg.data.user.email === "budi@example.com", reg.data.user);
const token = reg.data.token;

const dupe = await call("POST", "/api/auth/register", {
  body: { email: "budi@example.com", password: "rahasia123" },
});
check("duplicate email rejected (409)", dupe.status === 409, dupe);

const weak = await call("POST", "/api/auth/register", {
  body: { email: "x@y.com", password: "123" },
});
check("weak password rejected (400)", weak.status === 400, weak);

const login = await call("POST", "/api/auth/login", {
  body: { email: "budi@example.com", password: "rahasia123" },
});
check("login succeeds", login.status === 200 && !!login.data.token, login);

const wrongPw = await call("POST", "/api/auth/login", {
  body: { email: "budi@example.com", password: "salahbanget" },
});
check("wrong password rejected (401)", wrongPw.status === 401, wrongPw);

const me = await call("GET", "/api/auth/me", { token });
check("GET /me works", me.status === 200 && me.data.user.email === "budi@example.com", me);

const noAuth = await call("GET", "/api/auth/me");
check("GET /me without token -> 401", noAuth.status === 401, noAuth);

console.log("\n[devices]");
const dev = await call("POST", "/api/devices", { token, body: { name: "Nomor Utama" } });
check("create device", dev.status === 201 && dev.data.device.name === "Nomor Utama", dev);
const deviceId = dev.data.device.id;
check("device starts disconnected/connecting", ["connecting", "disconnected"].includes(dev.data.device.status), dev.data.device);

const list = await call("GET", "/api/devices", { token });
check("list devices", list.status === 200 && list.data.devices.length === 1, list);

// Simulate a successful pairing
await prismaMock.device.update({
  where: { id: deviceId },
  data: { status: "connected", phoneNumber: "628123456789" },
});

console.log("\n[api keys]");
const keyRes = await call("POST", "/api/keys", { token, body: { name: "Toko Online", scopes: ["send", "read"] } });
check("create api key returns plaintext once", keyRes.status === 201 && keyRes.data.secret.startsWith("wag_"), keyRes);
const apiKey = keyRes.data.secret;

const keyList = await call("GET", "/api/keys", { token });
check("api key list masks secret", keyList.data.keys[0].masked.includes("•"), keyList.data.keys);

const revealed = await call("GET", `/api/keys/${keyRes.data.key.id}/reveal`, { token });
check("reveal decrypts to original", revealed.data.secret === apiKey, revealed);

console.log("\n[public api: auth + scopes]");
const noKey = await call("POST", "/api/send-message", { body: { to: "08123456789", body: "hi" } });
check("missing api key -> 401", noKey.status === 401, noKey);

// Patch the WhatsApp layer before any send so no real socket is required
const managerModule = await import(new URL("./src/whatsapp/manager.js", import.meta.url).href);
let sentPayloads = [];
managerModule.waManager.send = async (deviceId, payload) => {
  sentPayloads.push({ deviceId, ...payload });
  return { providerId: `MSG_${sentPayloads.length}`, jid: payload.to, onWhatsApp: true };
};
managerModule.waManager.get = () => ({ status: "connected", sock: {}, qr: null });

const badKey = await call("POST", "/api/send-message", {
  apiKey: "wag_deadbeef_notarealkey",
  body: { to: "08123456789", body: "hi" },
});
check("invalid api key -> 401", badKey.status === 401, badKey);

// Credentials must never be accepted from the query string (log/referer leaks)
const queryKey = await call("GET", `/api/device/status?api_key=${encodeURIComponent(apiKey)}`);
check("api key in query string is rejected", queryKey.status === 401, queryKey);

const bearerKey = await fetch(`${base}/api/device/status`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
check("api key via Bearer header is accepted", bearerKey.status === 200, bearerKey.status);

const readOnlyKey = await call("POST", "/api/keys", { token, body: { name: "Read only", scopes: ["read"] } });
const readScope = await call("POST", "/api/send-message", {
  apiKey: readOnlyKey.data.secret,
  body: { to: "08123456789", body: "hi" },
});
check("read-only key cannot send (403)", readScope.status === 403, readScope);

console.log("\n[public api: send-message]");

const send = await call("POST", "/api/send-message", {
  apiKey,
  body: { to: "0812-3456-7890", body: "Halo dari API" },
});
check("send-message -> 201", send.status === 201, send);
check("status is sent", send.data.data.status === "sent", send.data);
check("phone normalized to JID", send.data.data.to === "6281234567890@s.whatsapp.net", send.data.data);
check("providerId recorded", send.data.data.providerId === "MSG_1", send.data.data);

const empty = await call("POST", "/api/send-message", { apiKey, body: { to: "08123456789" } });
check("missing body+media -> 400", empty.status === 400, empty);

const badPhone = await call("POST", "/api/send-message", { apiKey, body: { to: "abc", body: "hi" } });
check("invalid phone -> 400", badPhone.status === 400, badPhone);

console.log("\n[public api: device status]");
const status = await call("GET", "/api/device/status", { apiKey });
check("device status reports connected", status.status === 200 && status.data.data[0].connected === true, status);

console.log("\n[public api: send-broadcast]");
const bc = await call("POST", "/api/send-broadcast", {
  apiKey,
  body: {
    name: "Promo Test",
    template: "Halo {{nama}}, nomor {{nomor}} dapat promo!",
    recipients: "phone,name\n628111111111,Budi\n628222222222,Siti\n628111111111,Duplikat\nabcdef,Bad",
    delayMs: 1000,
    startNow: false,
  },
});
check("send-broadcast -> 202", bc.status === 202, bc);
check("CSV header skipped & deduped", bc.data.data.total === 2, bc.data.data);
check("invalid number reported", bc.data.data.rejected.length === 1, bc.data.data);
const broadcastId = bc.data.data.broadcastId;

const bcDetail = await call("GET", `/api/broadcast/${broadcastId}`, { apiKey });
check("broadcast detail accessible", bcDetail.status === 200, bcDetail);
check("template rendered per recipient", bcDetail.data.data.recipients[0].status === "pending", bcDetail.data.data.recipients[0]);

console.log("\n[dashboard]");
const dashBroadcast = await call("GET", "/api/broadcasts", { token });
check("dashboard broadcast list", dashBroadcast.status === 200 && dashBroadcast.data.items.length === 1, dashBroadcast);

const preview = await call("POST", "/api/broadcasts/preview", {
  token,
  body: { template: "Hi {{nama}} / {{nomor}}", recipients: "628111,Budi", limit: 3 },
});
check("preview renders variables", preview.data.preview[0].body === "Hi Budi / 628111", preview.data);

const logs = await call("GET", "/api/messages/logs?limit=10", { token });
check("message logs include sent message", logs.status === 200 && logs.data.items.length >= 1, logs);
check("log status sent", logs.data.items[0].status === "sent", logs.data.items[0]);

const filtered = await call("GET", "/api/messages/logs?status=failed", { token });
check("log filter by status works", filtered.data.items.length === 0, filtered.data);

const stats = await call("GET", "/api/auth/stats", { token });
check("stats counts sent message", stats.data.stats.sent === 1, stats.data.stats);
check("stats quotas present", stats.data.stats.quota.limit === 1000, stats.data.stats.quota);

console.log("\n[quota enforcement]");
await prismaMock.user.update({ where: { id: reg.data.user.id }, data: { usedThisMonth: 1000 } });
const overQuota = await call("POST", "/api/send-message", { apiKey, body: { to: "08123456789", body: "hi" } });
check("quota exhausted -> 429", overQuota.status === 429, overQuota);
await prismaMock.user.update({ where: { id: reg.data.user.id }, data: { usedThisMonth: 1 } });

console.log("\n[isolation]");
const other = await call("POST", "/api/auth/register", {
  body: { email: "lain@example.com", password: "rahasia123" },
});
const otherDevices = await call("GET", "/api/devices", { token: other.data.token });
check("new user sees no devices", otherDevices.data.devices.length === 0, otherDevices.data);
const steal = await call("GET", `/api/devices/${deviceId}/qr`, { token: other.data.token });
check("cannot access another user's device (404)", steal.status === 404, steal);
const stealBc = await call("GET", `/api/broadcasts/${broadcastId}`, { token: other.data.token });
check("cannot read another user's broadcast (404)", stealBc.status === 404, stealBc);

console.log("\n[revocation]");
await call("DELETE", `/api/keys/${keyRes.data.key.id}`, { token });
const afterRevoke = await call("POST", "/api/send-message", { apiKey, body: { to: "08123456789", body: "hi" } });
check("revoked key -> 401", afterRevoke.status === 401, afterRevoke);

server.close();

console.log(`\n${"-".repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
