"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useDashboard } from "@/client/dashboard-shell";

function displayName(email: string) {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default function CollabHome() {
  const { user, collabs, loading, dashboardStats: stats, dashboardStatsError: statsError, dashboardStatsLoading: statsLoading, loadDashboardStats } = useDashboard();
  const workspace = collabs[0];

  useEffect(() => {
    if (workspace) void loadDashboardStats(workspace.id);
  }, [loadDashboardStats, workspace]);

  return <>
    <header className="time-header dashboard-home-heading"><div><p>Dashboard</p><h1>Good to see you, {(user.displayName ?? displayName(user.email)).split(" ")[0]}.</h1></div></header>
    {!user.displayName && <section className="profile-nudge"><div><p className="section-kicker">One last detail</p><h2>What should your team call you?</h2><p>Add your name once so your directory is clear for everyone.</p></div><Link href="/settings">Add your name <span aria-hidden="true">→</span></Link></section>}
    <section aria-labelledby="workspace-title" className="single-workspace-overview">
      {loading ? <p role="status">Loading your workspace…</p> : workspace ? <><div><p className="section-kicker">Your workspace</p><h2 id="workspace-title">{workspace.name}</h2><p>Manage your people, invitations, and attendance in one place.</p></div><Link href={`/collabs/${workspace.id}`}>Open workspace <span aria-hidden="true">→</span></Link></> : <div><p className="section-kicker">Your workspace</p><h2 id="workspace-title">Setting up your team</h2><p>Your workspace is being prepared. Refresh in a moment if it does not appear.</p></div>}
    </section>
    <section aria-labelledby="work-snapshot-title" className="dashboard-summary">
      <div className="dashboard-summary-heading"><div><p className="section-kicker">Your activity</p><h2 id="work-snapshot-title">Work snapshot</h2><p>Your personal time, from the last 28 days.</p></div>{stats?.activeEntry && <span className="dashboard-live-status">Clocked in · {stats.activeEntry.collabName}</span>}</div>
      {statsError ? <p className="dashboard-summary-error" role="alert">{statsError}</p> : !stats || statsLoading ? <div aria-label="Loading your work snapshot" className="dashboard-summary-grid dashboard-summary-loading"><i /><i /><i /><i /></div> : <div className="dashboard-summary-grid">
        <article><span>Average workday</span><strong>{stats.daysWorked ? formatDuration(stats.averageDailyMs) : "—"}</strong><small>{stats.daysWorked ? `Across ${stats.daysWorked} logged ${stats.daysWorked === 1 ? "day" : "days"}` : "Start tracking time to see this"}</small></article>
        <article><span>Last 7 days</span><strong>{formatDuration(stats.lastSevenDaysMs)}</strong><small>Paid time recorded this week</small></article>
        <article><span>Completed shifts</span><strong>{stats.completedShifts}</strong><small>Finished in the last 28 days</small></article>
        <article><span>Status</span><strong>{stats.activeEntry ? "Working" : "Off the clock"}</strong><small>{stats.activeEntry ? `Since ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(stats.activeEntry.clockIn))}` : "No active shift right now"}</small></article>
      </div>}
    </section>
  </>;
}
