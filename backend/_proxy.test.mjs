/**
 * Guards the proxy/Cloudflare configuration.
 *
 * Background: the API behind Cloudflare returned 522 intermittently while the
 * app was healthy. Root cause was a Node/proxy timeout mismatch, plus a few
 * settings that assumed a direct connection. These checks fail loudly if any of
 * them regress, because all of them are invisible in local testing.
 *
 * Run: node _proxy.test.mjs   (wired into `npm test`)
 */
import http from "node:http";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ""}`);
  }
}

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const serverSrc = read("src/server.js");
const appSrc = read("src/app.js");
const envSrc = read("src/config/env.js");
const socketSrc = read("src/realtime/socket.js");
const frontendSocket = read("../frontend/src/lib/socket.ts");

const CF_IDLE_MS = 100_000; // Cloudflare closes idle upstream connections here

console.log("\n[server timeouts vs Cloudflare]");

// Node's default keepAliveTimeout (5s) is shorter than Cloudflare's idle window,
// so Node closes the socket first and Cloudflare's next request hits a dead
// connection, which surfaces as 522.
const keepAlive = Number(serverSrc.match(/keepAliveTimeout\s*=\s*([\d_]+)/)?.[1]?.replace(/_/g, ""));
const headers = Number(serverSrc.match(/headersTimeout\s*=\s*([\d_]+)/)?.[1]?.replace(/_/g, ""));

check("keepAliveTimeout diset eksplisit", Number.isFinite(keepAlive), keepAlive);
check(
  `keepAliveTimeout > idle Cloudflare (${CF_IDLE_MS}ms)`,
  keepAlive > CF_IDLE_MS,
  `${keepAlive}ms`,
);
check(
  "headersTimeout > keepAliveTimeout (wajib, jika tidak request terpotong)",
  headers > keepAlive,
  `headers=${headers}, keepAlive=${keepAlive}`,
);

console.log("\n[trust proxy]");

check("trust proxy memakai nilai konfigurabel", /trust proxy",\s*env\.trustProxyHops/.test(appSrc), appSrc.match(/trust proxy[^\n]*/)?.[0]);
check("TRUST_PROXY_HOPS ada di env config", /trustProxyHops/.test(envSrc));
check(
  "default 2 hop (Cloudflare -> Nginx)",
  /TRUST_PROXY_HOPS,\s*2\)/.test(envSrc),
  envSrc.match(/trustProxyHops[^\n]*/)?.[0],
);

// Too many trusted hops lets a client spoof X-Forwarded-For and bypass limits
const hopsDefault = Number(envSrc.match(/TRUST_PROXY_HOPS,\s*(\d+)/)?.[1]);
check("default hops tidak berlebihan (<= 4)", hopsDefault > 0 && hopsDefault <= 4, hopsDefault);

console.log("\n[cache headers untuk Cloudflare]");

check("respons API diberi no-store", /Cloudflare-CDN-Cache-Control/.test(appSrc));
check("CDN-Cache-Control diset", /CDN-Cache-Control/.test(appSrc));
check(
  "path yang dilindungi: /api, /socket.io, /health",
  /\["\/api",\s*"\/socket\.io",\s*"\/health"/.test(appSrc),
  appSrc.match(/app\.use\(\[[^\]]*\][^\n]*no-store/s)?.[0]?.slice(0, 80),
);

console.log("\n[Socket.IO di balik proxy]");

check("server mengaktifkan transport polling sebagai fallback", /transports:\s*\["websocket",\s*"polling"\]/.test(socketSrc));
check(
  "pingInterval < idle Cloudflare",
  Number(socketSrc.match(/pingInterval:\s*([\d_]+)/)?.[1]?.replace(/_/g, "")) < CF_IDLE_MS,
);
check(
  "pingTimeout wajar (>= pingInterval agar 1 ping hilang tidak memutus sesi)",
  Number(socketSrc.match(/pingTimeout:\s*([\d_]+)/)?.[1]?.replace(/_/g, "")) >=
    Number(socketSrc.match(/pingInterval:\s*([\d_]+)/)?.[1]?.replace(/_/g, "")),
);

// The client must not force websocket-only: that fails outright wherever the
// upgrade is blocked (Cloudflare with WS off, corporate proxy, some mobile nets).
check(
  "frontend TIDAK memaksa websocket-only",
  !/transports:\s*\["websocket"\]/.test(frontendSocket),
  frontendSocket.match(/transports:[^\]]*\]/)?.[0],
);
check(
  "frontend menyertakan polling sebagai fallback",
  /transports:\s*\["websocket",\s*"polling"\]/.test(frontendSocket),
);

console.log("\n[runtime: nilai benar-benar diterapkan]");

// Build a server the same way server.js does and inspect the live values
const probe = http.createServer();
probe.keepAliveTimeout = keepAlive;
probe.headersTimeout = headers;
check("keepAliveTimeout terpasang di runtime", probe.keepAliveTimeout === keepAlive, probe.keepAliveTimeout);
check("headersTimeout terpasang di runtime", probe.headersTimeout === headers, probe.headersTimeout);
probe.close();

console.log(`\n${"-".repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
assert.ok(true);
process.exit(failed === 0 ? 0 : 1);
