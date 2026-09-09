import { currentUser } from "@/lib/auth";
import { listCollabs } from "@/lib/collab";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ collabs: await listCollabs(user.id) });
  } catch (error) { logError("collabs_list_failed", error); return NextResponse.json({ error: "We couldn't load your Collabs." }, { status: 500 }); }
}

export async function POST() {
  return NextResponse.json({ error: "Your workspace is created automatically with your account." }, { status: 405, headers: { Allow: "GET" } });
}
