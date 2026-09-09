"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/client/dashboard-shell";
import Link from "next/link";

type Break = { id: number; startedAt: number; endedAt: number | null };
type TimeEntry = { id: number; clockIn: number; clockOut: number | null; breaks: Break[] };

function duration(entry: TimeEntry, now: number) {
  const breakTime = entry.breaks.reduce((total, item) => total + Math.max(0, (item.endedAt ?? now) - item.startedAt), 0);
  return Math.max(0, (entry.clockOut ?? now) - entry.clockIn - breakTime);
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default function TimeHistoryPage({ collabId }: { collabId: string }) {
  const { collabs, loading: collabsLoading, requireSignIn } = useDashboard();
  const collab = collabs.find((item) => item.id === collabId);
  const canTrackTime = collab?.role === "member" || collab?.role === "co_admin";
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (!canTrackTime) return;
      const response = await fetch(`/api/collabs/${collabId}/time`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { requireSignIn(); return; }
      if (!response.ok) throw new Error(data.error ?? "Your time history could not be loaded.");
      setEntries(data.entries);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your time history could not be loaded."); }
    finally { setLoading(false); }
  }, [canTrackTime, collabId, requireSignIn]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const days = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return entries.reduce<{ key: string; label: string; entries: TimeEntry[]; total: number }[]>((result, entry) => {
      const date = new Date(entry.clockIn);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const latest = result.at(-1);
      if (latest?.key === key) { latest.entries.push(entry); latest.total += duration(entry, now); }
      else result.push({ key, label: formatter.format(date), entries: [entry], total: duration(entry, now) });
      return result;
    }, []);
  }, [entries, now]);

  if (collabsLoading) return <p role="status">Loading Collab…</p>;
  if (!canTrackTime) return <section className="history-card"><h2>Time history unavailable</h2><p>Personal time history is available to Members and Co-admins within their Collab.</p><Link href={collab ? `/collabs/${collabId}` : "/"}>Back</Link></section>;

  return <section className="collab-history-page"><header className="time-history-header"><Link className="history-back" href={`/collabs/${collabId}`}>← {collab?.name}</Link><div><p className="section-kicker">Attendance</p><h1>Time history</h1><p>Every recorded shift, organized by day.</p></div><button onClick={() => void load()} type="button">Refresh</button></header>{error && <p className="history-error" role="alert">{error}</p>}{loading ? <p className="time-history-loading">Loading entries…</p> : days.length === 0 ? <section className="time-history-empty"><h2>No time entries yet</h2><p>Your completed shifts will be shown here by day.</p><Link href={`/collabs/${collabId}`}>Back to Collab</Link></section> : <div className="history-day-list">{days.map((day) => <section className="history-day-card" key={day.key}><header><div><h2>{day.label}</h2><span>{day.entries.length} {day.entries.length === 1 ? "shift" : "shifts"}</span></div><strong>{formatDuration(day.total)} <small>paid</small></strong></header><div className="history-day-table" role="region" aria-label={`${day.label} time entries`} tabIndex={0}><table><thead><tr><th>Clock in</th><th>Clock out</th><th>Breaks</th><th>Paid time</th><th>Status</th></tr></thead><tbody>{day.entries.map((entry) => <tr key={entry.id}><td>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockIn))}</td><td>{entry.clockOut ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockOut)) : "—"}</td><td>{entry.breaks.length ? formatDuration(entry.breaks.reduce((total, item) => total + Math.max(0, (item.endedAt ?? now) - item.startedAt), 0)) : "—"}</td><td>{formatDuration(duration(entry, now))}</td><td><span className={entry.clockOut ? "entry-complete" : "entry-active"}>{entry.clockOut ? "Completed" : "In progress"}</span></td></tr>)}</tbody></table></div></section>)}</div>}</section>;
}
