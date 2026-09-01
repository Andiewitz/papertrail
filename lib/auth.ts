import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_KEY_LENGTH = 64;

export type SessionUser = { id: string; email: string };

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
}).strict();

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to a random value of at least 32 characters.");
  return secret;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expected] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const client = await db();
  const now = Date.now();
  const result = await client.execute({ sql: "SELECT users.id, users.email, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?", args: [hashToken(token)] });
  const row = result.rows[0];
  if (!row || Number(row.expires_at) <= now) {
    if (row) await client.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [hashToken(token)] });
    return null;
  }
  return { id: String(row.id), email: String(row.email) };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const client = await db();
  await client.batch([
    { sql: "DELETE FROM sessions WHERE user_id = ? AND expires_at < ?", args: [userId, now] },
    { sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", args: [hashToken(token), userId, now + SESSION_DURATION_MS, now] },
  ], "write");
  return token;
}

export async function deleteCurrentSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token) await (await db()).execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [hashToken(token)] });
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DURATION_MS / 1000 });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const expected = process.env.APP_URL ?? `${request.headers.get("x-forwarded-proto") ?? "http"}://${host}`;
    return new URL(origin).origin === new URL(expected).origin;
  } catch { return false; }
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function enforceRateLimit(request: Request, scope: string, maxAttempts: number, windowMs: number) {
  const key = createHmac("sha256", authSecret()).update(`${scope}:${clientAddress(request)}`).digest("hex");
  const now = Date.now();
  const resetAt = now + windowMs;
  const client = await db();
  await client.execute({ sql: "DELETE FROM rate_limits WHERE reset_at < ?", args: [now] });
  const result = await client.execute({
    sql: "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END, reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END RETURNING count, reset_at",
    args: [key, resetAt, now, now],
  });
  const row = result.rows[0];
  const allowed = Number(row.count) <= maxAttempts;
  return { allowed, retryAfter: Math.max(1, Math.ceil((Number(row.reset_at) - now) / 1000)) };
}

export function newUserId() { return randomUUID(); }
