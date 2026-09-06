import { createHmac, randomBytes, randomUUID } from "crypto";
import { authSecret } from "@/lib/config";
import { db } from "@/lib/db";

export const organizationRoles = ["admin", "manager", "employee"] as const;
export type OrganizationRole = typeof organizationRoles[number];
export type Membership = { organizationId: string; organizationName: string; role: OrganizationRole; status: "active" | "deactivated"; timeZone: string; weekStartsOn: number };

export class MembershipError extends Error {
  constructor(public readonly code: "MEMBERSHIP_INACTIVE" | "MEMBERSHIP_MISSING" | "ROLE_FORBIDDEN", message: string) {
    super(message);
    this.name = "MembershipError";
  }
}

function workspaceName(email: string) {
  const localPart = email.split("@", 1)[0].replace(/[._-]+/g, " ").trim();
  return `${(localPart || "Papertrail").slice(0, 70)} Workspace`;
}

export function hashInvitationToken(token: string) {
  return createHmac("sha256", authSecret()).update(`invitation:${token}`).digest("hex");
}

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export async function createWorkspaceForUser(user: { id: string; email: string; passwordHash: string }) {
  const organizationId = randomUUID();
  const now = Date.now();
  const client = await db();
  await client.batch([
    { sql: "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", args: [organizationId, workspaceName(user.email), now] },
    { sql: "INSERT INTO users (id, email, password_hash, created_at, active_organization_id) VALUES (?, ?, ?, ?, ?)", args: [user.id, user.email, user.passwordHash, now, organizationId] },
    { sql: "INSERT INTO memberships (organization_id, user_id, role, status, created_at) VALUES (?, ?, 'admin', 'active', ?)", args: [organizationId, user.id, now] },
  ], "write");
  return organizationId;
}

export async function acceptInvitationForUser(user: { id: string; email: string; passwordHash: string }, token: string) {
  const client = await db();
  const invitation = await client.execute({
    sql: "SELECT id, organization_id, role FROM invitations WHERE token_hash = ? AND email = ? AND accepted_at IS NULL AND expires_at > ? LIMIT 1",
    args: [hashInvitationToken(token), user.email, Date.now()],
  });
  const row = invitation.rows[0];
  if (!row) throw new MembershipError("MEMBERSHIP_MISSING", "This invitation is invalid, expired, or assigned to another email address.");
  const now = Date.now();
  await client.batch([
    { sql: "INSERT INTO users (id, email, password_hash, created_at, active_organization_id) VALUES (?, ?, ?, ?, ?)", args: [user.id, user.email, user.passwordHash, now, String(row.organization_id)] },
    { sql: "INSERT INTO memberships (organization_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'active', ?)", args: [String(row.organization_id), user.id, String(row.role), now] },
    { sql: "UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL", args: [now, String(row.id)] },
  ], "write");
}

export async function activeMembership(userId: string): Promise<Membership> {
  const client = await db();
  const current = await client.execute({
    sql: "SELECT organizations.id AS organization_id, organizations.name AS organization_name, organizations.time_zone, organizations.week_starts_on, memberships.role, memberships.status FROM users JOIN organizations ON organizations.id = users.active_organization_id JOIN memberships ON memberships.organization_id = organizations.id AND memberships.user_id = users.id WHERE users.id = ? LIMIT 1",
    args: [userId],
  });
  const row = current.rows[0];
  if (row) {
    if (String(row.status) !== "active") throw new MembershipError("MEMBERSHIP_INACTIVE", "This employee account has been deactivated.");
    return { organizationId: String(row.organization_id), organizationName: String(row.organization_name), role: String(row.role) as OrganizationRole, status: "active", timeZone: String(row.time_zone), weekStartsOn: Number(row.week_starts_on) };
  }

  const user = await client.execute({ sql: "SELECT email FROM users WHERE id = ? LIMIT 1", args: [userId] });
  if (!user.rows[0]) throw new MembershipError("MEMBERSHIP_MISSING", "The account no longer exists.");
  const existing = await client.execute({
    sql: "SELECT organizations.id AS organization_id, organizations.name AS organization_name, organizations.time_zone, organizations.week_starts_on, memberships.role, memberships.status FROM memberships JOIN organizations ON organizations.id = memberships.organization_id WHERE memberships.user_id = ? ORDER BY memberships.created_at ASC LIMIT 1",
    args: [userId],
  });
  const membership = existing.rows[0];
  if (membership) {
    await client.execute({ sql: "UPDATE users SET active_organization_id = ? WHERE id = ?", args: [String(membership.organization_id), userId] });
    if (String(membership.status) !== "active") throw new MembershipError("MEMBERSHIP_INACTIVE", "This employee account has been deactivated.");
    return { organizationId: String(membership.organization_id), organizationName: String(membership.organization_name), role: String(membership.role) as OrganizationRole, status: "active", timeZone: String(membership.time_zone), weekStartsOn: Number(membership.week_starts_on) };
  }

  const organizationId = randomUUID();
  const now = Date.now();
  await client.batch([
    { sql: "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)", args: [organizationId, workspaceName(String(user.rows[0].email)), now] },
    { sql: "INSERT INTO memberships (organization_id, user_id, role, status, created_at) VALUES (?, ?, 'admin', 'active', ?)", args: [organizationId, userId, now] },
    { sql: "UPDATE users SET active_organization_id = ? WHERE id = ? AND active_organization_id IS NULL", args: [organizationId, userId] },
  ], "write");
  return { organizationId, organizationName: workspaceName(String(user.rows[0].email)), role: "admin", status: "active", timeZone: "UTC", weekStartsOn: 1 };
}

export async function requireRole(userId: string, permittedRoles: readonly OrganizationRole[]) {
  const membership = await activeMembership(userId);
  if (!permittedRoles.includes(membership.role)) throw new MembershipError("ROLE_FORBIDDEN", "Your role does not have permission to perform this action.");
  return membership;
}
