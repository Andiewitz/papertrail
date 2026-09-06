import { assertSameOrigin, currentUser } from "@/lib/auth";
import { createCollab, listCollabs } from "@/lib/collab";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const createSchema = z.object({ name: z.string().trim().min(2, "Enter a Collab name.").max(80) }).strict();

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ collabs: await listCollabs(user.id) });
  } catch (error) { logError("collabs_list_failed", error); return NextResponse.json({ error: "We couldn't load your Collabs." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid Collab name." }, { status: 400 });
    return NextResponse.json({ collab: await createCollab(user.id, input.data.name) }, { status: 201 });
  } catch (error) { logError("collab_create_failed", error); return NextResponse.json({ error: "We couldn't create your Collab. Please try again." }, { status: 500 }); }
}
