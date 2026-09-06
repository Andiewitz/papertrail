"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthForm from "@/client/auth-form";

type User = { id: string; email: string };
type Collab = { id: string; name: string; role: "admin" | "co_admin" | "member" };

export default function CollabHome() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function loadCollabs() {
    const response = await fetch("/api/collabs", { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Your Collabs could not be loaded.");
    setCollabs(data.collabs);
  }
  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      const data = await response.json(); if (!response.ok || !data.user) { setUser(null); return; }
      setUser(data.user); await loadCollabs();
    }).catch((caught) => { setUser(null); setError(caught instanceof Error ? caught.message : "Unable to load your workspace."); }).finally(() => setLoading(false));
  }, []);
  async function createCollab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setError("");
    try {
      const response = await fetch("/api/collabs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Your Collab could not be created.");
      setCollabs((current) => [...current, data.collab]); setName("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your Collab could not be created."); }
    finally { setCreating(false); }
  }
  if (user === undefined || loading) return <main className="collab-loading">Loading your Collabs…</main>;
  if (!user) return <AuthForm onAuthenticated={setUser} />;
  return <main className="collab-home"><header className="collab-home-header"><Link className="collab-brand" href="/"><span className="brand-mark"><i /><i /><i /></span>Papertrail</Link><div className="home-account"><span>{user.email[0].toUpperCase()}</span><p>{user.email}</p></div></header><section className="collab-home-intro"><div><p className="section-kicker">Your spaces</p><h1>Choose a Collab.</h1><p>Each Collab keeps its people, time records, and workspaces private.</p></div><form className="create-collab" onSubmit={createCollab}><label>New Collab<input disabled={creating} onChange={(event) => setName(event.target.value)} placeholder="Collab name" ref={nameInputRef} required value={name} /></label><button disabled={creating} type="submit">{creating ? "Creating…" : "+ Collab"}</button></form></section>{error && <p className="collab-home-error" role="alert">{error}</p>}<section className="collab-grid" aria-label="Your Collabs">{collabs.map((collab) => <Link className="collab-card" href={`/collabs/${collab.id}`} key={collab.id}><span className="collab-card-mark">{collab.name[0].toUpperCase()}</span><div><p>{collab.role === "co_admin" ? "Co-admin" : collab.role[0].toUpperCase() + collab.role.slice(1)}</p><h2>{collab.name}</h2><small>Open workspace →</small></div></Link>)}<button className="collab-card collab-card-add" onClick={() => nameInputRef.current?.focus()} type="button"><span>+</span><div><h2>Create a Collab</h2><p>Start a new private workspace.</p><small>Give it a name above →</small></div></button></section></main>;
}
