"use client";

import { FormEvent, useEffect, useState } from "react";
import { useDashboard } from "@/client/dashboard-shell";

export default function SettingsPage() {
  const { user, collabs, updateUser, updateWorkspaceName } = useDashboard();
  const workspace = collabs[0];
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? "");
  const [profileError, setProfileError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  useEffect(() => { setDisplayName(user.displayName ?? ""); }, [user.displayName]);
  useEffect(() => { setWorkspaceName(workspace?.name ?? ""); }, [workspace?.name]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true); setProfileError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your profile could not be updated.");
      updateUser(data.user);
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
      updateWorkspaceName(data.collab.name);
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : "Your workspace could not be updated."); }
    finally { setSavingWorkspace(false); }
  }

  return <section className="settings-page">
    <header className="settings-page-header"><div><p className="section-kicker">Account</p><h1>Settings</h1><p>Keep your profile and workspace details up to date.</p></div></header>
    <div className="settings-page-grid">
      <section className="settings-card"><div className="settings-section-heading"><h2>Your profile</h2><p>This is the name your team sees after you save it.</p></div><form onSubmit={saveProfile}><label>Display name<input autoComplete="name" disabled={savingProfile} maxLength={80} minLength={2} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Andrea Cruz" required value={displayName} /></label>{profileError && <p className="settings-error" role="alert">{profileError}</p>}<button className="settings-save" disabled={savingProfile} type="submit">{savingProfile ? "Saving…" : "Save profile"}</button></form></section>
      <section className="settings-card settings-account"><div className="settings-section-heading"><h2>Account</h2><p>Your sign-in email.</p></div><output>{user.email}</output></section>
      {workspace?.role === "admin" && <section className="settings-card settings-workspace"><div className="settings-section-heading"><h2>Workspace</h2><p>Only the workspace owner can change this name.</p></div><form onSubmit={saveWorkspace}><label>Workspace name<input disabled={savingWorkspace} maxLength={80} minLength={2} onChange={(event) => setWorkspaceName(event.target.value)} required value={workspaceName} /></label>{workspaceError && <p className="settings-error" role="alert">{workspaceError}</p>}<button className="settings-save" disabled={savingWorkspace} type="submit">{savingWorkspace ? "Saving…" : "Save workspace"}</button></form></section>}
    </div>
  </section>;
}
