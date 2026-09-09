import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import type { Row } from "@libsql/client";

export const runtime = "nodejs";

const LOOKBACK_DAYS = 28;
const DAY_MS = 1000 * 60 * 60 * 24;

type Entry = { clockIn: number; clockOut: number | null; breakMs: number; collabName: string };

function dayKey(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function requestedTimeZone(request: Request) {
  const value = new URL(request.url).searchParams.get("timeZone") ?? "UTC";
  if (value.length > 100) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

function toEntry(row: Row): Entry {
  return {
    clockIn: Number(row.clock_in),
    clockOut: row.clock_out === null ? null : Number(row.clock_out),
    breakMs: Number(row.break_ms),
    collabName: String(row.collab_name),
  };
}

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const now = Date.now();
    const since = now - LOOKBACK_DAYS * DAY_MS;
    const result = await (await db()).execute({
      sql: `SELECT time_entries.clock_in, time_entries.clock_out, collabs.name AS collab_name,
              COALESCE(SUM(CASE
                WHEN break_entries.id IS NULL THEN 0
                WHEN break_entries.ended_at IS NULL THEN ? - break_entries.started_at
                ELSE break_entries.ended_at - break_entries.started_at
              END), 0) AS break_ms
            FROM time_entries
            JOIN collabs ON collabs.id = time_entries.collab_id
            LEFT JOIN break_entries ON break_entries.time_entry_id = time_entries.id
            WHERE time_entries.user_id = ? AND (time_entries.clock_out IS NULL OR time_entries.clock_in >= ?)
            GROUP BY time_entries.id
            ORDER BY time_entries.clock_in DESC`,
      args: [now, user.id, since],
    });
    const timeZone = requestedTimeZone(request);
    const entries = result.rows.map(toEntry);
    const duration = (entry: Entry) => Math.max(0, (entry.clockOut ?? now) - entry.clockIn - entry.breakMs);
    const recent = entries.filter((entry) => entry.clockIn >= since);
    const paidTime = recent.reduce((total, entry) => total + duration(entry), 0);
    const workedDays = new Set(recent.map((entry) => dayKey(entry.clockIn, timeZone)));
    const active = entries.find((entry) => entry.clockOut === null) ?? null;

    return NextResponse.json({
      averageDailyMs: workedDays.size ? Math.round(paidTime / workedDays.size) : 0,
      daysWorked: workedDays.size,
      lastSevenDaysMs: recent.filter((entry) => entry.clockIn >= now - 7 * DAY_MS).reduce((total, entry) => total + duration(entry), 0),
      completedShifts: recent.filter((entry) => entry.clockOut !== null).length,
      activeEntry: active ? { collabName: active.collabName, clockIn: active.clockIn } : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("dashboard_summary_load_failed", error);
    const debug = process.env.NODE_ENV !== "production" && error instanceof Error ? { debug: error.message } : {};
    return NextResponse.json({ error: "Your work snapshot could not be loaded.", code: "DASHBOARD_SUMMARY_LOAD_FAILED", ...debug }, { status: 500 });
  }
}
