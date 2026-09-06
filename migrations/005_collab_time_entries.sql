DROP INDEX IF EXISTS time_entries_one_open_shift_idx;
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_shift_per_collab_idx ON time_entries(collab_id, user_id) WHERE clock_out IS NULL;
