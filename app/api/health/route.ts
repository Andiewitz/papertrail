import { validateRuntimeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    validateRuntimeConfig();
    const client = db();
    await client.execute("SELECT 1");
    const migrations = await client.execute("SELECT COUNT(*) AS count FROM schema_migrations");
    return NextResponse.json({ ok: true, database: "connected", migrations: Number(migrations.rows[0].count) });
  } catch (error) {
    logError("health_check_failed", error);
    return NextResponse.json({ ok: false, code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
