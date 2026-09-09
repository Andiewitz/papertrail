import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const profileSchema = z.object({ displayName: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Use 80 characters or fewer.") }).strict();

export async function PATCH(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const input = profileSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Enter a valid display name." }, { status: 400 });
    await (await db()).execute({ sql: "UPDATE users SET display_name = ? WHERE id = ?", args: [input.data.displayName, user.id] });
    return NextResponse.json({ user: { ...user, displayName: input.data.displayName } });
  } catch (error) {
    logError("profile_update_failed", error);
    return NextResponse.json({ error: "Your profile could not be updated. Please try again." }, { status: 500 });
  }
}
