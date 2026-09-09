import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ConfigurationError, authSecret } from "@/lib/config";
import { CollabAccessError, hasCollabPermission, type CollabPermission, type CollabRole } from "@/lib/collab";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_KEY_LENGTH = 64;

export type SessionUser = { id: string; email: string };
export type SessionCollabUser = SessionUser & { collabId: string; collabName: string; role: CollabRole };

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(128),
}).strict();

export const signInCredentialsSchema = credentialsSchema.extend({
  password: z.string().min(1, "Enter your password.").max(128),
});

export const signUpCredentialsSchema = credentialsSchema.extend({
  password: z.string().min(12, "Use at least 12 characters.").max(128),
  invitationToken: z.string().trim().min(20).max(200).optional(),
});

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
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "none") return true;

  const origin = request.headers.get("origin") ?? (request.headers.get("referer") ? new URL(request.headers.get("referer")!).origin : null);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!origin) {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }

  try {
    const originUrl = new URL(origin);

    if (process.env.NODE_ENV !== "production") {
      const hostname = originUrl.hostname;
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") ||
        hostname.endsWith(".local")
      ) {
        return true;
      }
    }

    if (process.env.APP_URL) {
      const appUrl = new URL(process.env.APP_URL);
      if (originUrl.origin === appUrl.origin) return true;
    }

    if (host) {
      const hostOnly = host.split(":")[0];
      const hostPort = host.split(":")[1] ?? "";
      const originPort = originUrl.port || (originUrl.protocol === "https:" ? "443" : "80");
      const expectedPort = hostPort || (originUrl.protocol === "https:" ? "443" : "80");
      if (originUrl.hostname === hostOnly && originPort === expectedPort) return true;
    }

    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    if (host && `${proto}://${host}` === originUrl.origin) return true;
  } catch {
    return false;
  }
  return false;
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

export function authFailure(error: unknown, fallbackCode: string) {
  const detail = error instanceof Error ? error.message : "";
  if (error instanceof ConfigurationError && error.code === "DATABASE_CONFIGURATION") {
    return { code: "AUTH_DATABASE_CONFIGURATION", error: "Database configuration is incomplete. Check the Turso URL and token in Vercel." };
  }
  if (error instanceof ConfigurationError && error.code === "AUTH_SECRET_CONFIGURATION") {
    return { code: "AUTH_SECRET_CONFIGURATION", error: "Authentication configuration is incomplete. Check AUTH_SECRET in Vercel." };
  }
  if (/auth token|unauthori[sz]ed|forbidden/i.test(detail)) {
    return { code: "AUTH_DATABASE_AUTH_FAILED", error: "The Turso database rejected its authentication token." };
  }
  if (/fetch failed|connect|timeout|network|ENOTFOUND|ECONN/i.test(detail)) {
    return { code: "AUTH_DATABASE_UNAVAILABLE", error: "The app could not reach the Turso database." };
  }
  return { code: fallbackCode, error: "Authentication is temporarily unavailable. Please try again." };
}

export async function currentCollabUser(collabId: string, permission: CollabPermission): Promise<SessionCollabUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const client = await db();
  const now = Date.now();
  const result = await client.execute({
    sql: "SELECT users.id, users.email, sessions.expires_at, collabs.id AS collab_id, collabs.name AS collab_name, collab_memberships.role, collab_memberships.status FROM sessions JOIN users ON users.id = sessions.user_id LEFT JOIN collab_memberships ON collab_memberships.user_id = users.id AND collab_memberships.collab_id = ? LEFT JOIN collabs ON collabs.id = collab_memberships.collab_id WHERE sessions.id = ? LIMIT 1",
    args: [collabId, hashToken(token)],
  });
  const row = result.rows[0];
  if (!row || Number(row.expires_at) <= now) {
    if (row) await client.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [hashToken(token)] });
    return null;
  }
  if (!row.collab_id) throw new CollabAccessError("COLLAB_NOT_FOUND", "You are not a member of this Collab.");
  if (String(row.status) !== "active") throw new CollabAccessError("COLLAB_MEMBERSHIP_INACTIVE", "Your access to this Collab has been deactivated.");
  const role = String(row.role) as CollabRole;
  if (!hasCollabPermission(role, permission)) throw new CollabAccessError("COLLAB_PERMISSION_DENIED", "Your role does not have permission to perform this action.");
  return { id: String(row.id), email: String(row.email), collabId: String(row.collab_id), collabName: String(row.collab_name), role };
}
