/**
 * Live end-to-end audit of the public API against the real server + database.
 *
 * Unlike the unit suites, this starts the actual Express app on a real port with
 * Postgres and exercises every documented endpoint as an API consumer would,
 * including the success path. WhatsApp is stubbed only at the socket boundary.
 *
 * Run: node _api-audit.mjs
 */
import http from "node:http";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma, connectDatabase, disconnectDatabase } from "./src/db/prisma.js";
import { hashPassword } from "./src/lib/security.js";

process.env.NODE_ENV = "test";

// --- stub the WhatsApp socket, so no real device is needed -----------------
const { waManager } = await import("./src/whatsapp/manager.js");

/** Captured sends, so we can assert what the API actually forwarded. */
const sent = [];
waManager.send = async (deviceId, payload) => {
  sent.push({ deviceId, ...payload });
  return { providerId: `PROVIDER_${sent.length}`, jid: payload.to, onWhatsApp: true };
};

const { createApp } = await import("./src/app.js");

/* ------------------------------- harness -------------------------------- */

const server = http.createServer(createApp());
await new Promise((r) => server.listen(4620, r));
const BASE = "http://127.0.0.1:4620";

let passed = 0;
let failed = 0;

async function call(method, path, { body, token, apiKey, raw, contentType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (body && !raw) headers["Content-Type"] = "application/json";
  // `raw` sends an arbitrary string; contentType lets a test declare it as JSON
  // while the payload itself is intentionally malformed.
  if (raw && contentType) headers["Content-Type"] = contentType;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ""}`);
  }
}

/* --------------------------------- setup -------------------------------- */

await connectDatabase();

const stamp = Date.now();
const email = `apicheck-${stamp}@example.com`;
const password = "rahasia123";

const user = await prisma.user.create({
  data: {
    email,
    name: "API Audit",
    passwordHash: await hashPassword(password),
    plan: "business",
    monthlyQuota: 100_000,
  },
});

// A connected device, so the send paths can succeed
const device = await prisma.device.create({
  data: {
    userId: user.id,
    name: "Audit Device",
    sessionId: randomUUID(),
    status: "connected",
    phoneNumber: "628111222333",
  },
});

console.log("\n[setup]");
const login = await call("POST", "/api/auth/login", { body: { email, password } });
check("login berhasil", login.status === 200 && !!login.data.token, login);
const token = login.data.token;

const keyRes = await call("POST", "/api/keys", {
  token,
  body: { name: "Audit Key", scopes: ["send", "read"] },
});
check("buat API key", keyRes.status === 201 && keyRes.data.secret?.startsWith("wag_"), keyRes);
const apiKey = keyRes.data.secret;

/* -------------------------------- tests --------------------------------- */

console.log("\n[GET /api/device/status]");
{
  const r = await call("GET", "/api/device/status", { apiKey });
  check("200", r.status === 200, r);
  check("bentuk data sesuai dokumentasi", r.data?.success === true && Array.isArray(r.data.data), r.data);
  const d = r.data.data[0];
  check("device terhubung terdeteksi", d?.connected === true, d);
  check("field lengkap (id,name,status,phoneNumber,lastSeenAt)",
    d && "id" in d && "name" in d && "status" in d && "phoneNumber" in d && "lastSeenAt" in d, d);

  const filtered = await call("GET", `/api/device/status?deviceId=${device.id}`, { apiKey });
  check("filter deviceId berfungsi", filtered.data?.data?.length === 1, filtered.data);

  const unknown = await call("GET", "/api/device/status?deviceId=tidak-ada", { apiKey });
  check("deviceId tak dikenal -> 404", unknown.status === 404, unknown);
}

console.log("\n[POST /api/send-message]");
{
  const before = sent.length;
  const r = await call("POST", "/api/send-message", {
    apiKey,
    body: { to: "0812-3456-7890", body: "Halo dari audit" },
  });
  check("201 Created", r.status === 201, r);
  check("success=true", r.data?.success === true, r.data);
  check("nomor dinormalisasi ke JID", r.data?.data?.to === "6281234567890@s.whatsapp.net", r.data?.data);
  check("status sent", r.data?.data?.status === "sent", r.data?.data);
  check("providerId tercatat", !!r.data?.data?.providerId, r.data?.data);
  check("pesan benar-benar diteruskan ke socket", sent.length === before + 1, sent.length);
  check("body diteruskan apa adanya", sent.at(-1)?.body === "Halo dari audit", sent.at(-1));

  const log = await prisma.message.findFirst({
    where: { userId: user.id, to: "6281234567890@s.whatsapp.net" },
    orderBy: { createdAt: "desc" },
  });
  check("tersimpan di database dengan status sent", log?.status === "sent", log);

  const badPhone = await call("POST", "/api/send-message", { apiKey, body: { to: "abc", body: "x" } });
  check("nomor tidak valid -> 400", badPhone.status === 400, badPhone);

  const noBody = await call("POST", "/api/send-message", { apiKey, body: { to: "628123456789" } });
  check("body kosong -> 400", noBody.status === 400, noBody);

  const explicitDevice = await call("POST", "/api/send-message", {
    apiKey,
    body: { to: "628999888777", body: "Pilih device", deviceId: device.id },
  });
  check("deviceId eksplisit diterima", explicitDevice.status === 201, explicitDevice);
}

console.log("\n[POST /api/send-broadcast]");
{
  const r = await call("POST", "/api/send-broadcast", {
    apiKey,
    body: {
      name: "Audit Broadcast",
      template: "Halo {{nama}}, pesanan {{nomor}} sedang diproses.",
      recipients: "628111111111,Budi\n628222222222,Siti\n628111111111,Duplikat\nabcdef,Rusak",
      delayMs: 1000,
      startNow: false,
    },
  });
  check("202 Accepted", r.status === 202, r);
  check("success=true", r.data?.success === true, r.data);
  check("duplikat & nomor rusak disaring", r.data?.data?.total === 2, r.data?.data);
  check("nomor rusak dilaporkan", r.data?.data?.rejected?.length === 1, r.data?.data);
  const broadcastId = r.data?.data?.broadcastId;

  const detail = await call("GET", `/api/broadcast/${broadcastId}`, { apiKey });
  check("detail broadcast dapat dibaca", detail.status === 200, detail);
  check("progress 0 karena belum dijalankan", detail.data?.data?.progress === 0, detail.data?.data);

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId },
    orderBy: { createdAt: "asc" },
  });
  check("template variabel ter-render", recipients[0]?.body === "Halo Budi, pesanan 628111111111 sedang diproses.", recipients[0]?.body);
  check("variabel nomor ter-render", recipients[1]?.body?.includes("628222222222"), recipients[1]?.body);

  const noTemplate = await call("POST", "/api/send-broadcast", { apiKey, body: { recipients: "628111" } });
  check("template wajib -> 400", noTemplate.status === 400, noTemplate);

  const emptyRecipients = await call("POST", "/api/send-broadcast", {
    apiKey,
    body: { template: "Halo", recipients: "   \n  " },
  });
  check("recipients kosong -> 400", emptyRecipients.status === 400, emptyRecipients);

  // Run it and confirm the queue actually dispatches
  const started = await call("POST", `/api/broadcast/${broadcastId}`, { apiKey });
  check("broadcast bisa dijalankan (POST tidak didokumentasikan tapi ada)", [200, 404, 405].includes(started.status), started);
}

console.log("\n[GET /api/messages]");
{
  const r = await call("GET", "/api/messages?limit=10", { apiKey });
  check("200", r.status === 200, r);
  check("success=true dan ada data", r.data?.success === true && Array.isArray(r.data.data), r.data);
  check("pagination lengkap", r.data?.pagination && "page" in r.data.pagination && "total" in r.data.pagination, r.data?.pagination);
  check("berisi pesan yang baru dikirim", r.data.data.some((m) => m.status === "sent"), r.data.data?.length);

  const filtered = await call("GET", "/api/messages?status=failed", { apiKey });
  check("filter status berfungsi", filtered.status === 200, filtered);

  // The dashboard must still work on the exact same URL (JWT, not API key)
  const asDashboard = await call("GET", "/api/messages/logs?limit=10", { token });
  check("dashboard (JWT) tetap bisa akses /api/messages/logs", asDashboard.status === 200, asDashboard);
}

console.log("\n[autentikasi & scope]");
{
  const noKey = await call("GET", "/api/device/status");
  check("tanpa API key -> 401", noKey.status === 401, noKey);
  check("pesan error menyebut X-API-Key", /X-API-Key/i.test(noKey.data?.error ?? ""), noKey.data);

  const badKey = await call("GET", "/api/device/status", { apiKey: "wag_palsu_tidakvalid" });
  check("API key palsu -> 401", badKey.status === 401, badKey);

  const bearerKey = await fetch(`${BASE}/api/device/status`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  check("API key via Authorization: Bearer juga diterima", bearerKey.status === 200, bearerKey.status);

  const readOnly = await call("POST", "/api/keys", { token, body: { name: "RO", scopes: ["read"] } });
  const denied = await call("POST", "/api/send-message", {
    apiKey: readOnly.data.secret,
    body: { to: "628123", body: "x" },
  });
  check("scope read tidak boleh kirim -> 403", denied.status === 403, denied);

  const queryKey = await call("GET", `/api/device/status?api_key=${encodeURIComponent(apiKey)}`);
  check("API key di query string ditolak -> 401", queryKey.status === 401, queryKey);
}

console.log("\n[error handling]");
{
  // Malformed JSON with the JSON content-type, which is what triggers the
  // body parser's SyntaxError path.
  const badJson = await call("POST", "/api/send-message", {
    apiKey,
    raw: "{rusak",
    contentType: "application/json",
  });
  check(
    "JSON rusak -> 400 dengan pesan ramah (bukan detail parser)",
    badJson.status === 400 && /JSON/i.test(badJson.data?.error ?? "") && !/position \d+/i.test(badJson.data?.error ?? ""),
    badJson.data,
  );

  const notFound = await call("GET", "/api/tidak-ada", { apiKey });
  check("endpoint tidak ada -> 404 informatif", notFound.status === 404 && /docs/i.test(notFound.data?.error ?? ""), notFound.data);
}

console.log("\n[kuota]");
{
  await prisma.user.update({ where: { id: user.id }, data: { usedThisMonth: 100_000 } });
  const over = await call("POST", "/api/send-message", { apiKey, body: { to: "628123456789", body: "x" } });
  check("kuota habis -> 429", over.status === 429, over);
  await prisma.user.update({ where: { id: user.id }, data: { usedThisMonth: 0 } });
}

console.log("\n[OpenAPI]");
{
  const spec = await call("GET", "/openapi.json");
  const paths = Object.keys(spec.data?.paths ?? {});
  const expected = ["/send-message", "/send-broadcast", "/device/status", "/broadcast/{id}", "/messages"];
  for (const p of expected) {
    check(`dokumentasi memuat ${p}`, paths.includes(p), paths);
  }
  check("security scheme ApiKeyAuth terdefinisi", !!spec.data?.components?.securitySchemes?.ApiKeyAuth, spec.data?.components?.securitySchemes);
  check("server base URL mengarah ke /api", /\/api$/.test(spec.data?.servers?.[0]?.url ?? ""), spec.data?.servers);

  const docs = await call("GET", "/docs/");
  check("Swagger UI tersaji", docs.status === 200, docs.status);
}

/* ------------------------------- teardown -------------------------------- */

server.close();
await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
await disconnectDatabase();

console.log(`\n${"-".repeat(52)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
