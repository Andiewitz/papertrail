import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(root, "migrations");
const production = process.env.NODE_ENV === "production";
const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (production && (!databaseUrl || !authToken)) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required for production migrations.");

const config = databaseUrl && authToken
  ? { url: databaseUrl, authToken }
  : { url: process.env.LOCAL_DATABASE_URL ?? "file:local.db" };
const { createClient } = config.url.startsWith("file:")
  ? await import("@libsql/client")
  : await import("@libsql/client/web");
const client = createClient(config);

try {
  await client.execute("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = await client.execute("SELECT id FROM schema_migrations");
  const appliedIds = new Set(applied.rows.map((row) => String(row.id)));
  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (appliedIds.has(file)) continue;
    const sql = await readFile(path.join(migrationDirectory, file), "utf8");
    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
    await client.batch([
      ...statements.map((statement) => ({ sql: statement, args: [] })),
      { sql: "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", args: [file, Date.now()] },
    ], "write");
    console.log(`Applied ${file}`);
  }

  if (files.includes("004_collab_tenancy.sql")) {
    const unmappedEntries = await client.execute("SELECT COUNT(*) AS count FROM time_entries WHERE collab_id IS NULL");
    if (Number(unmappedEntries.rows[0].count) > 0) {
      throw new Error("Collab migration left time entries without a collab_id. Restore the pre-migration backup and investigate before deploying the application transition.");
    }
    const invalidCollabs = await client.execute("SELECT COUNT(*) AS count FROM collab_memberships WHERE role = 'admin' GROUP BY collab_id HAVING COUNT(*) <> 1");
    if (invalidCollabs.rows.length > 0) throw new Error("Collab migration did not produce exactly one admin per collab.");
  }

  if (process.argv.includes("--status")) {
    const result = await client.execute("SELECT id, applied_at FROM schema_migrations ORDER BY id");
    for (const row of result.rows) console.log(`${row.id}\t${new Date(Number(row.applied_at)).toISOString()}`);
  }
} finally {
  client.close();
}
