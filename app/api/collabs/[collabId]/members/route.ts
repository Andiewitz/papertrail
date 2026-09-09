import { currentUser } from "@/lib/auth";
import { requireCollabPermission, CollabAccessError } from "@/lib/collab";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ collabId: string }> }) {
  try {
    const user = await currentUser(); if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { collabId } = await params;
    await requireCollabPermission(user.id, collabId, "view_directory");
    const result = await (await db()).execute({ sql: "SELECT users.id, users.email, users.display_name, collab_memberships.role, collab_memberships.status, collab_memberships.created_at FROM collab_memberships JOIN users ON users.id = collab_memberships.user_id WHERE collab_memberships.collab_id = ? ORDER BY CASE collab_memberships.role WHEN 'admin' THEN 0 WHEN 'co_admin' THEN 1 ELSE 2 END, users.display_name, users.email", args: [collabId] });
    return NextResponse.json({ members: result.rows.map((row) => ({ id: String(row.id), email: String(row.email), displayName: row.display_name === null ? null : String(row.display_name), role: String(row.role), status: String(row.status), joinedAt: Number(row.created_at) })) });
  } catch (error) { logError("collab_members_list_failed", error); if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 }); return NextResponse.json({ error: "We couldn't load Collab members." }, { status: 500 }); }
}
