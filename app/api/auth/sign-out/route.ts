import { assertSameOrigin, clearSessionCookie, deleteCurrentSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  await deleteCurrentSession();
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
