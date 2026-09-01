import { createClient } from "@libsql/client";

let initialized = false;

function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.");
  return createClient({ url, authToken });
}

export async function db() {
  const client = getClient();
  if (!initialized) {
    await client.batch([
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)",
      "CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id)",
    ], "write");
    initialized = true;
  }
  return client;
}
