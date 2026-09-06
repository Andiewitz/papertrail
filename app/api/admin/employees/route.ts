import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { MembershipError, requireRole } from "@/lib/organization";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const membership = await requireRole(user.id, ["admin", "manager"]);
    const result = await db().execute({
      sql: "SELECT users.id, users.email, memberships.role, memberships.status, memberships.created_at FROM memberships JOIN users ON users.id = memberships.user_id WHERE memberships.organization_id = ? ORDER BY CASE memberships.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, users.email",
      args: [membership.organizationId],
    });
    return NextResponse.json({ organization: { id: membership.organizationId, name: membership.organizationName, timeZone: membership.timeZone, weekStartsOn: membership.weekStartsOn }, employees: result.rows.map((row) => ({ id: String(row.id), email: String(row.email), role: String(row.role), status: String(row.status), joinedAt: Number(row.created_at) })) });
  } catch (error) {
    logError("employee_directory_load_failed", error);
    if (error instanceof MembershipError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "We couldn't load the employee directory. Please try again." }, { status: 500 });
  }
}
