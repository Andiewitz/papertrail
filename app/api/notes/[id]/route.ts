import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { id } = await params;
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid note id." }, { status: 400 });
    const client = await db();
    await client.execute({ sql: "DELETE FROM notes WHERE id = ? AND user_id = ?", args: [Number(id), user.id] });
    return new NextResponse(null, { status: 204 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database error." }, { status: 500 }); }
}
