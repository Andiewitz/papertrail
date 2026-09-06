# Collab and permission model implementation plan

## Confirmed product decisions

- Every account starts as a normal user with no required workspace.
- A user can create one or more Collabs and can join multiple Collabs.
- Every Collab has exactly one **Admin**. Admin is the owner role.
- Every person added to a Collab starts as a **Member**.
- The only promotion path is Member → Co-admin. Co-admins run day-to-day operations but never become a second Admin.
- All active Collab members can see the member directory.
- Roles are fixed for now: Admin, Co-admin, Member. No custom-role UI or per-member overrides in this release.

## Design rules

1. The visible role is not the authorization mechanism. The server resolves every role to a fixed permission set and checks a named permission for each protected action.
2. Every data query and write is scoped to one Collab and checks active membership before returning data.
3. `collab_id` is immutable on attendance records. A later role change or departure cannot make historical time ambiguous.
4. The browser can select a Collab, but it never grants access. The server is the authority on membership and permissions.
5. The migration is additive first. Existing organization records remain intact until the new Collab data has been verified in production.

## Target data model

### `users`

Keep identity, password hash, and account creation data only. Remove `active_organization_id` after the transition; a user may have many Collabs, so selection belongs in the route/UI rather than the identity row.

### `collabs`

```text
id                 UUID primary key
name               display name
created_by_user_id user who created the Collab
created_at
```

The Collab ID is an immutable internal UUID. A shareable display slug can be added later, but it must not replace the UUID as the authorization key.

### `collab_memberships`

```text
collab_id
user_id
role               admin | co_admin | member
status             active | deactivated
created_at
```

Constraints:

- `UNIQUE(collab_id, user_id)`.
- A partial unique index permits at most one `role = 'admin'` membership per Collab.
- Application rules prevent removing or demoting the final Admin. Since there can only be one Admin, this means an ownership transfer is an explicit atomic operation, not an ordinary role edit.

### `collab_invitations`

```text
id
collab_id
email
token_hash
expires_at
accepted_at
created_by_user_id
created_at
```

Invitations always create a Member. An Admin can promote that Member to Co-admin only after they join. Tokens remain one-time, email-bound, and seven days long.

### Existing business data

Add `collab_id` to:

- `time_entries`
- `break_entries` indirectly through their parent time entry
- future corrections, approvals, exports, and audit events

Keep `user_id` on time entries too: it identifies who worked the shift; `collab_id` identifies which tenant owns the record.

## Server-side permission layer

Permissions are named constants in one server-only module. They are not booleans sent by the browser and are not duplicated across database columns.

| Permission | Admin | Co-admin | Member |
| --- | --- | --- | --- |
| View Collab directory | Yes | Yes | Yes |
| Clock own time / view own history | Yes | Yes | Yes |
| View team attendance | Yes | Yes | No |
| Invite members | Yes | Yes | No |
| Promote/demote members | Yes | Yes, Member only | No |
| Deactivate members | Yes | Yes, Member only | No |
| View/export team records | Yes | Yes | No |
| Approve or correct team time | Yes | Yes | No |
| Rename/configure Collab | Yes | No | No |
| Promote a Co-admin / transfer Admin ownership | Yes | No | No |
| Delete Collab | Yes | No | No |

Implementation API shape:

```text
requireCollabMembership(userId, collabId)
requireCollabPermission(userId, collabId, permission)
```

Every route uses one of these functions before accessing Collab data. The permission resolver returns the effective permission set based on the current database membership.

## User flows

### Account creation

1. User signs up or signs in.
2. No automatic workspace is created.
3. If they belong to no Collabs, show onboarding: **Create a Collab** or **Join with invitation**.
4. Creating a Collab creates its first membership with `role = admin`.

### Joining a Collab

1. Admin or Co-admin creates an invitation for an email address.
2. The recipient signs up/signs in using the invitation token.
3. The server creates an active `member` membership for that Collab.
4. The user can select the new Collab from their Collab switcher.

### Collab navigation

Use Collab-scoped routes, for example:

```text
/collabs/[collabId]
/collabs/[collabId]/history
/collabs/[collabId]/members
```

The API derives the Collab from the route/request and verifies access server-side. There is no globally trusted `active_collab_id` from the browser.

### Ownership transfer

1. Current Admin selects an active Co-admin.
2. Server verifies the actor is the unique Admin and target is an active Co-admin in the same Collab.
3. In one transaction, target becomes Admin and former Admin becomes Co-admin.
4. An audit event records both actor and target.

## Migration plan

### Phase A — protect and prepare

1. Confirm the encrypted external backup agent has a current verified restore point.
2. Create a database migration that adds `collabs`, `collab_memberships`, `collab_invitations`, and `collab_id` columns without deleting old organization tables.
3. Copy each existing organization into a Collab with the same ID where possible.
4. Copy memberships with role mapping: old `admin` → `admin`, `manager` → `co_admin`, `employee` → `member`.
5. Backfill every time entry's `collab_id` from its employee's existing organization membership. Stop and fail the migration if any entry cannot be mapped.
6. Copy valid invitations as Member-only Collab invitations.
7. Validate row counts, unique Admin constraint, and that every time entry has a valid Collab.

### Phase B — authorization and API transition

1. Add the central permission resolver and unit tests for the complete role matrix.
2. Convert session/auth loading so login works without a Collab membership.
3. Replace organization-scoped route checks with Collab membership/permission checks.
4. Change sign-up to create a normal account, rather than an automatic workspace.
5. Add API endpoints for creating/listing Collabs, listing members, inviting a Member, promoting/demoting a Member, deactivating a Member, and transferring ownership.
6. Add immutable `collab_id` filtering to all time and break queries/writes.
7. Add audit records for membership, role, ownership, and time-management actions.

### Phase C — client transition

1. Add first-run onboarding for no-Collab users.
2. Add a Collab switcher.
3. Move dashboard and history to Collab-scoped URLs.
4. Add a member directory visible to every active member.
5. Show administration controls only when the resolved server permissions permit them; APIs remain protected independently.
6. Show current role and selected Collab in the sidebar.

### Phase D — validation, release, and cleanup

1. Add integration tests for cross-Collab isolation, Member denial, Co-admin limits, Admin-only actions, deactivation, and ownership transfer.
2. Run the full migration on a copy of production data and verify restore/rollback instructions.
3. Deploy the additive migration, validate production health and sample attendance records, then deploy the application transition.
4. Keep legacy `organizations`, `memberships`, and `invitations` tables read-only for one release window.
5. After a verified backup and explicit review, remove legacy tables in a separate migration.

## Commit boundaries

1. `feat: add collab tenancy schema and data migration`
2. `feat: enforce collab permissions across server routes`
3. `feat: add collab onboarding and member administration`
4. `test: cover collab authorization and migration flows`
5. `chore: remove legacy organization data model` — only after the verification window

## Definition of done

- A user can have zero, one, or many Collabs.
- A Collab has exactly one Admin and any number of Co-admins/Members.
- New invitees always join as Members.
- Every attendance record is isolated to one Collab.
- A user cannot access a Collab by guessing its ID.
- Permission enforcement is server-side and integration-tested.
- Existing data migrates without losing a time entry, break, membership, or invitation.
