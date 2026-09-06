import { assertSameOrigin, currentUser } from "@/lib/auth";
import { newInvitationToken, invitationHash, requireCollabPermission, CollabAccessError } from "@/lib/collab";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ collabId: string }> }) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser(); if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { collabId } = await params; await requireCollabPermission(user.id, collabId, "invite_members");
    const input = schema.safeParse(await request.json()); if (!input.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const client = await db(); const member = await client.execute({ sql: "SELECT 1 FROM collab_memberships JOIN users ON users.id = collab_memberships.user_id WHERE collab_memberships.collab_id = ? AND users.email = ? LIMIT 1", args: [collabId, input.data.email] });
    if (member.rows[0]) return NextResponse.json({ error: "This person is already in the Collab." }, { status: 409 });
    const now = Date.now(); const token = newInvitationToken(); const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    await client.batch([{ sql: "UPDATE collab_invitations SET expires_at = ? WHERE collab_id = ? AND email = ? AND accepted_at IS NULL", args: [now, collabId, input.data.email] }, { sql: "INSERT INTO collab_invitations (id, collab_id, email, token_hash, expires_at, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [randomUUID(), collabId, input.data.email, invitationHash(token), expiresAt, user.id, now] }], "write");
    return NextResponse.json({ invitation: { email: input.data.email, token, expiresAt } }, { status: 201 });
  } catch (error) { logError("collab_invitation_create_failed", error); if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 }); return NextResponse.json({ error: "We couldn't create this invitation." }, { status: 500 }); }
}
