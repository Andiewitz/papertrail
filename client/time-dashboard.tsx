"use client";

import { useEffect, useMemo, useState } from "react";
import AuthForm from "@/client/auth-form";

type User = { id: string; email: string };
type TimeEntry = { id: number; clockIn: number; clockOut: number | null };
type Notice = { type: "error" | "success"; text: string } | null;

function Icon({ name }: { name: "clock" | "calendar" | "logout" | "check" | "briefcase" | "panel" }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
    calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></>,
    check: <path d="m5 12 4 4 10-10" />,
    briefcase: <><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M9 7V5h6v2M4 12h16M10 12v2h4v-2" /></>,
    panel: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16M13 9l-3 3 3 3" /></>,
  };
  return <svg aria-hidden="true" className="time-icon" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function toDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

export default function TimeDashboard() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<Notice>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  async function loadEntries() {
    setLoading(true);
    try {
      const response = await fetch("/api/time", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { setUser(null); return; }
      if (!response.ok) throw new Error(data.error ?? "Attendance records could not be loaded.");
      setEntries(data.entries);
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Attendance records could not be loaded." }); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(); setUser(data.user); })
      .catch(() => setUser(null));
  }, []);

  useEffect(() => { if (user) void loadEntries(); }, [user]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setSidebarCollapsed(window.localStorage.getItem("papertrail-sidebar") === "collapsed"); }, []);

  const activeEntry = entries.find((entry) => entry.clockOut === null) ?? null;
  const metrics = useMemo(() => {
    const today = new Date(now);
    const weekStart = startOfWeek(today).getTime();
    const month = today.getMonth();
    const year = today.getFullYear();
    const duration = (entry: TimeEntry) => (entry.clockOut ?? now) - entry.clockIn;
    return {
      today: entries.filter((entry) => sameDay(new Date(entry.clockIn), today)).reduce((total, entry) => total + duration(entry), 0),
      week: entries.filter((entry) => entry.clockIn >= weekStart).reduce((total, entry) => total + duration(entry), 0),
      month: entries.filter((entry) => { const date = new Date(entry.clockIn); return date.getMonth() === month && date.getFullYear() === year; }).reduce((total, entry) => total + duration(entry), 0),
    };
  }, [entries, now]);

  async function updateClock() {
    const action = activeEntry ? "clock-out" : "clock-in";
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/time", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (response.status === 401) { setUser(null); return; }
      if (!response.ok) throw new Error(data.error ?? "Your time entry could not be updated.");
      setEntries((current) => action === "clock-in" ? [data.entry, ...current] : current.map((entry) => entry.id === data.entry.id ? data.entry : entry));
      setNow(Date.now());
      setNotice({ type: "success", text: action === "clock-in" ? "You’re clocked in. Have a great shift." : "You’re clocked out. Your hours have been recorded." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Your time entry could not be updated." }); }
    finally { setBusy(false); }
  }

  async function signOut() {
    const response = await fetch("/api/auth/sign-out", { method: "POST" });
    if (response.ok) setUser(null);
    else setNotice({ type: "error", text: "We couldn’t sign you out. Please try again." });
  }

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      window.localStorage.setItem("papertrail-sidebar", collapsed ? "expanded" : "collapsed");
      return !collapsed;
    });
  }

  if (user === undefined) return <main className="time-loading"><span className="brand-mark"><i /><i /><i /></span><p>Loading your timecard…</p></main>;
  if (!user) return <AuthForm onAuthenticated={setUser} />;

  const employeeName = user.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const currentDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(now));

  return <main className="time-app">
    <div className={`time-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="time-sidebar">
        <div className="sidebar-brand-row"><div className="brand"><span className="brand-mark"><i /><i /><i /></span><span className="brand-label">Papertrail</span></div><button aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} type="button"><Icon name="panel" /></button></div>
        <div className="employee-summary"><span>{user.email[0].toUpperCase()}</span><div className="employee-copy"><strong>{employeeName}</strong><small>Employee portal</small></div></div>
        <nav aria-label="Employee navigation"><a className="time-nav active" href="#dashboard" title="Dashboard"><Icon name="briefcase" /><span className="nav-label">Dashboard</span></a><a className="time-nav" href="#history" title="Time history"><Icon name="calendar" /><span className="nav-label">Time history</span></a></nav>
        <div className="time-sidebar-footer"><p><Icon name="clock" /><span className="sidebar-security">Time entries are recorded securely.</span></p><button onClick={() => void signOut()} title="Sign out" type="button"><Icon name="logout" /><span className="logout-label">Sign out</span></button></div>
      </aside>
      <section className="time-workspace" id="dashboard">
        <header className="time-header"><div><p>{currentDate}</p><h1>Welcome back, {employeeName}.</h1></div><div className="status-chip"><span className={activeEntry ? "online" : "offline"} />{activeEntry ? "Clocked in" : "Clocked out"}</div></header>
        {notice && <div className={`time-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}><span>{notice.type === "success" ? <Icon name="check" /> : "!"}</span>{notice.text}<button aria-label="Dismiss" onClick={() => setNotice(null)} type="button">×</button></div>}
        <section className="clock-card"><div className="clock-card-copy"><p className="section-kicker">Today’s time</p><h2>{activeEntry ? "Your shift is in progress" : "Ready when you are"}</h2><p>{activeEntry ? `Clocked in at ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(activeEntry.clockIn))}` : "Clock in when you begin work. Your current time is recorded automatically."}</p>{activeEntry && <strong>{toDuration(now - activeEntry.clockIn)} <small>this shift</small></strong>}</div><button className={`clock-button ${activeEntry ? "clock-out" : "clock-in"}`} disabled={busy} onClick={() => void updateClock()} type="button"><Icon name="clock" />{busy ? "Updating…" : activeEntry ? "Clock out" : "Clock in"}</button></section>
        <section className="time-metrics" aria-label="Hours summary"><article><span><Icon name="clock" /></span><p>Today</p><strong>{toDuration(metrics.today)}</strong><small>{activeEntry ? "Currently working" : "No active shift"}</small></article><article><span><Icon name="calendar" /></span><p>This week</p><strong>{toDuration(metrics.week)}</strong><small>Monday to today</small></article><article><span><Icon name="briefcase" /></span><p>This month</p><strong>{toDuration(metrics.month)}</strong><small>All recorded shifts</small></article></section>
        <section className="history-card" id="history"><div className="history-heading"><div><p className="section-kicker">Attendance</p><h2>Recent time entries</h2></div><button onClick={() => void loadEntries()} type="button">Refresh</button></div>{loading ? <div className="history-loading"><i /><i /><i /></div> : entries.length === 0 ? <div className="no-entries"><Icon name="calendar" /><h3>No time entries yet</h3><p>Your clock-ins and clock-outs will appear here.</p></div> : <div className="history-table" role="region" aria-label="Recent time entries" tabIndex={0}><table><thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Total</th><th>Status</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(entry.clockIn))}</td><td>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockIn))}</td><td>{entry.clockOut ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockOut)) : "—"}</td><td>{toDuration((entry.clockOut ?? now) - entry.clockIn)}</td><td><span className={entry.clockOut ? "entry-complete" : "entry-active"}>{entry.clockOut ? "Completed" : "In progress"}</span></td></tr>)}</tbody></table></div>}</section>
      </section>
    </div>
  </main>;
}
