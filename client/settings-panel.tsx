"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type User = { id: string; email: string; displayName: string | null };
type Workspace = { id: string; name: string; role: "admin" | "co_admin" | "member" } | undefined;

export default function SettingsPanel({ open, onClose, onUserUpdated, onWorkspaceUpdated, user, workspace }: {
  open: boolean;
  onClose: () => void;
  onUserUpdated: (user: User) => void;
  onWorkspaceUpdated: (name: string) => void;
  user: User;
  workspace: Workspace;
}) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? "");
  const [profileError, setProfileError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    setDisplayName(user.displayName ?? "");
    setWorkspaceName(workspace?.name ?? "");
    setProfileError("");
    setWorkspaceError("");
  }, [open, user.displayName, workspace?.name]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true); setProfileError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your profile could not be updated.");
      onUserUpdated(data.user);
    } catch (error) { setProfileError(error instanceof Error ? error.message : "Your profile could not be updated."); }
    finally { setSavingProfile(false); }
  }

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setSavingWorkspace(true); setWorkspaceError("");
    try {
      const response = await fetch(`/api/collabs/${workspace.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: workspaceName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your workspace could not be updated.");
      onWorkspaceUpdated(data.collab.name);
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : "Your workspace could not be updated."); }
    finally { setSavingWorkspace(false); }
  }

  return <AnimatePresence>{open && <motion.div animate={{ opacity: 1 }} className="settings-backdrop" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onMouseDown={onClose}>
    <motion.aside animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }} aria-labelledby="settings-title" aria-modal="true" className="settings-panel" exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }} initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }} onMouseDown={(event) => event.stopPropagation()} role="dialog" transition={{ duration: .2, ease: "easeOut" }}>
      <header><div><p className="section-kicker">Account</p><h2 id="settings-title">Settings</h2></div><button aria-label="Close settings" onClick={onClose} type="button">×</button></header>
      <section><div className="settings-section-heading"><h3>Your profile</h3><p>This is the name your team sees after you save it.</p></div><form onSubmit={saveProfile}><label>Display name<input autoComplete="name" disabled={savingProfile} maxLength={80} minLength={2} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Andrea Cruz" required value={displayName} /></label>{profileError && <p className="settings-error" role="alert">{profileError}</p>}<button className="settings-save" disabled={savingProfile} type="submit">{savingProfile ? "Saving…" : "Save profile"}</button></form></section>
      <section className="settings-account"><div className="settings-section-heading"><h3>Account</h3><p>Sign-in email</p></div><output>{user.email}</output></section>
      {workspace?.role === "admin" && <section><div className="settings-section-heading"><h3>Workspace</h3><p>Only the workspace owner can change this name.</p></div><form onSubmit={saveWorkspace}><label>Workspace name<input disabled={savingWorkspace} maxLength={80} minLength={2} onChange={(event) => setWorkspaceName(event.target.value)} required value={workspaceName} /></label>{workspaceError && <p className="settings-error" role="alert">{workspaceError}</p>}<button className="settings-save" disabled={savingWorkspace} type="submit">{savingWorkspace ? "Saving…" : "Save workspace"}</button></form></section>}
    </motion.aside>
  </motion.div>}</AnimatePresence>;
}
