import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ user: await currentUser() });
  } catch (error) {
    const debug = process.env.NODE_ENV !== "production" && error instanceof Error ? { debug: error.message } : {};
    return NextResponse.json({ error: "Unable to check the session.", code: "AUTH_SESSION_CHECK_FAILED", ...debug }, { status: 500 });
  }
}
