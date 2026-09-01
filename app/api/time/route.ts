import { assertSameOrigin, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Row } from "@libsql/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

function entry(row: Row) {
  return { id: Number(row.id), clockIn: Number(row.clock_in), clockOut: row.clock_out === null ? null : Number(row.clock_out) };
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const result = await (await db()).execute({ sql: "SELECT id, clock_in, clock_out FROM time_entries WHERE user_id = ? ORDER BY clock_in DESC LIMIT 90", args: [user.id] });
    const entries = result.rows.map(entry);
    return NextResponse.json({ entries, activeEntry: entries.find((item) => item.clockOut === null) ?? null });
  } catch (error) {
    console.error("Could not load time entries", error);
    return NextResponse.json({ error: "Your attendance records could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const input = z.object({ action: z.enum(["clock-in", "clock-out"]) }).strict().safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Choose either clock-in or clock-out." }, { status: 400 });
    const client = await db();
    const now = Date.now();

    if (input.data.action === "clock-in") {
      const existing = await client.execute({ sql: "SELECT id FROM time_entries WHERE user_id = ? AND clock_out IS NULL", args: [user.id] });
      if (existing.rows.length) return NextResponse.json({ error: "You are already clocked in." }, { status: 409 });
      const result = await client.execute({ sql: "INSERT INTO time_entries (user_id, clock_in, created_at) VALUES (?, ?, ?) RETURNING id, clock_in, clock_out", args: [user.id, now, now] });
      return NextResponse.json({ entry: entry(result.rows[0]) }, { status: 201 });
    }

    const result = await client.execute({ sql: "UPDATE time_entries SET clock_out = ? WHERE user_id = ? AND clock_out IS NULL RETURNING id, clock_in, clock_out", args: [now, user.id] });
    if (!result.rows[0]) return NextResponse.json({ error: "You are not currently clocked in." }, { status: 409 });
    return NextResponse.json({ entry: entry(result.rows[0]) });
  } catch (error) {
    console.error("Could not update time entry", error);
    return NextResponse.json({ error: "Your time entry could not be updated. Please try again." }, { status: 500 });
  }
}
