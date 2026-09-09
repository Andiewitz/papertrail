import { createHmac, randomBytes, randomUUID } from "crypto";
import { authSecret } from "@/lib/config";
import { db } from "@/lib/db";

export const collabRoles = ["admin", "co_admin", "member"] as const;
export type CollabRole = typeof collabRoles[number];
export type CollabPermission = "view_directory" | "clock_self" | "view_own_time" | "view_team_time" | "invite_members" | "manage_members" | "export_team_time" | "approve_time" | "configure_collab" | "transfer_admin" | "delete_collab";
export type CollabMembership = { collabId: string; collabName: string; userId: string; role: CollabRole; status: "active" | "deactivated" };

export class CollabAccessError extends Error {
  constructor(public readonly code: "COLLAB_NOT_FOUND" | "COLLAB_MEMBERSHIP_INACTIVE" | "COLLAB_PERMISSION_DENIED", message: string) { super(message); this.name = "CollabAccessError"; }
}

const permissions: Record<CollabRole, ReadonlySet<CollabPermission>> = {
  admin: new Set(["view_directory", "view_team_time", "invite_members", "manage_members", "export_team_time", "approve_time", "configure_collab", "transfer_admin", "delete_collab"]),
  co_admin: new Set(["view_directory", "clock_self", "view_own_time", "view_team_time", "invite_members", "manage_members", "export_team_time", "approve_time"]),
  member: new Set(["view_directory", "clock_self", "view_own_time"]),
};

export function hasCollabPermission(role: CollabRole, permission: CollabPermission) { return permissions[role].has(permission); }
export function invitationHash(token: string) { return createHmac("sha256", authSecret()).update(`collab-invitation:${token}`).digest("hex"); }
export function newInvitationToken() { return randomBytes(32).toString("base64url"); }

export async function createCollab(userId: string, name: string) {
  const collab = { id: randomUUID(), name: name.trim(), now: Date.now() };
  await (await db()).batch([
    { sql: "INSERT INTO collabs (id, name, created_by_user_id, created_at) VALUES (?, ?, ?, ?)", args: [collab.id, collab.name, userId, collab.now] },
    { sql: "INSERT INTO collab_memberships (collab_id, user_id, role, status, created_at) VALUES (?, ?, 'admin', 'active', ?)", args: [collab.id, userId, collab.now] },
  ], "write");
  return { id: collab.id, name: collab.name, role: "admin" as const };
}

export async function listCollabs(userId: string) {
  const result = await (await db()).execute({ sql: "SELECT collabs.id, collabs.name, collab_memberships.role, collab_memberships.status FROM collab_memberships JOIN collabs ON collabs.id = collab_memberships.collab_id WHERE collab_memberships.user_id = ? AND collab_memberships.status = 'active' ORDER BY collabs.created_at", args: [userId] });
  return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), role: String(row.role) as CollabRole }));
}

export async function requireCollabMembership(userId: string, collabId: string): Promise<CollabMembership> {
  const result = await (await db()).execute({ sql: "SELECT collabs.id AS collab_id, collabs.name AS collab_name, collab_memberships.user_id, collab_memberships.role, collab_memberships.status FROM collab_memberships JOIN collabs ON collabs.id = collab_memberships.collab_id WHERE collab_memberships.collab_id = ? AND collab_memberships.user_id = ? LIMIT 1", args: [collabId, userId] });
  const row = result.rows[0];
  if (!row) throw new CollabAccessError("COLLAB_NOT_FOUND", "You are not a member of this Collab.");
  if (String(row.status) !== "active") throw new CollabAccessError("COLLAB_MEMBERSHIP_INACTIVE", "Your access to this Collab has been deactivated.");
  return { collabId: String(row.collab_id), collabName: String(row.collab_name), userId: String(row.user_id), role: String(row.role) as CollabRole, status: "active" };
}

export async function requireCollabPermission(userId: string, collabId: string, permission: CollabPermission) {
  const membership = await requireCollabMembership(userId, collabId);
  if (!hasCollabPermission(membership.role, permission)) throw new CollabAccessError("COLLAB_PERMISSION_DENIED", "Your role does not have permission to perform this action.");
  return membership;
}

export async function acceptCollabInvitation(userId: string, email: string, token: string) {
  const client = await db();
  const found = await client.execute({ sql: "SELECT id, collab_id FROM collab_invitations WHERE token_hash = ? AND email = ? AND accepted_at IS NULL AND expires_at > ? LIMIT 1", args: [invitationHash(token), email, Date.now()] });
  const row = found.rows[0];
  if (!row) throw new CollabAccessError("COLLAB_NOT_FOUND", "This invitation is invalid, expired, or assigned to another email address.");
  const now = Date.now();
  await client.batch([
    { sql: "INSERT INTO collab_memberships (collab_id, user_id, role, status, created_at) VALUES (?, ?, 'member', 'active', ?)", args: [String(row.collab_id), userId, now] },
    { sql: "UPDATE collab_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL", args: [now, String(row.id)] },
  ], "write");
}
