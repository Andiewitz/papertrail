import { assertSameOrigin, currentUser } from "@/lib/auth";
import { CollabAccessError, requireCollabPermission } from "@/lib/collab";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ role: z.enum(["co_admin", "member"]).optional(), status: z.enum(["active", "deactivated"]).optional() }).strict().refine((value) => value.role !== undefined || value.status !== undefined, "Choose a member change.");
const routeParamsSchema = z.object({ collabId: z.string().uuid(), userId: z.string().uuid() });

export async function PATCH(request: Request, { params }: { params: Promise<{ collabId: string; userId: string }> }) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const actor = await currentUser(); if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const routeParams = routeParamsSchema.safeParse(await params);
    if (!routeParams.success) return NextResponse.json({ error: "Choose valid workspace and member IDs." }, { status: 400 });
    const { collabId, userId } = routeParams.data; const actorMembership = await requireCollabPermission(actor.id, collabId, "manage_members");
    const input = schema.safeParse(await request.json()); if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid member change." }, { status: 400 });
    if (actor.id === userId) return NextResponse.json({ error: "You cannot change your own role from this endpoint." }, { status: 400 });
    const client = await db(); const target = await client.execute({ sql: "SELECT role FROM collab_memberships WHERE collab_id = ? AND user_id = ? LIMIT 1", args: [collabId, userId] });
    if (!target.rows[0]) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    const targetRole = String(target.rows[0].role);
    if (targetRole === "admin") return NextResponse.json({ error: "Use ownership transfer to change the Admin." }, { status: 409 });
    if (actorMembership.role === "co_admin" && targetRole !== "member") return NextResponse.json({ error: "Co-admins can only manage Members." }, { status: 403 });
    if (actorMembership.role === "co_admin" && input.data.role === "co_admin") return NextResponse.json({ error: "Only the Admin can promote a Co-admin." }, { status: 403 });
    await client.batch([{ sql: "UPDATE collab_memberships SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE collab_id = ? AND user_id = ?", args: [input.data.role ?? null, input.data.status ?? null, collabId, userId] }, ...(input.data.status === "deactivated" ? [{ sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] }] : [])], "write");
    return NextResponse.json({ ok: true });
  } catch (error) { logError("collab_member_update_failed", error); if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 }); return NextResponse.json({ error: "We couldn't update this member." }, { status: 500 }); }
}
