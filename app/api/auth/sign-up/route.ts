import { assertSameOrigin, authFailure, createSession, enforceRateLimit, hashPassword, newUserId, setSessionCookie, signUpCredentialsSchema } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin.", code: "AUTH_INVALID_ORIGIN" }, { status: 403 });
    const limit = await enforceRateLimit(request, "sign-up", 5, 60 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Please try again later.", code: "AUTH_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    const input = signUpCredentialsSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid email or password.", code: "AUTH_INVALID_INPUT" }, { status: 400 });
    const client = await db();
    const existing = await client.execute({ sql: "SELECT 1 FROM users WHERE email = ? LIMIT 1", args: [input.data.email] });
    if (existing.rows.length) return NextResponse.json({ error: "An account with that email already exists.", code: "AUTH_EMAIL_EXISTS" }, { status: 409 });
    const user = { id: newUserId(), email: input.data.email };
    await client.execute({ sql: "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)", args: [user.id, user.email, await hashPassword(input.data.password), Date.now()] });
    const response = NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
    setSessionCookie(response, await createSession(user.id));
    return response;
  } catch (error) {
    logError("auth_sign_up_failed", error);
    const debug = process.env.NODE_ENV !== "production" && error instanceof Error ? { debug: error.message } : {};
    return NextResponse.json({ ...authFailure(error, "AUTH_SIGN_UP_FAILED"), ...debug }, { status: 500 });
  }
}
