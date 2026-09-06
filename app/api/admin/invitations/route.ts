import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { createInvitationToken, hashInvitationToken, MembershipError, requireRole } from "@/lib/organization";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["manager", "employee"]).default("employee"),
}).strict();

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const membership = await requireRole(user.id, ["admin", "manager"]);
    const result = await (await db()).execute({ sql: "SELECT id, email, role, expires_at, accepted_at, created_at FROM invitations WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100", args: [membership.organizationId] });
    return NextResponse.json({ invitations: result.rows.map((row) => ({ id: String(row.id), email: String(row.email), role: String(row.role), expiresAt: Number(row.expires_at), acceptedAt: row.accepted_at === null ? null : Number(row.accepted_at), createdAt: Number(row.created_at) })) });
  } catch (error) {
    logError("invitations_list_failed", error);
    if (error instanceof MembershipError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "We couldn't load invitations. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const membership = await requireRole(user.id, ["admin"]);
    const input = invitationSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid invitation." }, { status: 400 });
    const client = await db();
    const existingEmployee = await client.execute({ sql: "SELECT 1 FROM users JOIN memberships ON memberships.user_id = users.id WHERE memberships.organization_id = ? AND users.email = ? LIMIT 1", args: [membership.organizationId, input.data.email] });
    if (existingEmployee.rows[0]) return NextResponse.json({ error: "This person is already in your organization." }, { status: 409 });
    const token = createInvitationToken();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    await client.batch([
      { sql: "UPDATE invitations SET expires_at = ? WHERE organization_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > ?", args: [now, membership.organizationId, input.data.email, now] },
      { sql: "INSERT INTO invitations (id, organization_id, email, role, token_hash, expires_at, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [crypto.randomUUID(), membership.organizationId, input.data.email, input.data.role, hashInvitationToken(token), expiresAt, user.id, now] },
    ], "write");
    return NextResponse.json({ invitation: { email: input.data.email, role: input.data.role, token, expiresAt } }, { status: 201 });
  } catch (error) {
    logError("invitation_create_failed", error);
    if (error instanceof MembershipError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "We couldn't create that invitation. Please try again." }, { status: 500 });
  }
}
