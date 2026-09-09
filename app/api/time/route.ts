import { assertSameOrigin, currentCollabUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { CollabAccessError } from "@/lib/collab";
import type { Client, Row } from "@libsql/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

type Break = { id: number; startedAt: number; endedAt: number | null };
function entry(row: Row, breaks: Break[] = []) { return { id: Number(row.id), clockIn: Number(row.clock_in), clockOut: row.clock_out === null ? null : Number(row.clock_out), breaks }; }

async function withBreaks(client: Client, entryId: number) {
  const result = await client.execute({ sql: "SELECT time_entries.id, time_entries.clock_in, time_entries.clock_out, break_entries.id AS break_id, break_entries.started_at AS break_started_at, break_entries.ended_at AS break_ended_at FROM time_entries LEFT JOIN break_entries ON break_entries.time_entry_id = time_entries.id WHERE time_entries.id = ? ORDER BY break_entries.started_at", args: [entryId] });
  const first = result.rows[0];
  if (!first) return null;
  return entry(first, result.rows.filter((row) => row.break_id !== null).map((row) => ({ id: Number(row.break_id), startedAt: Number(row.break_started_at), endedAt: row.break_ended_at === null ? null : Number(row.break_ended_at) })));
}

async function allEntries(client: Client, userId: string, collabId: string) {
  const result = await client.execute({ sql: "SELECT time_entries.id, time_entries.clock_in, time_entries.clock_out, break_entries.id AS break_id, break_entries.started_at AS break_started_at, break_entries.ended_at AS break_ended_at FROM time_entries LEFT JOIN break_entries ON break_entries.time_entry_id = time_entries.id WHERE time_entries.user_id = ? AND time_entries.collab_id = ? AND time_entries.id IN (SELECT id FROM time_entries WHERE user_id = ? AND collab_id = ? ORDER BY clock_in DESC LIMIT 90) ORDER BY time_entries.clock_in DESC, break_entries.started_at", args: [userId, collabId, userId, collabId] });
  const grouped = new Map<number, { id: number; clockIn: number; clockOut: number | null; breaks: Break[] }>();
  for (const row of result.rows) {
    const id = Number(row.id);
    const item = grouped.get(id) ?? entry(row);
    if (row.break_id !== null) item.breaks.push({ id: Number(row.break_id), startedAt: Number(row.break_started_at), endedAt: row.break_ended_at === null ? null : Number(row.break_ended_at) });
    grouped.set(id, item);
  }
  return [...grouped.values()];
}

function collabIdFrom(request: Request) { return request.headers.get("x-papertrail-collab") ?? ""; }

export async function GET(request: Request) {
  try {
    const collabId = collabIdFrom(request); if (!collabId) return NextResponse.json({ error: "Choose a Collab first." }, { status: 400 });
    const user = await currentCollabUser(collabId, "view_own_time");
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const entries = await allEntries(await db(), user.id, collabId);
    return NextResponse.json({ entries, activeEntry: entries.find((item) => item.clockOut === null) ?? null });
  } catch (error) {
    logError("time_entries_load_failed", error);
    if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    const debug = process.env.NODE_ENV !== "production" && error instanceof Error ? { debug: error.message } : {};
    return NextResponse.json({ error: "Your attendance records could not be loaded.", code: "TIME_ENTRIES_LOAD_FAILED", ...debug }, { status: 500 });
  }
}

const schema = z.object({ action: z.enum(["clock-in", "clock-out", "break-start", "break-end"]), entryId: z.number().int().positive().optional() }).strict();

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const collabId = collabIdFrom(request); if (!collabId) return NextResponse.json({ error: "Choose a Collab first." }, { status: 400 });
    const user = await currentCollabUser(collabId, "clock_self");
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const input = schema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Choose a valid timekeeping action." }, { status: 400 });
    const client = await db(); const now = Date.now();
    const activeEntry = async () => {
      const result = await client.execute({ sql: "SELECT id FROM time_entries WHERE user_id = ? AND collab_id = ? AND clock_out IS NULL LIMIT 1", args: [user.id, collabId] });
      return result.rows[0] ? Number(result.rows[0].id) : null;
    };

    if (input.data.action === "clock-in") {
      let clockInError: unknown;
      try {
        const result = await client.execute({
          sql: "INSERT INTO time_entries (user_id, collab_id, clock_in, created_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM time_entries WHERE user_id = ? AND collab_id = ? AND clock_out IS NULL) RETURNING id, clock_in, clock_out",
          args: [user.id, collabId, now, now, user.id, collabId],
        });
        if (result.rows[0]) return NextResponse.json({ entry: entry(result.rows[0]), alreadyClockedIn: false }, { status: 201 });
      } catch (error) {
        // A concurrent clock-in can still hit the database uniqueness constraint.
        // Resolve it below as the idempotent success response.
        clockInError = error;
      }
      const activeId = await activeEntry();
      if (activeId) return NextResponse.json({ entry: await withBreaks(client, activeId), alreadyClockedIn: true });
      if (clockInError) throw clockInError;
      throw new Error("Clock-in was not created and no active entry was found.");
    }

    if (input.data.action === "break-start") {
      const result = await client.execute({
        sql: "INSERT INTO break_entries (time_entry_id, started_at, created_at) SELECT id, ?, ? FROM time_entries WHERE user_id = ? AND collab_id = ? AND clock_out IS NULL AND NOT EXISTS (SELECT 1 FROM break_entries WHERE time_entry_id = time_entries.id AND ended_at IS NULL) RETURNING id, time_entry_id, started_at, ended_at",
        args: [now, now, user.id, collabId],
      });
      if (result.rows[0]) {
        return NextResponse.json({ entryId: Number(result.rows[0].time_entry_id), break: { id: Number(result.rows[0].id), startedAt: Number(result.rows[0].started_at), endedAt: null }, alreadyOnBreak: false }, { status: 201 });
      }
      const activeId = await activeEntry();
      if (!activeId) return NextResponse.json({ error: "You are not currently clocked in." }, { status: 409 });
      const active = await withBreaks(client, activeId);
      if (active?.breaks.some((item) => item.endedAt === null)) return NextResponse.json({ entry: active, alreadyOnBreak: true });
      return NextResponse.json({ error: "Your break could not be started. Please try again." }, { status: 409 });
    }

    if (input.data.action === "break-end") {
      const result = await client.execute({
        sql: "UPDATE break_entries SET ended_at = ? WHERE id = (SELECT break_entries.id FROM break_entries JOIN time_entries ON time_entries.id = break_entries.time_entry_id WHERE time_entries.user_id = ? AND time_entries.collab_id = ? AND time_entries.clock_out IS NULL AND break_entries.ended_at IS NULL LIMIT 1) AND ended_at IS NULL RETURNING id, time_entry_id, started_at, ended_at",
        args: [now, user.id, collabId],
      });
      if (result.rows[0]) {
        return NextResponse.json({ entryId: Number(result.rows[0].time_entry_id), break: { id: Number(result.rows[0].id), startedAt: Number(result.rows[0].started_at), endedAt: Number(result.rows[0].ended_at) }, alreadyEndedBreak: false });
      }
      return NextResponse.json({ error: "You are not currently on a break." }, { status: 409 });
    }

    const result = await client.execute({
      sql: "UPDATE time_entries SET clock_out = ? WHERE user_id = ? AND collab_id = ? AND clock_out IS NULL AND NOT EXISTS (SELECT 1 FROM break_entries WHERE time_entry_id = time_entries.id AND ended_at IS NULL) RETURNING id, clock_in, clock_out",
      args: [now, user.id, collabId],
    });
    if (result.rows[0]) {
      return NextResponse.json({ entry: entry(result.rows[0]), alreadyClockedOut: false });
    }

    const activeId = await activeEntry();
    if (activeId) {
      const openBreak = await client.execute({ sql: "SELECT id FROM break_entries WHERE time_entry_id = ? AND ended_at IS NULL LIMIT 1", args: [activeId] });
      if (openBreak.rows[0]) return NextResponse.json({ error: "End your active break before clocking out." }, { status: 409 });
      return NextResponse.json({ error: "Your clock-out could not be completed. Please try again." }, { status: 409 });
    }
    if (input.data.entryId) {
      const completed = await client.execute({ sql: "SELECT id FROM time_entries WHERE id = ? AND user_id = ? AND collab_id = ? AND clock_out IS NOT NULL", args: [input.data.entryId, user.id, collabId] });
      if (completed.rows[0]) return NextResponse.json({ entry: await withBreaks(client, Number(completed.rows[0].id)), alreadyClockedOut: true });
    }
    return NextResponse.json({ error: "You are not currently clocked in." }, { status: 409 });
  } catch (error) {
    logError("time_entry_update_failed", error);
    if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    const debug = process.env.NODE_ENV !== "production" && error instanceof Error ? { debug: error.message } : {};
    return NextResponse.json({ error: "Your time entry could not be updated. Please try again.", code: "TIME_ENTRY_UPDATE_FAILED", ...debug }, { status: 500 });
  }
}
