import type { Config } from "@libsql/client";

export class ConfigurationError extends Error {
  constructor(public readonly code: "DATABASE_CONFIGURATION" | "AUTH_SECRET_CONFIGURATION", message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function databaseConfig(): Config {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (url && authToken) return { url, authToken };
  if (process.env.NODE_ENV !== "production") return { url: process.env.LOCAL_DATABASE_URL ?? "file:local.db" };
  throw new ConfigurationError("DATABASE_CONFIGURATION", "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.");
}

export function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-fallback-auth-secret-32-chars-minimum-key";
  throw new ConfigurationError("AUTH_SECRET_CONFIGURATION", "AUTH_SECRET must be set to a random value of at least 32 characters.");
}

export function validateRuntimeConfig() {
  databaseConfig();
  authSecret();
}
