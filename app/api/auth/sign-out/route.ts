import { assertSameOrigin, clearSessionCookie, deleteCurrentSession } from "@/lib/auth";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    await deleteCurrentSession();
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    logError("auth_sign_out_failed", error);
    return NextResponse.json({ error: "We couldn't sign you out. Please try again.", code: "SIGN_OUT_FAILED" }, { status: 500 });
  }
}
