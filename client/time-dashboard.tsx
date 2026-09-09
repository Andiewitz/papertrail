"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useDashboard, type TimeEntry } from "@/client/dashboard-shell";
import MemberAvatarGroup from "@/client/member-avatar-group";
type Member = { id: string; email: string; displayName: string | null; role: string; status: string };
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

function memberName(member: Member) { return member.displayName ?? member.email; }

export default function TimeDashboard({ collabId }: { collabId: string }) {
  const { collabs, loading: collabsLoading, requireSignIn, invalidateDashboardStats, timeEntries, timeEntriesError, timeEntriesLoading: loading, loadTimeEntries, updateTimeEntry } = useDashboard();
  const selectedCollab = collabs.find((collab) => collab.id === collabId);
  const canTrackTime = selectedCollab?.role === "member" || selectedCollab?.role === "co_admin";
  const canInvite = selectedCollab?.role === "admin" || selectedCollab?.role === "co_admin";
  const [membersOpen, setMembersOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [memberCode, setMemberCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<Notice>(null);
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 };

  const loadEntries = useCallback(() => canTrackTime ? loadTimeEntries(collabId, { force: true }) : Promise.resolve(), [canTrackTime, collabId, loadTimeEntries]);
  useEffect(() => { if (canTrackTime) void loadTimeEntries(collabId); }, [canTrackTime, collabId, loadTimeEntries]);
  useEffect(() => { if (timeEntriesError) setNotice({ type: "error", text: timeEntriesError }); }, [timeEntriesError]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);

  const entries = useMemo(() => timeEntries ?? [], [timeEntries]);

  const loadMembers = useCallback(async () => {
    if (!selectedCollab) return;
    setMembersLoading(true);
    try {
      const response = await fetch(`/api/collabs/${collabId}/members`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Members could not be loaded.");
      setMembers(data.members);
      setMembersLoaded(true);
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Members could not be loaded." }); }
    finally { setMembersLoading(false); }
  }, [collabId, selectedCollab]);
  useEffect(() => { if (selectedCollab?.role === "admin") void loadMembers(); }, [loadMembers, selectedCollab?.role]);

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
      const response = await fetch(`/api/collabs/${collabId}/time`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(activeEntry ? { entryId: activeEntry.id } : {}) }) });
      const data = await response.json();
      if (response.status === 401) { requireSignIn(); return; }
      if (!response.ok) {
        if (response.status === 409) void loadEntries();
        throw new Error(data.error ?? "Your time entry could not be updated.");
      }
      updateTimeEntry(action === "clock-out" && !data.alreadyClockedOut && activeEntry ? { ...activeEntry, ...data.entry, breaks: activeEntry.breaks } : data.entry);
      invalidateDashboardStats();
      setNow(Date.now());
      setNotice({ type: "success", text: action === "clock-in" ? data.alreadyClockedIn ? "Your active shift is already recorded." : "You’re clocked in. Have a great shift." : data.alreadyClockedOut ? "Your clock-out was already recorded." : "You’re clocked out. Your hours have been recorded." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Your time entry could not be updated." }); }
    finally { setBusy(false); }
  }

  async function updateBreak() {
    if (!activeEntry) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/collabs/${collabId}/time`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: activeBreak ? "break-end" : "break-start" }) });
      const data = await response.json();
      if (response.status === 401) { requireSignIn(); return; }
      if (!response.ok) throw new Error(data.error ?? "Your break could not be updated.");
      if (data.entry) updateTimeEntry(data.entry);
      else if (data.entryId === activeEntry.id && data.break) {
        updateTimeEntry({
          ...activeEntry,
          breaks: activeBreak
            ? activeEntry.breaks.map((item) => item.id === data.break.id ? { ...item, endedAt: data.break.endedAt } : item)
            : [...activeEntry.breaks, data.break],
        });
      }
      invalidateDashboardStats();
      setNow(Date.now());
      setNotice({ type: "success", text: activeBreak ? "Your break has ended. You’re back on the clock." : "Your break has started. Paid time is paused." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Your break could not be updated." }); }
    finally { setBusy(false); }
  }

  async function openMembers() { setInboxOpen(false); setInviteOpen(false); setMembersOpen(true); if (!membersLoaded) await loadMembers(); }
  async function createMemberCode() {
    setInviteBusy(true); setNotice(null); setMemberCode("");
    try {
      const response = await fetch(`/api/collabs/${collabId}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (response.status === 401) { requireSignIn(); return; }
      if (!response.ok) throw new Error(data.error ?? "The member code could not be created.");
      setMemberCode(data.invitation.code);
      setNotice({ type: "success", text: "New member code created. Any previous unused code has been rotated." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "The member code could not be created." }); }
    finally { setInviteBusy(false); }
  }
  async function copyMemberCode() {
    try { await navigator.clipboard.writeText(memberCode); setNotice({ type: "success", text: "Member code copied." }); }
    catch { setNotice({ type: "error", text: "Copy failed. Select the code and copy it manually." }); }
  }

  if (collabsLoading) return <p role="status">Loading Collab…</p>;
  if (!selectedCollab) return <section className="history-card"><h2>Collab unavailable</h2><p>You don’t have access to this Collab.</p><Link href="/">Back to dashboard</Link></section>;

  const currentDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(now));

  return <>
        <motion.header animate={{ opacity: 1, y: 0 }} className="time-header workspace-header" initial={entrance} transition={{ duration: .42, ease: "easeOut" }}><div><p><Link href="/">Dashboard</Link> / Collab · {currentDate}</p><h1>{selectedCollab.name}</h1></div><div className="workspace-actions"><MemberAvatarGroup loading={membersLoading} members={members.map((member) => ({ id: member.id, name: memberName(member) }))} onOpen={() => void openMembers()} onPrefetch={() => { if (!membersLoaded && !membersLoading) void loadMembers(); }} />{canInvite && <button onClick={() => { setMembersOpen(false); setInboxOpen(false); setInviteOpen(true); setMemberCode(""); }} type="button">Add member</button>}<button onClick={() => { setMembersOpen(false); setInviteOpen(false); setInboxOpen(true); }} type="button">Inbox</button>{canTrackTime && <div className="status-chip"><span className={activeEntry && !activeBreak ? "online" : "offline"} />{activeBreak ? "On break" : activeEntry ? "Clocked in" : "Clocked out"}</div>}</div></motion.header>
        <AnimatePresence mode="wait">{notice && <motion.div animate={{ opacity: 1, height: "auto" }} className={`time-notice ${notice.type}`} exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }} role={notice.type === "error" ? "alert" : "status"}><span>{notice.type === "success" ? <Icon name="check" /> : "!"}</span>{notice.text}<button aria-label="Dismiss" onClick={() => setNotice(null)} type="button">×</button></motion.div>}</AnimatePresence>
        {canTrackTime ? <>
        <motion.section animate={{ opacity: 1, y: 0 }} className="clock-card" initial={entrance} transition={{ duration: .45, delay: .08, ease: "easeOut" }}><div className="clock-card-copy"><p className="section-kicker">Today’s time</p><h2>{activeBreak ? "Your break is in progress" : activeEntry ? "Your shift is in progress" : "Ready when you are"}</h2><p>{activeEntry ? `Clocked in at ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(activeEntry.clockIn))}` : "Clock in when you begin work. Your current time is recorded automatically."}</p>{activeEntry && <strong>{toDuration((now - activeEntry.clockIn) - activeEntry.breaks.reduce((total, item) => total + ((item.endedAt ?? now) - item.startedAt), 0))} <small>paid this shift</small></strong>}</div><div className="clock-actions">{activeEntry && <motion.button whileTap={reduceMotion ? undefined : { scale: .98 }} className="clock-button break-button" disabled={busy} onClick={() => void updateBreak()} type="button">{busy ? "Updating…" : activeBreak ? "End break" : "Start break"}</motion.button>}<motion.button whileTap={reduceMotion ? undefined : { scale: .98 }} className={`clock-button ${activeEntry ? "clock-out" : "clock-in"}`} disabled={busy || loading || Boolean(activeBreak)} onClick={() => void updateClock()} type="button"><Icon name="clock" />{busy ? "Updating…" : activeEntry ? "Clock out" : "Clock in"}</motion.button></div></motion.section>
        <motion.section animate={{ opacity: 1, y: 0 }} className="time-metrics" initial={entrance} transition={{ duration: .45, delay: .15, ease: "easeOut" }} aria-label="Hours summary">{[["clock", "Today", toDuration(metrics.today), activeEntry ? "Currently working" : "No active shift"], ["calendar", "This week", toDuration(metrics.week), "Monday to today"], ["briefcase", "This month", toDuration(metrics.month), "All recorded shifts"]].map(([icon, label, total, caption], index) => <motion.article animate={{ opacity: 1, y: 0 }} initial={entrance} key={label} transition={{ duration: .35, delay: .2 + index * .07, ease: "easeOut" }}><span><Icon name={icon as "clock" | "calendar" | "briefcase"} /></span><p>{label}</p><strong>{total}</strong><small>{caption}</small></motion.article>)}</motion.section>
        <motion.section animate={{ opacity: 1, y: 0 }} className="history-card" id="history" initial={entrance} transition={{ duration: .45, delay: .34, ease: "easeOut" }}><div className="history-heading"><div><p className="section-kicker">Attendance</p><h2>Time history</h2><Link href={`/collabs/${collabId}/history`}>View all history</Link></div><button onClick={() => void loadEntries()} type="button">Refresh</button></div>{loading ? <div className="history-loading"><i /><i /><i /></div> : entries.length === 0 ? <div className="no-entries"><Icon name="calendar" /><h3>No time entries yet</h3><p>Your clock-ins and clock-outs will appear here.</p></div> : <div className="history-table" role="region" aria-label="Time history by day" tabIndex={0}>{historyDays.map((day) => <section className="history-day" key={day.key}><header><strong>{day.label}</strong><span>{toDuration(day.total)} paid</span></header><table><thead><tr><th>Clock in</th><th>Clock out</th><th>Paid time</th><th>Status</th></tr></thead><tbody>{day.entries.map((entry) => <tr key={entry.id}><td>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockIn))}</td><td>{entry.clockOut ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.clockOut)) : "—"}</td><td>{toDuration(paidDuration(entry, now))}</td><td><span className={entry.clockOut ? "entry-complete" : "entry-active"}>{entry.clockOut ? "Completed" : "In progress"}</span></td></tr>)}</tbody></table></section>)}</div>}</motion.section>
        </> : <section className="collab-overview"><div className="collab-overview-intro"><div><p className="section-kicker">Admin workspace</p><h2>Keep the team moving.</h2><p>Add people with a short, rotating member code and keep the directory current.</p></div><button className="clock-button clock-in" onClick={() => { setMembersOpen(false); setInboxOpen(false); setInviteOpen(true); setMemberCode(""); }} type="button">Add a member</button></div><div className="collab-overview-grid"><article><span>{members.length}</span><strong>{members.length === 1 ? "Member" : "Members"}</strong><small>{membersLoading ? "Updating directory…" : "Active people in this Collab"}</small></article><article><span>{members.filter((member) => member.role === "co_admin").length}</span><strong>Co-admins</strong><small>People who can help run the workspace</small></article></div><section className="workspace-team-card"><header><div><h3>People</h3><p>Everyone in {selectedCollab.name}.</p></div><button onClick={() => void openMembers()} type="button">Open directory</button></header>{membersLoading ? <p className="workspace-empty">Loading members…</p> : <div className="workspace-team-list">{members.slice(0, 4).map((member) => <div className="workspace-person" key={member.id}><span>{memberName(member)[0]?.toUpperCase()}</span><div><strong>{memberName(member)}</strong><small>{member.role.replace("_", "-")} · {member.email}</small></div></div>)}</div>}</section></section>}
        {membersOpen && <aside aria-label="Collab members" className="workspace-panel"><header><div><p className="section-kicker">People</p><h2>Members</h2></div><button aria-label="Close members" onClick={() => setMembersOpen(false)} type="button">×</button></header>{members.map((member) => <div className="workspace-person" key={member.id}><span>{memberName(member)[0]?.toUpperCase()}</span><div><strong>{memberName(member)}</strong><small>{member.role.replace("_", "-")} · {member.email}</small></div></div>)}</aside>}
        {inviteOpen && <aside aria-label="Add a member" className="workspace-panel"><header><div><p className="section-kicker">People</p><h2>Add member</h2></div><button aria-label="Close member code" onClick={() => setInviteOpen(false)} type="button">×</button></header>{memberCode ? <div className="workspace-invite-success"><strong>Share this member code privately.</strong><p>It works once for 15 minutes. Generating another code immediately replaces this one.</p><input aria-label="Member code" readOnly value={memberCode} /><button onClick={() => void copyMemberCode()} type="button">Copy member code</button><button className="workspace-link-button" disabled={inviteBusy} onClick={() => void createMemberCode()} type="button">{inviteBusy ? "Generating…" : "Generate a new code"}</button></div> : <div className="workspace-invite-form"><p>Create a six-character code for the person who is joining. They enter it while registering and become a Member automatically.</p><button className="clock-button clock-in" disabled={inviteBusy} onClick={() => void createMemberCode()} type="button">{inviteBusy ? "Generating…" : "Generate member code"}</button></div>}</aside>}
        {inboxOpen && <aside aria-label="Collab inbox" className="workspace-panel"><header><div><p className="section-kicker">Updates</p><h2>Inbox</h2></div><button aria-label="Close inbox" onClick={() => setInboxOpen(false)} type="button">×</button></header><div className="workspace-inbox-empty"><strong>You’re all caught up.</strong><p>Collab invitations, approvals, and timekeeping updates will appear here as they are added.</p></div></aside>}
  </>;
}
