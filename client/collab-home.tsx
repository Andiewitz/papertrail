"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDashboard } from "@/client/dashboard-shell";


function displayName(email: string) {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type DashboardStats = {
  averageDailyMs: number;
  daysWorked: number;
  lastSevenDaysMs: number;
  completedShifts: number;
  activeEntry: { collabName: string; clockIn: number } | null;
};

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default function CollabHome() {
  const { user, collabs, loading, addCollab, requireSignIn } = useDashboard();
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadStats() {
      setStatsError("");
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(`/api/dashboard?timeZone=${encodeURIComponent(timeZone)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (response.status === 401) { requireSignIn(); return; }
        if (!response.ok) throw new Error(data.error ?? "Your work snapshot could not be loaded.");
        setStats(data);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setStatsError(caught instanceof Error ? caught.message : "Your work snapshot could not be loaded.");
      }
    }
    void loadStats();
    return () => controller.abort();
  }, [requireSignIn]);

  function revealCreate() {
    setShowCreate(true);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  async function createCollab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/collabs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your Collab could not be created.");
      addCollab(data.collab);
      setName("");
      setShowCreate(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your Collab could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return <>
      <header className="time-header dashboard-home-heading"><div><p>Dashboard</p><h1>Good to see you, {displayName(user.email).split(" ")[0]}.</h1></div></header>
      <section aria-labelledby="collabs-title" className="collabs-section">
        <div className="collabs-section-heading"><div><h2 id="collabs-title">Your Collabs</h2><p>Open a workspace or create a new one.</p></div><button onClick={revealCreate} type="button">+ Collab</button></div>
        {showCreate && <form className="collab-create-row" onSubmit={createCollab}><label htmlFor="collab-name">Collab name</label><input autoComplete="off" disabled={creating} id="collab-name" maxLength={80} minLength={2} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Studio" ref={nameInputRef} required value={name} /><button disabled={creating} type="submit">{creating ? "Creating…" : "Create"}</button><button className="quiet-button" disabled={creating} onClick={() => { setShowCreate(false); setName(""); }} type="button">Cancel</button></form>}
        {error && <p className="collab-home-error" role="alert">{error}</p>}
        {loading ? <p role="status">Loading your Collabs…</p> : <div className="collab-tile-grid">
          {collabs.map((collab) => <Link className="collab-tile" href={`/collabs/${collab.id}`} key={collab.id}><span className="collab-tile-icon">{collab.name[0].toUpperCase()}</span><strong title={collab.name}>{collab.name}</strong><small>{collab.role === "co_admin" ? "Co-admin" : collab.role[0].toUpperCase() + collab.role.slice(1)}</small></Link>)}
          <button aria-label="Create a Collab" className="collab-tile collab-tile-create" onClick={revealCreate} type="button"><span className="collab-tile-icon">+</span><strong>New Collab</strong><small>Private workspace</small></button>
        </div>}
      </section>
      <section aria-labelledby="work-snapshot-title" className="dashboard-summary">
        <div className="dashboard-summary-heading"><div><p className="section-kicker">Your activity</p><h2 id="work-snapshot-title">Work snapshot</h2><p>Personal time across all Collabs, from the last 28 days.</p></div>{stats?.activeEntry && <span className="dashboard-live-status">Clocked in · {stats.activeEntry.collabName}</span>}</div>
        {statsError ? <p className="dashboard-summary-error" role="alert">{statsError}</p> : !stats ? <div aria-label="Loading your work snapshot" className="dashboard-summary-grid dashboard-summary-loading"><i /><i /><i /><i /></div> : <div className="dashboard-summary-grid">
          <article><span>Average workday</span><strong>{stats.daysWorked ? formatDuration(stats.averageDailyMs) : "—"}</strong><small>{stats.daysWorked ? `Across ${stats.daysWorked} logged ${stats.daysWorked === 1 ? "day" : "days"}` : "Start tracking time to see this"}</small></article>
          <article><span>Last 7 days</span><strong>{formatDuration(stats.lastSevenDaysMs)}</strong><small>Paid time recorded this week</small></article>
          <article><span>Completed shifts</span><strong>{stats.completedShifts}</strong><small>Finished in the last 28 days</small></article>
          <article><span>Status</span><strong>{stats.activeEntry ? "Working" : "Off the clock"}</strong><small>{stats.activeEntry ? `Since ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(stats.activeEntry.clockIn))}` : "No active shift right now"}</small></article>
        </div>}
      </section>
  </>;
}
