import { assertSameOrigin, currentUser } from "@/lib/auth";
import { CollabAccessError, requireCollabPermission } from "@/lib/collab";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const workspaceSchema = z.object({ name: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Use 80 characters or fewer.") }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ collabId: string }> }) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { collabId } = await params;
    await requireCollabPermission(user.id, collabId, "configure_collab");
    const input = workspaceSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Enter a valid workspace name." }, { status: 400 });
    await (await db()).execute({ sql: "UPDATE collabs SET name = ? WHERE id = ?", args: [input.data.name, collabId] });
    return NextResponse.json({ collab: { id: collabId, name: input.data.name } });
  } catch (error) {
    logError("collab_update_failed", error);
    if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "Your workspace could not be updated. Please try again." }, { status: 500 });
  }
}
