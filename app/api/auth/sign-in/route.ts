import { assertSameOrigin, createSession, credentialsSchema, enforceRateLimit, hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const limit = await enforceRateLimit(request, "sign-in", 10, 15 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    const input = credentialsSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
    const result = await (await db()).execute({ sql: "SELECT id, email, password_hash FROM users WHERE email = ?", args: [input.data.email] });
    const row = result.rows[0];
    const valid = await verifyPassword(input.data.password, row ? String(row.password_hash) : await hashPassword(input.data.password));
    if (!row || !valid) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    const user = { id: String(row.id), email: String(row.email) };
    const response = NextResponse.json({ user });
    setSessionCookie(response, await createSession(user.id));
    return response;
  } catch (error) {
    console.error("Sign-in failed", error);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
