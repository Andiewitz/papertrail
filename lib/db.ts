import type { Client } from "@libsql/client/web";
import { databaseConfig } from "@/lib/config";

let client: Client | undefined;

export async function db() {
  if (client) return client;
  const config = databaseConfig();
  if (config.url.startsWith("file:")) {
    const { createClient } = await import("@libsql/client");
    client = createClient(config);
  } else {
    const { createClient } = await import("@libsql/client/web");
    client = createClient(config);
  }
  return client;
}
