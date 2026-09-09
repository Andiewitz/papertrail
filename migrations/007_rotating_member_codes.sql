ALTER TABLE collab_invitations RENAME TO collab_invitations_legacy;

CREATE TABLE collab_invitations (
  id TEXT PRIMARY KEY,
  collab_id TEXT NOT NULL REFERENCES collabs(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_by_user_id TEXT REFERENCES users(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

-- Preserve audit history. Legacy URL tokens intentionally cannot be redeemed as six-character member codes.
INSERT INTO collab_invitations (id, collab_id, code_hash, expires_at, accepted_at, created_by_user_id, created_at)
SELECT id, collab_id, token_hash, expires_at, accepted_at, created_by_user_id, created_at
FROM collab_invitations_legacy;

DROP TABLE collab_invitations_legacy;

CREATE INDEX collab_invitations_collab_active_idx ON collab_invitations(collab_id) WHERE accepted_at IS NULL;
