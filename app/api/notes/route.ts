import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const client = await db();
    const result = await client.execute({ sql: "SELECT id, body, created_at FROM notes WHERE user_id = ? ORDER BY id DESC", args: [user.id] });
    return NextResponse.json({ notes: result.rows.map((row) => ({ id: Number(row.id), body: String(row.body), createdAt: String(row.created_at) })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database error." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const input = z.object({ body: z.string().trim().min(1).max(500) }).strict().safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "A note of up to 500 characters is required." }, { status: 400 });
    const client = await db();
    const result = await client.execute({ sql: "INSERT INTO notes (user_id, body) VALUES (?, ?) RETURNING id, body, created_at", args: [user.id, input.data.body] });
    const row = result.rows[0];
    return NextResponse.json({ note: { id: Number(row.id), body: String(row.body), createdAt: String(row.created_at) } }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database error." }, { status: 500 }); }
}
