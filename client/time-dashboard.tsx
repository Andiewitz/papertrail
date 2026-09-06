"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import AuthForm from "@/client/auth-form";

type User = { id: string; email: string };
type Collab = { id: string; name: string; role: "admin" | "co_admin" | "member" };
type Break = { id: number; startedAt: number; endedAt: number | null };
type TimeEntry = { id: number; clockIn: number; clockOut: number | null; breaks: Break[] };
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

function paidDuration(entry: TimeEntry, currentTime: number) {
  const breaks = entry.breaks.reduce((total, item) => total + Math.max(0, (item.endedAt ?? currentTime) - item.startedAt), 0);
  return Math.max(0, (entry.clockOut ?? currentTime) - entry.clockIn - breaks);
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

export default function TimeDashboard({ collabId }: { collabId: string }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [collabs, setCollabs] = useState<Collab[] | undefined>(undefined);
  const [selectedCollab, setSelectedCollab] = useState<Collab | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [members, setMembers] = useState<{ id: string; email: string; role: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<Notice>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 };

  async function loadEntries() {
    setLoading(true);
    try {
      if (!selectedCollab) return;
      const response = await fetch(`/api/collabs/${selectedCollab.id}/time`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { setUser(null); return; }
      if (!response.ok) throw new Error(`${data.error ?? "Attendance records could not be loaded."}${data.debug ? ` (${data.debug})` : ""}`);
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
  useEffect(() => {
    if (!user) return;
    void fetch("/api/collabs", { cache: "no-store" }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const next = data.collabs as Collab[]; setCollabs(next);
      const selected = next.find((collab) => collab.id === collabId) ?? null;
      setSelectedCollab(selected); if (selected) window.localStorage.setItem("papertrail-collab", selected.id);
    }).catch((error) => { setCollabs([]); setNotice({ type: "error", text: error instanceof Error ? error.message : "Your Collabs could not be loaded." }); });
  }, [user, collabId]);
  useEffect(() => {
    if (!collabs?.length || !selectedCollab || selectedCollab.id === collabId) return;
    setSelectedCollab(collabs.find((collab) => collab.id === collabId) ?? null);
  }, [collabs, selectedCollab, collabId]);
  useEffect(() => { if (user && selectedCollab) void loadEntries(); }, [user, selectedCollab]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setSidebarCollapsed(window.localStorage.getItem("papertrail-sidebar") === "collapsed"); }, []);

  const activeEntry = entries.find((entry) => entry.clockOut === null) ?? null;
  const activeBreak = activeEntry?.breaks.find((item) => item.endedAt === null) ?? null;
  const metrics = useMemo(() => {
    const today = new Date(now);
    const weekStart = startOfWeek(today).getTime();
    const month = today.getMonth();
    const year = today.getFullYear();
    const duration = (entry: TimeEntry) => paidDuration(entry, now);
    return {
      today: entries.filter((entry) => sameDay(new Date(entry.clockIn), today)).reduce((total, entry) => total + duration(entry), 0),
      week: entries.filter((entry) => entry.clockIn >= weekStart).reduce((total, entry) => total + duration(entry), 0),
      month: entries.filter((entry) => { const date = new Date(entry.clockIn); return date.getMonth() === month && date.getFullYear() === year; }).reduce((total, entry) => total + duration(entry), 0),
    };
  }, [entries, now]);
  const historyDays = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
    return entries.reduce<{ label: string; key: string; entries: TimeEntry[]; total: number }[]>((days, entry) => {
      const date = new Date(entry.clockIn);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const current = days.at(-1);
      if (current?.key === key) { current.entries.push(entry); current.total += paidDuration(entry, now); }
      else days.push({ key, label: formatter.format(date), entries: [entry], total: paidDuration(entry, now) });
      return days;
    }, []);
  }, [entries, now]);

  async function updateClock() {
    const action = activeEntry ? "clock-out" : "clock-in";
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/collabs/${selectedCollab?.id}/time`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(activeEntry ? { entryId: activeEntry.id } : {}) }) });
      const data = await response.json();
      if (response.status === 401) { setUser(null); return; }
      if (!response.ok) {
        if (response.status === 409) void loadEntries();
        throw new Error(data.error ?? "Your time entry could not be updated.");
      }
      setEntries((current) => {
        const withoutUpdatedEntry = current.filter((entry) => entry.id !== data.entry.id);
        return action === "clock-in" ? [data.entry, ...withoutUpdatedEntry] : [...withoutUpdatedEntry, data.entry].sort((left, right) => right.clockIn - left.clockIn);
      });
      setNow(Date.now());
      setNotice({ type: "success", text: action === "clock-in" ? data.alreadyClockedIn ? "Your active shift is already recorded." : "You’re clocked in. Have a great shift." : data.alreadyClockedOut ? "Your clock-out was already recorded." : "You’re clocked out. Your hours have been recorded." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Your time entry could not be updated." }); }
    finally { setBusy(false); }
  }

  async function updateBreak() {
    if (!activeEntry) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/collabs/${selectedCollab?.id}/time`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: activeBreak ? "break-end" : "break-start" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your break could not be updated.");
      setEntries((current) => current.map((item) => item.id === data.entry.id ? data.entry : item));
      setNow(Date.now());
      setNotice({ type: "success", text: activeBreak ? "Your break has ended. You’re back on the clock." : "Your break has started. Paid time is paused." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Your break could not be updated." }); }
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

  async function openMembers() { setMembersOpen(true); try { const response = await fetch(`/api/collabs/${collabId}/members`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setMembers(data.members); } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Members could not be loaded." }); } }

  if (user === undefined || (user && collabs === undefined)) return <main className="time-loading"><span className="brand-mark"><i /><i /><i /></span><p>Loading your timecard…</p></main>;
  if (!user) return <AuthForm onAuthenticated={setUser} />;
  if (!selectedCollab) return <main className="time-loading"><div className="auth-card"><p className="section-kicker">Collab unavailable</p><h2>You don’t have access to this Collab.</h2><Link className="auth-submit" href="/">Back to your Collabs</Link></div></main>;

  const employeeName = user.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const currentDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(now));

  return <main className="time-app">
    <div className={`time-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="time-sidebar">
        <div className="sidebar-brand-row"><div className="brand"><span className="brand-mark"><i /><i /><i /></span><span className="brand-label">Papertrail</span></div><button aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} type="button"><Icon name="panel" /></button></div>
        <div className="employee-summary"><span>{user.email[0].toUpperCase()}</span><div className="employee-copy"><strong>{employeeName}</strong><small>{selectedCollab.name} · {selectedCollab.role.replace("_", "-")}</small></div></div><Link className="collab-back" href="/">← All Collabs</Link>
        <nav aria-label="Employee navigation"><Link className="time-nav active" href={`/collabs/${collabId}`} title="Dashboard"><Icon name="briefcase" /><span className="nav-label">Dashboard</span></Link><Link className="time-nav" href="/history" title="Time history"><Icon name="calendar" /><span className="nav-label">Time history</span></Link></nav>
        <div className="time-sidebar-footer"><p><Icon name="clock" /><span className="sidebar-security">Time entries are recorded securely.</span></p><button onClick={() => void signOut()} title="Sign out" type="button"><Icon name="logout" /><span className="logout-label">Sign out</span></button></div>
      </aside>
      <section className="time-workspace" id="dashboard">
        <motion.header animate={{ opacity: 1, y: 0 }} className="time-header" initial={entrance} transition={{ duration: .42, ease: "easeOut" }}><div><p>{selectedCollab.name} · {currentDate}</p><h1>Welcome back, {employeeName}.</h1></div><div className="workspace-actions"><button onClick={() => void openMembers()} type="button">Members</button><button onClick={() => setInboxOpen(true)} type="button">Inbox</button><div className="status-chip"><span className={activeEntry && !activeBreak ? "online" : "offline"} />{activeBreak ? "On break" : activeEntry ? "Clocked in" : "Clocked out"}</div></div></motion.header>
        <AnimatePresence mode="wait">{notice && <motion.div animate={{ opacity: 1, height: "auto" }} className={`time-notice ${notice.type}`} exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }} role={notice.type === "error" ? "alert" : "status"}><span>{notice.type === "success" ? <Icon name="check" /> : "!"}</span>{notice.text}<button aria-label="Dismiss" onClick={() => setNotice(null)} type="button">×</button></motion.div>}</AnimatePresence>
        <motion.section animate={{ opacity: 1, y: 0 }} className="clock-card" initial={entrance} transition={{ duration: .45, delay: .08, ease: "easeOut" }}><div className="clock-card-copy"><p className="section-kicker">Today’s time</p><h2>{activeBreak ? "Your break is in progress" : activeEntry ? "Your shift is in progress" : "Ready when you are"}</h2><p>{activeEntry ? `Clocked in at ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(activeEntry.clockIn))}` : "Clock in when you begin work. Your current time is recorded automatically."}</p>{activeEntry && <strong>{toDuration((now - activeEntry.clockIn) - activeEntry.breaks.reduce((total, item) => total + ((item.endedAt ?? now) - item.startedAt), 0))} <small>paid this shift</small></strong>}</div><div className="clock-actions">{activeEntry && <motion.button whileTap={reduceMotion ? undefined : { scale: .98 }} className="clock-button break-button" disabled={busy} onClick={() => void updateBreak()} type="button">{busy ? "Updating…" : activeBreak ? "End break" : "Start break"}</motion.button>}<motion.button whileTap={reduceMotion ? undefined : { scale: .98 }} className={`clock-button ${activeEntry ? "clock-out" : "clock-in"}`} disabled={busy || Boolean(activeBreak)} onClick={() => void updateClock()} type="button"><Icon name="clock" />{busy ? "Updating…" : activeEntry ? "Clock out" : "Clock in"}</motion.button></div></motion.section>
        <motion.section animate={{ opacity: 1, y: 0 }} className="time-metrics" initial={entrance} transition={{ duration: .45, delay: .15, ease: "easeOut" }} aria-label="Hours summary">{[["clock", "Today", toDuration(metrics.today), activeEntry ? "Currently working" : "No active shift"], ["calendar", "This week", toDuration(metrics.week), "Monday to today"], ["briefcase", "This month", toDuration(metrics.month), "All recorded shifts"]].map(([icon, label, total, caption], index) => <motion.article animate={{ opacity: 1, y: 0 }} initial={entrance} key={label} transition={{ duration: .35, delay: .2 + index * .07, ease: "easeOut" }}><span><Icon name={icon as "clock" | "calendar" | "briefcase"} /></span><p>{label}</p><strong>{total}</strong><small>{caption}</small></motion.article>)}</motion.section>
        <motion.section animate={{ opacity: 1, y: 0 }} className="history-card" id="history" initial={entrance} transition={{ duration: .45, delay: .34, ease: "easeOut" }}><div className="history-heading"><div><p className="section-kicker">Attendance</p><h2>Time history</h2></div><button onClick={() => void loadEntries()} type="button">Refresh</button></div>{loading ? <div className="history-loading"><i /><i /><i /></div> : entries.length === 0 ? <div className="no-entries"><Icon name="calendar" /><h3>No time entries yet</h3><p>Your clock-ins and clock-outs will appear here.</p></div> : <div className="history-table" role="region" aria-label="Time history by day" tabIndex={0}>{historyDays.map((day) => <section className="history-day" key={day.key}><header><strong>{day.label}</strong><span>{toDuration(day.total)} paid</span></header><table><thead><tr><th>Clock in</th><th>Clock out</th><th>Paid time</th><th>Status</th></tr></thead><tbody>{day.entries.map((entry) => <tr key={entry.id}><td>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockIn))}</td><td>{entry.clockOut ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockOut)) : "—"}</td><td>{toDuration(paidDuration(entry, now))}</td><td><span className={entry.clockOut ? "entry-complete" : "entry-active"}>{entry.clockOut ? "Completed" : "In progress"}</span></td></tr>)}</tbody></table></section>)}</div>}</motion.section>
        {membersOpen && <aside aria-label="Collab members" className="workspace-panel"><header><div><p className="section-kicker">People</p><h2>Members</h2></div><button aria-label="Close members" onClick={() => setMembersOpen(false)} type="button">×</button></header>{members.map((member) => <div className="workspace-person" key={member.id}><span>{member.email[0].toUpperCase()}</span><div><strong>{member.email}</strong><small>{member.role.replace("_", "-")}</small></div></div>)}</aside>}
        {inboxOpen && <aside aria-label="Collab inbox" className="workspace-panel"><header><div><p className="section-kicker">Updates</p><h2>Inbox</h2></div><button aria-label="Close inbox" onClick={() => setInboxOpen(false)} type="button">×</button></header><div className="workspace-inbox-empty"><strong>You’re all caught up.</strong><p>Collab invitations, approvals, and timekeeping updates will appear here as they are added.</p></div></aside>}
      </section>
    </div>
  </main>;
}
