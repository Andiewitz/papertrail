import { createClient, type Client } from "@libsql/client";
import { databaseConfig } from "@/lib/config";

let client: Client | undefined;

export function db() {
  if (!client) client = createClient(databaseConfig());
  return client;
}
