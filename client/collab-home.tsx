"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useDashboard } from "@/client/dashboard-shell";


function displayName(email: string) {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CollabHome() {
  const { user, collabs, loading, addCollab } = useDashboard();
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

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
  </>;
}
