type Context = Record<string, boolean | number | string | undefined>;

export function logError(event: string, error: unknown, context: Context = {}) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ level: "error", event, message, ...context, timestamp: new Date().toISOString() }));
}
