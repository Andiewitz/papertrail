import { assertSameOrigin, currentUser } from "@/lib/auth";
import { memberCodeHash, newMemberCode, requireCollabPermission, CollabAccessError } from "@/lib/collab";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const emptyBodySchema = z.object({}).strict();
const collabIdSchema = z.string().uuid();
const MEMBER_CODE_DURATION_MS = 15 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ collabId: string }> }) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { collabId } = await params;
    if (!collabIdSchema.safeParse(collabId).success) return NextResponse.json({ error: "Choose a valid workspace." }, { status: 400 });
    const input = emptyBodySchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "This request does not accept invitation details." }, { status: 400 });
    await requireCollabPermission(user.id, collabId, "invite_members");

    const client = await db();
    const now = Date.now();
    const expiresAt = now + MEMBER_CODE_DURATION_MS;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = newMemberCode();
      try {
        await client.batch([
          { sql: "UPDATE collab_invitations SET expires_at = ? WHERE collab_id = ? AND accepted_at IS NULL", args: [now, collabId] },
          { sql: "INSERT INTO collab_invitations (id, collab_id, code_hash, expires_at, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", args: [randomUUID(), collabId, memberCodeHash(code), expiresAt, user.id, now] },
        ], "write");
        return NextResponse.json({ invitation: { code, expiresAt } }, { status: 201 });
      } catch (error) {
        if (attempt === 3 || !(error instanceof Error) || !/unique|constraint/i.test(error.message)) throw error;
      }
    }
    throw new Error("Member code could not be generated.");
  } catch (error) { logError("collab_member_code_create_failed", error); if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 }); return NextResponse.json({ error: "We couldn't create a member code." }, { status: 500 }); }
}
