"use client";

import { FormEvent, useEffect, useState } from "react";
import AuthForm from "@/client/auth-form";

type Note = { id: number; body: string; createdAt: string };
type User = { id: string; email: string };

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null | undefined>(undefined);

  async function loadNotes() {
    const response = await fetch("/api/notes", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load notes.");
    setNotes(data.notes);
    setStatus(data.notes.length ? "" : "No notes yet. Add the first one above.");
  }

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setUser(data.user); })
      .catch((error: Error) => { setStatus(error.message); setUser(null); });
  }, []);

  useEffect(() => { if (user) void loadNotes().catch((error: Error) => setStatus(error.message)); }, [user]);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the note.");
      setNotes((current) => [data.note, ...current]);
      setBody("");
      setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save the note."); }
    finally { setSaving(false); }
  }

  async function deleteNote(id: number) {
    try {
      const response = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "Could not delete the note."); }
      setNotes((current) => current.filter((note) => note.id !== id));
      setStatus(notes.length === 1 ? "No notes yet. Add the first one above." : "");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not delete the note."); }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out.");
      setNotes([]);
      setUser(null);
      setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not sign out."); }
  }

  const name = user?.email.split("@")[0].replace(/[._-]/g, " ") ?? "";
  const titleName = name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
  const wordCount = notes.reduce((total, note) => total + note.body.trim().split(/\s+/).filter(Boolean).length, 0);

  if (user === undefined) return <main className="loading-screen"><span className="brand-mark"><i /><i /><i /></span><p>Opening your workspace…</p></main>;
  if (!user) return <AuthForm onAuthenticated={setUser} />;

  return <main className="dashboard-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span>Papertrail</div>
      <div className="profile"><span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span><div><strong>{titleName}</strong><small>Private workspace</small></div></div>
      <nav aria-label="Workspace navigation"><a className="nav-item active" href="#overview"><span>⌘</span>Overview</a><a className="nav-item" href="#notes"><span>✦</span>Notes <b>{notes.length}</b></a><a className="nav-item" href="#activity"><span>◌</span>Activity</a></nav>
      <div className="sidebar-bottom"><p><span className="secure-dot" /> Your notes are private</p><button className="logout" onClick={() => void signOut()} type="button">↗&nbsp; Sign out</button></div>
    </aside>
    <section className="workspace">
      <header className="workspace-header" id="overview"><div><p className="section-kicker">Your personal space</p><h1>Good morning, {titleName}.</h1><p className="header-subtitle">A little room for the things worth remembering.</p></div><div className="header-date"><span>{new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date())}</span><strong>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date())}</strong></div></header>
      <section className="metrics" aria-label="Workspace stats"><div className="metric-card"><span className="metric-icon coral">✦</span><p>Total notes</p><strong>{notes.length}</strong><small>Thoughts safely stored</small></div><div className="metric-card"><span className="metric-icon gold">⌁</span><p>Words captured</p><strong>{wordCount.toLocaleString()}</strong><small>Across your collection</small></div><div className="metric-card mint-card"><span className="metric-icon teal">◌</span><p>Latest note</p><strong>{notes[0] ? "Today" : "—"}</strong><small>{notes[0] ? "Keep the momentum" : "Start with one small thought"}</small></div></section>
      <section className="dashboard-grid"><article className="activity-card" id="activity"><div className="card-heading"><div><p className="section-kicker">A gentle rhythm</p><h2>Your activity</h2></div><span className="period-pill">This week⌄</span></div><div className="activity-visual"><div className="axis"><span>6</span><span>4</span><span>2</span><span>0</span></div><svg aria-hidden="true" viewBox="0 0 500 165" preserveAspectRatio="none"><path className="grid-line" d="M0 27H500M0 75H500M0 123H500" /><path className="activity-line" d="M5 126 C58 72, 89 62, 142 94 S223 145, 271 85 S350 52, 394 79 S456 101, 495 38" /><circle cx="346" cy="62" r="6" /></svg><div className="chart-days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div></div></article>
        <article className="prompt-card"><span className="sparkle">✦</span><p className="section-kicker">A thought for today</p><h2>What would make today feel meaningful?</h2><p>Write it down before the day gets away from you.</p></article></section>
      <section className="notes-area" id="notes"><div className="notes-intro"><p className="section-kicker">Your notebook</p><h2>Recent notes</h2><p>{notes.length ? "Keep collecting the good ideas." : "The page is waiting for your first thought."}</p></div><div className="notes-content"><form className="composer" onSubmit={addNote}><input aria-label="New note" maxLength={500} onChange={(event) => setBody(event.target.value)} placeholder="What’s on your mind?" value={body} /><button disabled={saving} type="submit">{saving ? "Saving…" : "Add note"}</button></form>{status && <p className={`status ${status.includes("TURSO") || status.includes("Could not") ? "error" : ""}`}>{status}</p>}<ul className="notes-list">{notes.map((note) => <li key={note.id}><div className="note-copy"><p>{note.body}</p><small>{new Date(note.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div><button aria-label={`Delete ${note.body}`} className="delete" onClick={() => void deleteNote(note.id)} type="button">Delete</button></li>)}</ul></div></section>
    </section>
  </main>;
}
