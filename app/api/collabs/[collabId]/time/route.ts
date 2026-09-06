import { GET as timeGet, POST as timePost } from "@/app/api/time/route";

function withCollab(request: Request, collabId: string) {
  const headers = new Headers(request.headers);
  headers.set("x-papertrail-collab", collabId);
  return new Request(request, { headers });
}

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ collabId: string }> }) { return timeGet(withCollab(request, (await params).collabId)); }
export async function POST(request: Request, { params }: { params: Promise<{ collabId: string }> }) { return timePost(withCollab(request, (await params).collabId)); }
