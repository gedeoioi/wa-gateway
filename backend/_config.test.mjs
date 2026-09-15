/**
 * Guards the production secret check.
 *
 * The bug this prevents: config/env.js used to fall back to a public default
 * JWT secret and only logged a warning that never fired, so a production
 * deploy with no .env would accept tokens forged by anyone who read the source.
 *
 * Run: node _config.test.mjs
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? ` :: ${JSON.stringify(extra)}` : ""}`);
  }
}

// Import assertProductionSecrets once; it is a pure function so it is safe to
// call repeatedly with different arguments.
const { assertProductionSecrets, isProd } = await import("./src/config/env.js");

const GOOD = {
  jwtSecret: "a".repeat(64),
  apiKeyEncryptionSecret: "b".repeat(64),
  databaseUrl: "postgresql://u:p@db:5432/x",
  frontendUrl: "https://app.example.com",
};

function expectRefusal(config, label) {
  // assertProductionSecrets only enforces in production, so toggle it
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assertProductionSecrets(config);
    // If we get here the config was accepted, which is the failure case
    console.log(`  FAIL  ${label} :: accepted insecure config`);
    failed++;
  } catch (err) {
    const ok = err.code === "INSECURE_CONFIG";
    console.log(`  PASS  ${label}`);
    if (ok) passed++;
    else {
      failed++;
      console.log(`  FAIL  ${label} :: wrong error code ${err.code}`);
    }
  } finally {
    process.env.NODE_ENV = previous;
  }
}

function expectAcceptance(config, label) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assertProductionSecrets(config);
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${label} :: unexpectedly refused: ${err.message}`);
    failed++;
  } finally {
    process.env.NODE_ENV = previous;
  }
}

console.log("\n[environment]");
check("test harness runs outside production", isProd === false, isProd);

console.log("\n[secure config accepted]");
expectAcceptance(GOOD, "valid production config is accepted");

console.log("\n[insecure secrets refused]");
expectRefusal(
  { ...GOOD, jwtSecret: "dev-only-insecure-secret" },
  "public default JWT secret refused",
);
expectRefusal(
  { ...GOOD, jwtSecret: "" },
  "empty JWT secret refused",
);
expectRefusal(
  { ...GOOD, jwtSecret: undefined },
  "missing JWT secret refused",
);
expectRefusal(
  { ...GOOD, jwtSecret: "change-me-in-production-please-use-a-long-random-string" },
  "change-me placeholder refused",
);
expectRefusal(
  { ...GOOD, apiKeyEncryptionSecret: "dev-only-api-key-encryption-secret-000000" },
  "public default API key secret refused",
);
expectRefusal(
  { ...GOOD, apiKeyEncryptionSecret: "" },
  "empty API key secret refused",
);

console.log("\n[other production requirements]");
expectRefusal({ ...GOOD, databaseUrl: "" }, "missing DATABASE_URL refused");
expectRefusal(
  { ...GOOD, frontendUrl: "http://localhost:3000" },
  "localhost FRONTEND_URL refused",
);
expectRefusal(
  { ...GOOD, frontendUrl: "http://127.0.0.1:3000" },
  "127.0.0.1 FRONTEND_URL refused",
);
expectRefusal({ ...GOOD, frontendUrl: "" }, "missing FRONTEND_URL refused");

console.log("\n[development is unaffected]");
{
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    // Placeholder secrets must be fine outside production so `npm run dev`
    // works without a .env file.
    assertProductionSecrets({
      jwtSecret: "dev-only-insecure-secret",
      apiKeyEncryptionSecret: "dev-only-api-key-encryption-secret-000000",
      databaseUrl: "",
      frontendUrl: "http://localhost:3000",
    });
    console.log("  PASS  insecure config allowed in development");
    passed++;
  } catch (err) {
    console.log(`  FAIL  development blocked: ${err.message}`);
    failed++;
  } finally {
    process.env.NODE_ENV = previous;
  }
}

console.log("\n[real boot is blocked, not just the helper]");
{
  // Importing the module in production with no secrets must throw at import
  // time, proving the guard runs before any server code executes. A child
  // process is used so this does not poison the current module cache.
  const { spawnSync } = await import("node:child_process");
  const script = `
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://u:p@db:5432/x';
    process.env.FRONTEND_URL = 'https://app.example.com';
    delete process.env.JWT_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    await import('./src/config/env.js');
    console.log('BOOTED');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const refused = result.status !== 0 && /INSECURE_CONFIG/.test(result.stderr ?? "");
  check("importing env with no secrets refused in production", refused, {
    status: result.status,
    stderr: (result.stderr ?? "").slice(0, 200),
  });

  const okScript = `
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://u:p@db:5432/x';
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.API_KEY_ENCRYPTION_SECRET = 'b'.repeat(64);
    await import('./src/config/env.js');
    console.log('BOOTED');
  `;
  const okResult = spawnSync(process.execPath, ["--input-type=module", "-e", okScript], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  check(
    "importing env with proper secrets boots in production",
    okResult.status === 0 && /BOOTED/.test(okResult.stdout ?? ""),
    { status: okResult.status, stderr: (okResult.stderr ?? "").slice(0, 200) },
  );
}

console.log(`\n${"-".repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
