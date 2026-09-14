/**
 * Admin panel test suite.
 *
 * Verifies the security-critical behaviour of the admin surface:
 *  - only role=admin can reach /api/admin/*
 *  - admins cannot lock themselves out
 *  - the last admin cannot be demoted
 *  - plan changes re-derive quota and device limits
 *  - admins cannot read member message content
 *  - per-user device overrides are respected by the device limit
 *
 * Run: node _admin.test.mjs
 */
import http from "node:http";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:1/db?schema=public";

const store = { users: [], devices: [], apiKeys: [], messages: [], broadcasts: [], recipients: [] };
let seq = 0;
const id = (p) => `${p}_${(++seq).toString().padStart(4, "0")}`;

const DEFAULTS = {
  users: {
    name: null,
    role: "user",
    plan: "free",
    isActive: true,
    monthlyQuota: 1000,
    usedThisMonth: 0,
    quotaResetAt: new Date(),
    deviceLimitOverride: null,
    adminNote: null,
  },
  devices: { phoneNumber: null, status: "disconnected", lastError: null, isActive: true, lastSeenAt: null },
  apiKeys: { scopes: ["send", "read"], lastUsedAt: null, revokedAt: null },
  messages: {
    deviceId: null,
    direction: "outbound",
    type: "text",
    status: "sent",
    source: "dashboard",
    broadcastId: null,
    sentAt: new Date(),
  },
  broadcasts: { deviceId: null, status: "completed", total: 0, sent: 0, failed: 0, pending: 0 },
  recipients: { name: null, status: "pending" },
};

function matches(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return cond.some((c) => matches(row, c));
    if (key === "AND") return cond.every((c) => matches(row, c));
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("contains" in cond) {
        return String(row[key] ?? "").toLowerCase().includes(String(cond.contains).toLowerCase());
      }
      if ("gte" in cond) return row[key] >= cond.gte;
      if ("lt" in cond) return row[key] < cond.lt;
      if ("not" in cond) return row[key] !== cond.not;
      if ("in" in cond) return cond.in.includes(row[key]);
    }
    return row[key] === cond;
  });
}

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

/** Mirrors Prisma's groupBy({ by, _count }) used by the admin counts. */
function groupBy({ by, where, _count }) {
  const field = by[0];
  const rows = store.users.length && "userId" in (store.devices[0] ?? {}) ? null : null;
  const source = where?.status
    ? store.devices
    : where?.direction
      ? store.messages
      : where?.userId
        ? store.devices
        : null;
  const table = where?.direction ? store.messages : where?.status ? store.devices : store.devices;
  void field;
  void rows;
  void source;
  const buckets = new Map();
  for (const row of table.filter((r) => matches(r, where ?? {}))) {
    const key = row[field];
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([k, count]) => ({ [field]: k, _count: count }));
}

function project(row) {
  return row ? { ...row } : row;
}

function model(name) {
  const key = name;
  return {
    async create({ data }) {
      const row = { id: data.id ?? id(key), createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS[key], ...data };
      const nested = data.recipients?.create;
      delete row.recipients;
      store[key].push(row);
      if (nested) {
        for (const child of Array.isArray(nested) ? nested : [nested]) {
          store.recipients.push({ id: id("recipients"), createdAt: new Date(), broadcastId: row.id, ...DEFAULTS.recipients, ...child });
        }
      }
      return project(row);
    },
    async findUnique({ where, include }) {
      const row = store[key].find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      if (!row) return null;
      const out = { ...row };
      if (include?.user) out.user = store.users.find((u) => u.id === row.userId) ?? null;
      if (include?.device) out.device = store.devices.find((d) => d.id === row.deviceId) ?? null;
      return out;
    },
    async findFirst({ where, include, orderBy, select }) {
      const rows = applyOrder(store[key].filter((r) => matches(r, where)), orderBy);
      let row = rows[0] ?? null;
      if (!row) return null;
      row = { ...row };
      if (include?.device) row.device = store.devices.find((d) => d.id === row.deviceId) ?? null;
      if (select) {
        const picked = {};
        for (const k of Object.keys(select)) if (select[k]) picked[k] = row[k];
        return picked;
      }
      return row;
    },
    async findMany({ where, include, orderBy, skip = 0, take, select } = {}) {
      let rows = applyOrder(store[key].filter((r) => matches(r, where)), orderBy).slice(
        skip,
        take ? skip + take : undefined,
      );
      rows = rows.map((r) => {
        const out = { ...r };
        if (include?.device) out.device = store.devices.find((d) => d.id === r.deviceId) ?? null;
        return out;
      });
      if (select) {
        return rows.map((r) => {
          const picked = {};
          for (const k of Object.keys(select)) if (select[k]) picked[k] = r[k];
          return picked;
        });
      }
      return rows;
    },
    async count({ where } = {}) {
      return store[key].filter((r) => matches(r, where ?? {})).length;
    },
    async aggregate({ where, _sum } = {}) {
      const rows = store[key].filter((r) => matches(r, where ?? {}));
      const out = { _sum: {} };
      for (const [field] of Object.entries(_sum ?? {})) {
        out._sum[field] = rows.reduce((acc, r) => acc + (r[field] ?? 0), 0);
      }
      return out;
    },
    async groupBy(args) {
      return groupBy(args);
    },
    async update({ where, data }) {
      const row = store[key].find((r) => r.id === where.id);
      if (!row) throw new Error(`${key} not found`);
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "increment" in v) row[k] = (row[k] ?? 0) + v.increment;
        else if (v && typeof v === "object" && "decrement" in v) row[k] = (row[k] ?? 0) - v.decrement;
        else row[k] = v;
      }
      return { ...row };
    },
    async updateMany({ where, data }) {
      const rows = store[key].filter((r) => matches(r, where));
      for (const r of rows) Object.assign(r, data);
      return { count: rows.length };
    },
    async delete({ where }) {
      const i = store[key].findIndex((r) => r.id === where.id);
      return store[key].splice(i, 1)[0];
    },
  };
}

const prismaModule = await import("./src/db/prisma.js");
Object.assign(prismaModule.prisma, {
  user: model("users"),
  device: model("devices"),
  apiKey: model("apiKeys"),
  message: model("messages"),
  broadcast: model("broadcasts"),
  broadcastRecipient: model("recipients"),
});

const { createApp } = await import("./src/app.js");
const { waManager } = await import("./src/whatsapp/manager.js");
const { sha256, hashPassword } = await import("./src/lib/security.js");
const { PLANS } = await import("./src/config/plans.js");

// WhatsApp layer stub: admin restore/logout must not need a real socket
const stopped = [];
waManager.send = async () => ({ providerId: "m1", jid: "x", onWhatsApp: true });
waManager.get = () => null;
waManager.start = async (deviceId) => {
  stopped.push({ action: "start", deviceId });
  return { status: "connecting" };
};
waManager.stop = async (deviceId) => {
  stopped.push({ action: "stop", deviceId });
};

const server = http.createServer(createApp());
await new Promise((r) => server.listen(4610, r));
const base = "http://127.0.0.1:4610";

let passed = 0;
let failed = 0;

async function call(method, path, { body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
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

/** Create a user directly and mint a JWT through the real login route. */
async function makeUser({ email, password = "rahasia123", role = "user", plan = "free", usedThisMonth = 0 }) {
  store.users.push({
    id: id("users"),
    email,
    name: email.split("@")[0],
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...DEFAULTS.users,
    role,
    plan,
    // Mirror the production behaviour: quota derives from the plan
    monthlyQuota: PLANS[plan].monthlyQuota,
    usedThisMonth,
  });
  const login = await call("POST", "/api/auth/login", { body: { email, password } });
  assert.equal(login.status, 200, `login failed for ${email}: ${JSON.stringify(login.data)}`);
  return { token: login.data.token, user: login.data.user };
}

console.log("\n[setup]");
const admin = await makeUser({ email: "admin@example.com", role: "admin", plan: "business" });
const member = await makeUser({ email: "member@example.com" });
const other = await makeUser({ email: "other@example.com" });
check("admin login exposes role=admin", admin.user.role === "admin", admin.user);
check("admin gets business quota", admin.user.monthlyQuota === PLANS.business.monthlyQuota, admin.user);
check("member defaults to free plan", member.user.plan === "free", member.user);
check("free plan device limit is 1", member.user.deviceLimit === 1, member.user);

console.log("\n[authorization]");
const noToken = await call("GET", "/api/admin/users");
check("no token -> 401", noToken.status === 401, noToken);

const memberAccess = await call("GET", "/api/admin/users", { token: member.token });
check("regular member blocked -> 403", memberAccess.status === 403, memberAccess);

const memberWrite = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: member.token,
  body: { plan: "business" },
});
check("regular member cannot escalate own plan -> 403", memberWrite.status === 403, memberWrite);

const memberStats = await call("GET", "/api/admin/stats", { token: member.token });
check("regular member cannot read platform stats -> 403", memberStats.status === 403, memberStats);

const adminUsers = await call("GET", "/api/admin/users", { token: admin.token });
check("admin lists users -> 200", adminUsers.status === 200, adminUsers);
check("list includes all 3 users", adminUsers.data.users.length === 3, adminUsers.data.users?.length);

console.log("\n[plan catalog]");
const catalog = await call("GET", "/api/admin/plans", { token: admin.token });
check("catalog returns 3 plans", catalog.data.plans.length === 3, catalog.data.plans?.length);
check(
  "pro plan quota matches landing page copy",
  catalog.data.plans.find((p) => p.id === "pro").monthlyQuota === 25000,
  catalog.data.plans,
);
check(
  "business device limit is 10",
  catalog.data.plans.find((p) => p.id === "business").maxDevices === 10,
  catalog.data.plans,
);

const publicCatalog = await call("GET", "/api/plans");
check("public plan endpoint works without auth", publicCatalog.status === 200, publicCatalog);

console.log("\n[plan change re-derives quota]");
const upgraded = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { plan: "pro" },
});
check("plan change -> 200", upgraded.status === 200, upgraded);
check("quota follows plan (25000)", upgraded.data.user.monthlyQuota === 25000, upgraded.data.user);
check("device limit follows plan (3)", upgraded.data.user.deviceLimit === 3, upgraded.data.user);

const custom = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { plan: "free", monthlyQuota: 7777 },
});
check("explicit quota wins over plan default", custom.data.user.monthlyQuota === 7777, custom.data.user);
check("plan still applied", custom.data.user.plan === "free", custom.data.user);

console.log("\n[device limit override]");
const raised = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { deviceLimitOverride: 7 },
});
check("override raises limit", raised.data.user.deviceLimit === 7, raised.data.user);

const capped = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { deviceLimitOverride: 999 },
});
check("override rejected above global cap (400)", capped.status === 400, capped);

const cleared = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { deviceLimitOverride: 0 },
});
check("override 0 clears back to plan limit", cleared.data.user.deviceLimit === 1, cleared.data.user);

console.log("\n[device limit enforced from plan]");
const created = await call("POST", "/api/devices", { token: member.token, body: { name: "D1" } });
check("member can create device within plan limit", created.status === 201, created);
const blocked = await call("POST", "/api/devices", { token: member.token, body: { name: "D2" } });
check("free plan blocks 2nd device -> 409", blocked.status === 409, blocked);
check("error message names the plan", /Free/.test(blocked.data?.error ?? ""), blocked.data);

const raiseAgain = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { deviceLimitOverride: 3 },
});
check("admin raises limit -> 3", raiseAgain.data.user.deviceLimit === 3, raiseAgain.data.user);
const second = await call("POST", "/api/devices", { token: member.token, body: { name: "D2" } });
check("member can now create 2nd device", second.status === 201, second);

console.log("\n[suspend & reactivate]");
const suspended = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { isActive: false },
});
check("admin suspends member", suspended.data.user.isActive === false, suspended.data.user);

const suspendedLogin = await call("POST", "/api/auth/login", {
  body: { email: "member@example.com", password: "rahasia123" },
});
check("suspended member cannot log in -> 401", suspendedLogin.status === 401, suspendedLogin);

const activeFlag = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { isActive: true },
});
check("admin reactivates member", activeFlag.data.user.isActive === true, activeFlag.data.user);

const relogin = await call("POST", "/api/auth/login", {
  body: { email: "member@example.com", password: "rahasia123" },
});
check("reactivated member can log in", relogin.status === 200, relogin);

console.log("\n[admin self-protection]");
const selfDemote = await call("PATCH", `/api/admin/users/${admin.user.id}`, {
  token: admin.token,
  body: { role: "user" },
});
check("admin cannot demote self -> 409", selfDemote.status === 409, selfDemote);

const selfSuspend = await call("PATCH", `/api/admin/users/${admin.user.id}`, {
  token: admin.token,
  body: { isActive: false },
});
check("admin cannot suspend self -> 409", selfSuspend.status === 409, selfSuspend);

const selfReset = await call("PATCH", `/api/admin/users/${admin.user.id}`, {
  token: admin.token,
  body: { deviceLimitOverride: 2 },
});
check("admin can still edit own non-lockout fields", selfReset.status === 200, selfReset);

console.log("\n[last admin protection]");
const promote = await call("PATCH", `/api/admin/users/${other.user.id}`, {
  token: admin.token,
  body: { role: "admin" },
});
check("admin promotes another user", promote.data.user.role === "admin", promote.data.user);
const demoteOther = await call("PATCH", `/api/admin/users/${other.user.id}`, {
  token: admin.token,
  body: { role: "user" },
});
check("can demote when another admin remains", demoteOther.status === 200, demoteOther);

console.log("\n[privacy: no message content for admins]");
store.messages.push(
  { id: id("messages"), userId: member.user.id, to: "628123456789@s.whatsapp.net", body: "RAHASIA PELANGGAN", createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS.messages },
  { id: id("messages"), userId: member.user.id, to: "628999999999@s.whatsapp.net", body: "ISI CHAT LAIN", createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS.messages },
);
store.broadcasts.push({ id: id("broadcasts"), userId: member.user.id, name: "Promo", template: "hi", createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS.broadcasts });

const detail = await call("GET", `/api/admin/users/${member.user.id}`, { token: admin.token });
check("admin reads member detail -> 200", detail.status === 200, detail);
check("member detail counts sent messages", detail.data.user.messagesSent === 2, detail.data.user);
check("admin sees member device list", Array.isArray(detail.data.devices) && detail.data.devices.length === 2, detail.data.devices);

const serialized = JSON.stringify(detail.data);
check("response contains no message body", !serialized.includes("RAHASIA PELANGGAN"), "message body leaked");
check("response contains no recipient phone", !serialized.includes("628999999999"), "recipient phone leaked");

const userListSerialized = JSON.stringify(adminUsers.data);
check("user list contains no message bodies", !userListSerialized.includes("RAHASIA PELANGGAN"), "leak in list");

console.log("\n[admin device controls]");
const restore = await call("POST", `/api/admin/users/${member.user.id}/devices/restore`, {
  token: admin.token,
});
check("admin restores member devices -> 200", restore.status === 200, restore);
check("restore attempted both devices", restore.data.attempted === 2, restore.data);

const targetDevice = detail.data.devices[0];
const logout = await call("POST", `/api/admin/users/${member.user.id}/devices/${targetDevice.id}/logout`, {
  token: admin.token,
});
check("admin can logout member device -> 200", logout.status === 200, logout);
check("stop() called with logout", stopped.some((s) => s.action === "stop" && s.deviceId === targetDevice.id), stopped);

const crossLogout = await call("POST", `/api/admin/users/${other.user.id}/devices/${targetDevice.id}/logout`, {
  token: admin.token,
});
check("device logout scoped to the named member -> 404", crossLogout.status === 404, crossLogout);

console.log("\n[usage controls]");
await call("PATCH", `/api/admin/users/${member.user.id}`, { token: admin.token, body: { monthlyQuota: 10 } });
const reset = await call("POST", `/api/admin/users/${member.user.id}/reset-usage`, { token: admin.token });
check("admin resets usage -> 200", reset.status === 200, reset);
check("usage is zero after reset", reset.data.user.usedThisMonth === 0, reset.data.user);

const extend = await call("POST", `/api/admin/users/${member.user.id}/extend-quota`, {
  token: admin.token,
  body: { days: 30 },
});
check("admin extends quota window -> 200", extend.status === 200, extend);
check("quotaResetAt pushed into the future", new Date(extend.data.user.quotaResetAt) > new Date(), extend.data.user);

console.log("\n[validation]");
const badPlan = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: { plan: "enterprise" },
});
check("unknown plan -> 400", badPlan.status === 400, badPlan);

const noChange = await call("PATCH", `/api/admin/users/${member.user.id}`, {
  token: admin.token,
  body: {},
});
check("empty patch -> 400", noChange.status === 400, noChange);

const missing = await call("PATCH", "/api/admin/users/does-not-exist", {
  token: admin.token,
  body: { plan: "pro" },
});
check("unknown member -> 404", missing.status === 404, missing);

console.log("\n[filtering]");
const byPlan = await call("GET", "/api/admin/users?plan=free", { token: admin.token });
check("filter by plan works", byPlan.data.users.every((u) => u.plan === "free"), byPlan.data.users);

const bySearch = await call("GET", "/api/admin/users?q=member", { token: admin.token });
check("search by email works", bySearch.data.users.length === 1, bySearch.data.users);

const suspendedList = await call("GET", "/api/admin/users?status=suspended", { token: admin.token });
check("filter suspended works", suspendedList.data.users.length === 0, suspendedList.data.users);

server.close();

console.log(`\n${"-".repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
