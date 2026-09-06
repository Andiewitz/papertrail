CREATE TABLE IF NOT EXISTS break_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_entry_id INTEGER NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS break_entries_time_entry_idx ON break_entries(time_entry_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS break_entries_one_open_break_idx ON break_entries(time_entry_id) WHERE ended_at IS NULL;
