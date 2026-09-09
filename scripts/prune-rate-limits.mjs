const production = process.env.NODE_ENV === "production";
const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (production && (!databaseUrl || !authToken)) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required for production cleanup.");

const config = databaseUrl && authToken
  ? { url: databaseUrl, authToken }
  : { url: process.env.LOCAL_DATABASE_URL ?? "file:local.db" };
const { createClient } = config.url.startsWith("file:")
  ? await import("@libsql/client")
  : await import("@libsql/client/web");
const client = createClient(config);

try {
  const result = await client.execute({ sql: "DELETE FROM rate_limits WHERE reset_at < ?", args: [Date.now()] });
  console.log(`Pruned ${result.rowsAffected} expired rate-limit records.`);
} finally {
  client.close();
}
