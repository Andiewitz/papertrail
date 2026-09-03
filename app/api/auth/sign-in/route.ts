import { assertSameOrigin, authFailure, createSession, enforceRateLimit, hashPassword, setSessionCookie, signInCredentialsSchema, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin.", code: "AUTH_INVALID_ORIGIN" }, { status: 403 });
    const limit = await enforceRateLimit(request, "sign-in", 10, 15 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Please try again later.", code: "AUTH_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    const input = signInCredentialsSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid email or password.", code: "AUTH_INVALID_INPUT" }, { status: 400 });
    const result = await (await db()).execute({ sql: "SELECT id, email, password_hash FROM users WHERE email = ?", args: [input.data.email] });
    const row = result.rows[0];
    const valid = await verifyPassword(input.data.password, row ? String(row.password_hash) : await hashPassword(input.data.password));
    if (!row || !valid) return NextResponse.json({ error: "Invalid email or password.", code: "AUTH_INVALID_CREDENTIALS" }, { status: 401 });
    const user = { id: String(row.id), email: String(row.email) };
    const response = NextResponse.json({ user });
    setSessionCookie(response, await createSession(user.id));
    return response;
  } catch (error) {
    console.error("Sign-in failed", error);
    const debug = process.env.NODE_ENV !== "production" && error instanceof Error ? { debug: error.message } : {};
    return NextResponse.json({ ...authFailure(error, "AUTH_SIGN_IN_FAILED"), ...debug }, { status: 500 });
  }
}
