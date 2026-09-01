import { assertSameOrigin, createSession, credentialsSchema, enforceRateLimit, hashPassword, newUserId, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const limit = await enforceRateLimit(request, "sign-up", 5, 60 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    const input = credentialsSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid email or password." }, { status: 400 });
    const client = await db();
    const existing = await client.execute({ sql: "SELECT 1 FROM users WHERE email = ? LIMIT 1", args: [input.data.email] });
    if (existing.rows.length) return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    const user = { id: newUserId(), email: input.data.email };
    await client.execute({ sql: "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)", args: [user.id, user.email, await hashPassword(input.data.password), Date.now()] });
    const response = NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
    setSessionCookie(response, await createSession(user.id));
    return response;
  } catch (error) {
    console.error("Sign-up failed", error);
    return NextResponse.json({ error: "We could not create your account. Please try again." }, { status: 500 });
  }
}
