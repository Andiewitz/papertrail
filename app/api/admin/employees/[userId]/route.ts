import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { MembershipError, requireRole } from "@/lib/organization";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const updateEmployeeSchema = z.object({
  role: z.enum(["admin", "manager", "employee"]).optional(),
  status: z.enum(["active", "deactivated"]).optional(),
}).strict().refine((input) => input.role !== undefined || input.status !== undefined, "Choose a role or status to update.");

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const actor = await currentUser();
    if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const membership = await requireRole(actor.id, ["admin"]);
    const input = updateEmployeeSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid employee update." }, { status: 400 });
    const { userId } = await params;
    if (userId === actor.id) return NextResponse.json({ error: "You cannot change your own administrator access from this endpoint." }, { status: 400 });

    const client = db();
    const target = await client.execute({ sql: "SELECT role, status FROM memberships WHERE organization_id = ? AND user_id = ? LIMIT 1", args: [membership.organizationId, userId] });
    const targetRow = target.rows[0];
    if (!targetRow) return NextResponse.json({ error: "Employee not found in this organization." }, { status: 404 });
    const removesLastAdmin = String(targetRow.role) === "admin" && (input.data.role !== undefined && input.data.role !== "admin" || input.data.status === "deactivated");
    if (removesLastAdmin) {
      const admins = await client.execute({ sql: "SELECT COUNT(*) AS count FROM memberships WHERE organization_id = ? AND role = 'admin' AND status = 'active'", args: [membership.organizationId] });
      if (Number(admins.rows[0].count) <= 1) return NextResponse.json({ error: "Keep at least one active administrator in the organization." }, { status: 409 });
    }
    await client.batch([
      { sql: "UPDATE memberships SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE organization_id = ? AND user_id = ?", args: [input.data.role ?? null, input.data.status ?? null, membership.organizationId, userId] },
      ...(input.data.status === "deactivated" ? [{ sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] }] : []),
    ], "write");
    const updated = await client.execute({ sql: "SELECT users.id, users.email, memberships.role, memberships.status FROM memberships JOIN users ON users.id = memberships.user_id WHERE memberships.organization_id = ? AND memberships.user_id = ?", args: [membership.organizationId, userId] });
    const row = updated.rows[0];
    return NextResponse.json({ employee: { id: String(row.id), email: String(row.email), role: String(row.role), status: String(row.status) } });
  } catch (error) {
    logError("employee_update_failed", error);
    if (error instanceof MembershipError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "We couldn't update that employee. Please try again." }, { status: 500 });
  }
}
