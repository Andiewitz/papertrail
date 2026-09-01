import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ user: await currentUser() });
  } catch {
    return NextResponse.json({ error: "Unable to check the session." }, { status: 500 });
  }
}
