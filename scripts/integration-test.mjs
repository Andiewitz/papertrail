import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectory = await mkdtemp(path.join(tmpdir(), "papertrail-integration-"));
const databaseUrl = `file:${path.join(testDirectory, "attendance.db").replaceAll("\\", "/")}`;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a test port."));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url, output) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/auth/session`);
      if (response.ok) return;
    } catch { /* The server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Next.js.\n${output()}`);
}

async function json(response, expectedStatus, label) {
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, expectedStatus, `${label}: expected ${expectedStatus}, got ${response.status}. ${JSON.stringify(body)}`);
  return body;
}

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const runtimeEnv = {
  ...process.env,
  AUTH_SECRET: "integration-test-secret-that-is-at-least-32-characters",
  LOCAL_DATABASE_URL: databaseUrl,
  NEXT_TELEMETRY_DISABLED: "1",
};
let output = "";
const migration = spawn(process.execPath, [path.join(root, "scripts", "migrate.mjs")], { cwd: root, env: runtimeEnv, stdio: ["ignore", "pipe", "pipe"] });
let migrationOutput = "";
migration.stdout.on("data", (chunk) => { migrationOutput += chunk; });
migration.stderr.on("data", (chunk) => { migrationOutput += chunk; });
const [migrationCode] = await once(migration, "exit");
assert.equal(migrationCode, 0, `Migration failed before integration test.\n${migrationOutput}`);
const server = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: root,
  env: runtimeEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });

try {
  await waitForServer(baseUrl, () => output);

  const health = await json(await fetch(`${baseUrl}/api/health`), 200, "health check");
  assert.equal(health.ok, true);
  assert.equal(health.database, "connected");
  assert.equal(health.migrations, 3);

  const noSession = await json(await fetch(`${baseUrl}/api/auth/session`), 200, "anonymous session");
  assert.equal(noSession.user, null);
  await json(await fetch(`${baseUrl}/api/time`), 401, "anonymous attendance request");

  const origin = baseUrl;
  const registration = await json(await fetch(`${baseUrl}/api/auth/sign-up`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({ email: "owner@example.test", password: "IntegrationPassword!2026" }),
  }), 201, "registration");
  assert.equal(registration.user.email, "owner@example.test");

  const ownerCookieHeader = (await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "203.0.113.11" },
    body: JSON.stringify({ email: "owner@example.test", password: "IntegrationPassword!2026" }),
  })).headers.get("set-cookie");
  assert.ok(ownerCookieHeader?.includes("HttpOnly"), "sign-in should return an HttpOnly session cookie");
  const ownerCookie = ownerCookieHeader.split(";", 1)[0];
  const ownerHeaders = { cookie: ownerCookie, origin, "content-type": "application/json", "x-forwarded-for": "203.0.113.11" };

  const directory = await json(await fetch(`${baseUrl}/api/admin/employees`, { headers: { cookie: ownerCookie } }), 200, "administrator directory");
  assert.equal(directory.employees.length, 1);
  assert.equal(directory.employees[0].role, "admin");

  const invitation = await json(await fetch(`${baseUrl}/api/admin/invitations`, {
    method: "POST", headers: ownerHeaders, body: JSON.stringify({ email: "employee@example.test", role: "employee" }),
  }), 201, "employee invitation");
  assert.ok(invitation.invitation.token, "an invitation token should be returned exactly once at creation");
  const listedInvitations = await json(await fetch(`${baseUrl}/api/admin/invitations`, { headers: { cookie: ownerCookie } }), 200, "listed invitations");
  assert.equal(listedInvitations.invitations[0].token, undefined, "invitation listing must never expose a token");

  await json(await fetch(`${baseUrl}/api/auth/sign-up`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "203.0.113.12" },
    body: JSON.stringify({ email: "uninvited@example.test", password: "IntegrationPassword!2026" }),
  }), 403, "uninvited registration");

  await json(await fetch(`${baseUrl}/api/auth/sign-up`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "203.0.113.13" },
    body: JSON.stringify({ email: "employee@example.test", password: "IntegrationPassword!2026", invitationToken: invitation.invitation.token }),
  }), 201, "invited registration");

  const employeeCookieHeader = (await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "203.0.113.14" },
    body: JSON.stringify({ email: "employee@example.test", password: "IntegrationPassword!2026" }),
  })).headers.get("set-cookie");
  assert.ok(employeeCookieHeader?.includes("HttpOnly"), "employee sign-in should return a session cookie");
  const cookie = employeeCookieHeader.split(";", 1)[0];
  const authenticatedHeaders = { cookie, origin, "content-type": "application/json", "x-forwarded-for": "203.0.113.14" };

  await json(await fetch(`${baseUrl}/api/time`), 401, "unauthenticated time request");
  const emptyHistory = await json(await fetch(`${baseUrl}/api/time`, { headers: { cookie } }), 200, "empty time history");
  assert.deepEqual(emptyHistory.entries, []);

  const clockIn = await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "clock-in" }),
  }), 201, "clock in");
  assert.equal(clockIn.entry.clockOut, null);

  const duplicateClockIn = await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "clock-in" }),
  }), 200, "duplicate clock in");
  assert.equal(duplicateClockIn.alreadyClockedIn, true);
  assert.equal(duplicateClockIn.entry.id, clockIn.entry.id);

  const breakStart = await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "break-start" }),
  }), 201, "start break");
  assert.equal(breakStart.entry.breaks.length, 1);
  assert.equal(breakStart.entry.breaks[0].endedAt, null);

  const duplicateBreakStart = await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "break-start" }),
  }), 200, "duplicate break start");
  assert.equal(duplicateBreakStart.alreadyOnBreak, true);

  await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "clock-out", entryId: clockIn.entry.id }),
  }), 409, "clock out with active break");

  const breakEnd = await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "break-end" }),
  }), 200, "end break");
  assert.notEqual(breakEnd.entry.breaks[0].endedAt, null);

  const clockOut = await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "clock-out", entryId: clockIn.entry.id }),
  }), 200, "clock out");
  assert.notEqual(clockOut.entry.clockOut, null);

  const duplicateClockOut = await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST", headers: authenticatedHeaders, body: JSON.stringify({ action: "clock-out", entryId: clockIn.entry.id }),
  }), 200, "duplicate clock out");
  assert.equal(duplicateClockOut.alreadyClockedOut, true);

  const history = await json(await fetch(`${baseUrl}/api/time`, { headers: { cookie } }), 200, "completed time history");
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].id, clockIn.entry.id);
  assert.notEqual(history.entries[0].clockOut, null);

  await json(await fetch(`${baseUrl}/api/time`, {
    method: "POST",
    headers: { ...authenticatedHeaders, origin: "https://untrusted.example" },
    body: JSON.stringify({ action: "clock-in" }),
  }), 403, "cross-origin clock in");

  const employee = (await json(await fetch(`${baseUrl}/api/admin/employees`, { headers: { cookie: ownerCookie } }), 200, "updated administrator directory")).employees.find((person) => person.email === "employee@example.test");
  assert.ok(employee, "new employee should appear in the directory");
  await json(await fetch(`${baseUrl}/api/admin/employees/${employee.id}`, {
    method: "PATCH", headers: ownerHeaders, body: JSON.stringify({ status: "deactivated" }),
  }), 200, "employee deactivation");
  await json(await fetch(`${baseUrl}/api/time`, { headers: { cookie } }), 401, "deactivated employee session");
  await json(await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "203.0.113.14" },
    body: JSON.stringify({ email: "employee@example.test", password: "IntegrationPassword!2026" }),
  }), 403, "deactivated employee sign-in");

  const signedOut = await fetch(`${baseUrl}/api/auth/sign-out`, { method: "POST", headers: ownerHeaders });
  assert.equal(signedOut.status, 204, "sign out should clear the session");
  const afterSignOut = await json(await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: ownerCookie } }), 200, "signed-out session");
  assert.equal(afterSignOut.user, null);

  console.log("Integration flow passed: organization bootstrap, invitations, roles, deactivation, auth, session, clock-in/out idempotency, history, origin protection, and sign-out.");
} finally {
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await rm(testDirectory, { recursive: true, force: true });
}
