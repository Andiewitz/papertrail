import { assertSameOrigin, currentUser } from "@/lib/auth";
import { CollabAccessError, requireCollabPermission } from "@/lib/collab";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ userId: z.string().uuid() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ collabId: string }> }) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const actor = await currentUser(); if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { collabId } = await params; const membership = await requireCollabPermission(actor.id, collabId, "transfer_admin");
    if (membership.role !== "admin") return NextResponse.json({ error: "Only the Admin can transfer ownership." }, { status: 403 });
    const input = schema.safeParse(await request.json()); if (!input.success) return NextResponse.json({ error: "Choose an active Co-admin." }, { status: 400 });
    const client = await db(); const target = await client.execute({ sql: "SELECT 1 FROM collab_memberships WHERE collab_id = ? AND user_id = ? AND role = 'co_admin' AND status = 'active'", args: [collabId, input.data.userId] });
    if (!target.rows[0]) return NextResponse.json({ error: "Ownership can only be transferred to an active Co-admin." }, { status: 409 });
    await client.batch([{ sql: "UPDATE collab_memberships SET role = 'co_admin' WHERE collab_id = ? AND user_id = ? AND role = 'admin'", args: [collabId, actor.id] }, { sql: "UPDATE collab_memberships SET role = 'admin' WHERE collab_id = ? AND user_id = ? AND role = 'co_admin'", args: [collabId, input.data.userId] }], "write");
    return NextResponse.json({ ok: true });
  } catch (error) { logError("collab_transfer_admin_failed", error); if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 }); return NextResponse.json({ error: "We couldn't transfer Admin ownership." }, { status: 500 }); }
}
