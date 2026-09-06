CREATE TABLE IF NOT EXISTS collabs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collab_memberships (
  collab_id TEXT NOT NULL REFERENCES collabs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'co_admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (collab_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS collab_memberships_one_admin_idx ON collab_memberships(collab_id) WHERE role = 'admin';
CREATE INDEX IF NOT EXISTS collab_memberships_user_id_idx ON collab_memberships(user_id);
CREATE INDEX IF NOT EXISTS collab_memberships_collab_status_idx ON collab_memberships(collab_id, status);

CREATE TABLE IF NOT EXISTS collab_invitations (
  id TEXT PRIMARY KEY,
  collab_id TEXT NOT NULL REFERENCES collabs(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS collab_invitations_collab_email_idx ON collab_invitations(collab_id, email);

INSERT OR IGNORE INTO collabs (id, name, created_by_user_id, created_at)
SELECT organizations.id, organizations.name, memberships.user_id, organizations.created_at
FROM organizations
JOIN memberships ON memberships.organization_id = organizations.id AND memberships.role = 'admin'
WHERE memberships.status = 'active';

INSERT OR IGNORE INTO collab_memberships (collab_id, user_id, role, status, created_at)
SELECT organization_id, user_id,
  CASE role WHEN 'admin' THEN 'admin' WHEN 'manager' THEN 'co_admin' ELSE 'member' END,
  status,
  created_at
FROM memberships
WHERE organization_id IN (SELECT id FROM collabs);

INSERT OR IGNORE INTO collab_invitations (id, collab_id, email, token_hash, expires_at, accepted_at, created_by_user_id, created_at)
SELECT id, organization_id, email, token_hash, expires_at, accepted_at, created_by_user_id, created_at
FROM invitations
WHERE organization_id IN (SELECT id FROM collabs);

ALTER TABLE time_entries ADD COLUMN collab_id TEXT REFERENCES collabs(id);

UPDATE time_entries
SET collab_id = COALESCE(
  (SELECT active_organization_id FROM users WHERE users.id = time_entries.user_id),
  (SELECT organization_id FROM memberships WHERE memberships.user_id = time_entries.user_id ORDER BY created_at ASC LIMIT 1)
)
WHERE collab_id IS NULL;

CREATE INDEX IF NOT EXISTS time_entries_collab_user_clock_in_idx ON time_entries(collab_id, user_id, clock_in DESC);
