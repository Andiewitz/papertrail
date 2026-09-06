import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logError } from "@/lib/log";
import { requireCollabPermission, CollabAccessError } from "@/lib/collab";
import type { Client, Row } from "@libsql/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

type Break = { id: number; startedAt: number; endedAt: number | null };
function entry(row: Row, breaks: Break[] = []) { return { id: Number(row.id), clockIn: Number(row.clock_in), clockOut: row.clock_out === null ? null : Number(row.clock_out), breaks }; }

async function withBreaks(client: Client, entryId: number) {
  const result = await client.execute({ sql: "SELECT id, clock_in, clock_out FROM time_entries WHERE id = ?", args: [entryId] });
  if (!result.rows[0]) return null;
  const breaks = await client.execute({ sql: "SELECT id, started_at, ended_at FROM break_entries WHERE time_entry_id = ? ORDER BY started_at", args: [entryId] });
  return entry(result.rows[0], breaks.rows.map((item) => ({ id: Number(item.id), startedAt: Number(item.started_at), endedAt: item.ended_at === null ? null : Number(item.ended_at) })));
}

async function allEntries(client: Client, userId: string, collabId: string) {
  const result = await client.execute({ sql: "SELECT id, clock_in, clock_out FROM time_entries WHERE user_id = ? AND collab_id = ? ORDER BY clock_in DESC LIMIT 90", args: [userId, collabId] });
  const entries = result.rows.map((row) => entry(row));
  if (!entries.length) return entries;
  const breaks = await client.execute({ sql: `SELECT id, time_entry_id, started_at, ended_at FROM break_entries WHERE time_entry_id IN (${entries.map(() => "?").join(", ")}) ORDER BY started_at`, args: entries.map((item) => item.id) });
  const byEntry = new Map<number, Break[]>();
  for (const item of breaks.rows) {
    const entryId = Number(item.time_entry_id);
    byEntry.set(entryId, [...(byEntry.get(entryId) ?? []), { id: Number(item.id), startedAt: Number(item.started_at), endedAt: item.ended_at === null ? null : Number(item.ended_at) }]);
  }
  return entries.map((item) => ({ ...item, breaks: byEntry.get(item.id) ?? [] }));
}

function collabIdFrom(request: Request) { return request.headers.get("x-papertrail-collab") ?? ""; }

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const collabId = collabIdFrom(request); if (!collabId) return NextResponse.json({ error: "Choose a Collab first." }, { status: 400 });
    await requireCollabPermission(user.id, collabId, "view_own_time");
    const entries = await allEntries(await db(), user.id, collabId);
    return NextResponse.json({ entries, activeEntry: entries.find((item) => item.clockOut === null) ?? null });
  } catch (error) {
    logError("time_entries_load_failed", error);
    if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "Your attendance records could not be loaded." }, { status: 500 });
  }
}

const schema = z.object({ action: z.enum(["clock-in", "clock-out", "break-start", "break-end"]), entryId: z.number().int().positive().optional() }).strict();

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const collabId = collabIdFrom(request); if (!collabId) return NextResponse.json({ error: "Choose a Collab first." }, { status: 400 });
    await requireCollabPermission(user.id, collabId, "clock_self");
    const input = schema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Choose a valid timekeeping action." }, { status: 400 });
    const client = await db(); const now = Date.now();
    if (input.data.action === "clock-in") {
      const active = await client.execute({ sql: "SELECT id FROM time_entries WHERE user_id = ? AND collab_id = ? AND clock_out IS NULL", args: [user.id, collabId] });
      if (active.rows[0]) return NextResponse.json({ entry: await withBreaks(client, Number(active.rows[0].id)), alreadyClockedIn: true });
      try {
        const result = await client.execute({ sql: "INSERT INTO time_entries (user_id, collab_id, clock_in, created_at) VALUES (?, ?, ?, ?) RETURNING id, clock_in, clock_out", args: [user.id, collabId, now, now] });
        return NextResponse.json({ entry: entry(result.rows[0]), alreadyClockedIn: false }, { status: 201 });
      } catch (error) {
        const active = await client.execute({ sql: "SELECT id FROM time_entries WHERE user_id = ? AND collab_id = ? AND clock_out IS NULL", args: [user.id, collabId] });
        if (active.rows[0]) return NextResponse.json({ entry: await withBreaks(client, Number(active.rows[0].id)), alreadyClockedIn: true });
        throw error;
      }
    }
    const active = await client.execute({ sql: "SELECT id FROM time_entries WHERE user_id = ? AND collab_id = ? AND clock_out IS NULL LIMIT 1", args: [user.id, collabId] });
    if (!active.rows[0]) {
      if (input.data.action === "clock-out" && input.data.entryId) {
        const completed = await client.execute({ sql: "SELECT id FROM time_entries WHERE id = ? AND user_id = ? AND collab_id = ? AND clock_out IS NOT NULL", args: [input.data.entryId, user.id, collabId] });
        if (completed.rows[0]) return NextResponse.json({ entry: await withBreaks(client, Number(completed.rows[0].id)), alreadyClockedOut: true });
      }
      return NextResponse.json({ error: input.data.action === "break-end" ? "You are not currently on a break." : "You are not currently clocked in." }, { status: 409 });
    }
    const activeId = Number(active.rows[0].id);
    const openBreak = await client.execute({ sql: "SELECT id FROM break_entries WHERE time_entry_id = ? AND ended_at IS NULL LIMIT 1", args: [activeId] });
    if (input.data.action === "break-start") {
      if (openBreak.rows[0]) return NextResponse.json({ entry: await withBreaks(client, activeId), alreadyOnBreak: true });
      await client.execute({ sql: "INSERT INTO break_entries (time_entry_id, started_at, created_at) VALUES (?, ?, ?)", args: [activeId, now, now] });
      return NextResponse.json({ entry: await withBreaks(client, activeId), alreadyOnBreak: false }, { status: 201 });
    }
    if (input.data.action === "break-end") {
      if (!openBreak.rows[0]) return NextResponse.json({ error: "You are not currently on a break." }, { status: 409 });
      await client.execute({ sql: "UPDATE break_entries SET ended_at = ? WHERE id = ? AND ended_at IS NULL", args: [now, Number(openBreak.rows[0].id)] });
      return NextResponse.json({ entry: await withBreaks(client, activeId), alreadyEndedBreak: false });
    }
    if (openBreak.rows[0]) return NextResponse.json({ error: "End your active break before clocking out." }, { status: 409 });
    await client.execute({ sql: "UPDATE time_entries SET clock_out = ? WHERE id = ? AND clock_out IS NULL", args: [now, activeId] });
    return NextResponse.json({ entry: await withBreaks(client, activeId), alreadyClockedOut: false });
  } catch (error) {
    logError("time_entry_update_failed", error);
    if (error instanceof CollabAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "Your time entry could not be updated. Please try again." }, { status: 500 });
  }
}
