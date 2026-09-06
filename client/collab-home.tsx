"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthForm from "@/client/auth-form";

type User = { id: string; email: string };
type Collab = { id: string; name: string; role: "admin" | "co_admin" | "member" };

function displayName(email: string) {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CollabHome() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  function revealCreate() {
    setShowCreate(true);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  async function loadCollabs() {
    const response = await fetch("/api/collabs", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Your Collabs could not be loaded.");
    setCollabs(data.collabs);
  }

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.user) { setUser(null); return; }
      setUser(data.user);
      await loadCollabs();
    }).catch((caught) => {
      setUser(null);
      setError(caught instanceof Error ? caught.message : "Unable to load your workspace.");
    }).finally(() => setLoading(false));
  }, []);

  async function createCollab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/collabs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your Collab could not be created.");
      setCollabs((current) => [...current, data.collab]);
      setName("");
      setShowCreate(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your Collab could not be created.");
    } finally {
      setCreating(false);
    }
  }

  if (user === undefined || loading) return <main className="collab-loading">Loading your workspace…</main>;
  if (!user) return <AuthForm onAuthenticated={setUser} />;

  return <main className="collab-home-shell">
    <aside className="collab-home-sidebar">
      <Link className="collab-brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>Papertrail</span></Link>
      <button className="new-collab-button" onClick={revealCreate} type="button">+ New Collab</button>
      <nav aria-label="Home navigation" className="collab-home-nav">
        <Link className="active" href="/"><span>⌂</span> Home</Link>
        <button disabled type="button"><span>✉</span> Inbox <small>Soon</small></button>
      </nav>
      <div className="home-sidebar-user"><span>{user.email[0].toUpperCase()}</span><div><strong>{displayName(user.email)}</strong><small>{user.email}</small></div></div>
    </aside>
    <section className="collab-home-content">
      <header className="collab-home-heading"><p>Home</p><h1>Good to see you, {displayName(user.email).split(" ")[0]}.</h1></header>
      <section aria-labelledby="collabs-title" className="collabs-section">
        <div className="collabs-section-heading"><div><h2 id="collabs-title">Your Collabs</h2><p>Open a workspace or create a new one.</p></div><button onClick={revealCreate} type="button">+ Collab</button></div>
        {showCreate && <form className="collab-create-row" onSubmit={createCollab}><label htmlFor="collab-name">Collab name</label><input autoComplete="off" disabled={creating} id="collab-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Studio" ref={nameInputRef} required value={name} /><button disabled={creating} type="submit">{creating ? "Creating…" : "Create"}</button><button className="quiet-button" disabled={creating} onClick={() => { setShowCreate(false); setName(""); }} type="button">Cancel</button></form>}
        {error && <p className="collab-home-error" role="alert">{error}</p>}
        <div className="collab-tile-grid">
          {collabs.map((collab) => <Link className="collab-tile" href={`/collabs/${collab.id}`} key={collab.id}><span className="collab-tile-icon">{collab.name[0].toUpperCase()}</span><strong title={collab.name}>{collab.name}</strong><small>{collab.role === "co_admin" ? "Co-admin" : collab.role[0].toUpperCase() + collab.role.slice(1)}</small></Link>)}
          <button aria-label="Create a Collab" className="collab-tile collab-tile-create" onClick={revealCreate} type="button"><span className="collab-tile-icon">+</span><strong>New Collab</strong><small>Private workspace</small></button>
        </div>
      </section>
    </section>
  </main>;
}
