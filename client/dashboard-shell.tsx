"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthForm from "@/client/auth-form";
import type { DashboardStats } from "@/lib/dashboard";

type User = { id: string; email: string; displayName: string | null };
export type Collab = { id: string; name: string; role: "admin" | "co_admin" | "member" };
type DashboardContext = {
  user: User; collabs: Collab[]; loading: boolean; error: string;
  refreshCollabs: () => Promise<void>;
  requireSignIn: () => void;
  updateUser: (user: User) => void;
  updateWorkspaceName: (name: string) => void;
  dashboardStats: DashboardStats | null;
  dashboardStatsError: string;
  dashboardStatsLoading: boolean;
  loadDashboardStats: (workspaceId: string) => Promise<void>;
  invalidateDashboardStats: () => void;
};
const Context = createContext<DashboardContext | null>(null);
const STATS_CACHE_MS = 60_000;
export function useDashboard() {
  const context = useContext(Context);
  if (!context) throw new Error("Dashboard content must be inside DashboardShell.");
  return context;
}
export function DashboardIcon({ name }: { name: "clock" | "home" | "panel" | "logout" | "collab" | "settings" }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></>,
    panel: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16M14 9l-3 3 3 3" /></>,
    logout: <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />,
    collab: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-1.92 1.92-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65v.09h-2.72v-.09a1.8 1.8 0 0 0-1.1-1.65A1.8 1.8 0 0 0 8.94 18.9l-.06.06-1.92-1.92.06-.06A1.8 1.8 0 0 0 7.38 15a1.8 1.8 0 0 0-1.65-1.1h-.09v-2.72h.09a1.8 1.8 0 0 0 1.65-1.1A1.8 1.8 0 0 0 7.02 8.1l-.06-.06L8.88 6.12l.06.06a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.1-1.65V4.8h2.72v.09a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06 1.92 1.92-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.09v2.72h-.09A1.8 1.8 0 0 0 19.4 15Z" /></>,
  };
  return <svg aria-hidden="true" className="time-icon" viewBox="0 0 24 24">{paths[name]}</svg>;
}

export default function DashboardShell({ children, initialCollabs, initialUser }: { children: ReactNode; initialCollabs: Collab[] | null; initialUser: User | null }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(initialUser);
  const [collabs, setCollabs] = useState<Collab[]>(initialCollabs ?? []);
  const [loading, setLoading] = useState(initialUser !== null && initialCollabs === null);
  const [usingServerCollabs, setUsingServerCollabs] = useState(initialUser !== null && initialCollabs !== null);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardStatsError, setDashboardStatsError] = useState("");
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false);
  const dashboardStatsCache = useRef<{ workspaceId: string; value: DashboardStats; fetchedAt: number } | null>(null);
  const dashboardStatsRequest = useRef<Promise<void> | null>(null);
  const requireSignIn = useCallback(() => { setUsingServerCollabs(false); setUser(null); }, []);
  const refreshCollabs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/collabs", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { setUser(null); return; }
      if (!response.ok) throw new Error(data.error ?? "Your Collabs could not be loaded.");
      setCollabs(data.collabs);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your Collabs could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { setCollapsed(localStorage.getItem("papertrail-sidebar") === "collapsed"); }, []);
  useEffect(() => {
    if (!user) { setCollabs([]); setLoading(false); return; }
    if (usingServerCollabs) return;
    void refreshCollabs();
  }, [refreshCollabs, user, usingServerCollabs]);
  useEffect(() => {
    dashboardStatsCache.current = null;
    dashboardStatsRequest.current = null;
    setDashboardStats(null);
    setDashboardStatsError("");
    setDashboardStatsLoading(false);
  }, [user?.id]);
  function toggleSidebar() {
    setCollapsed((current) => { localStorage.setItem("papertrail-sidebar", current ? "expanded" : "collapsed"); return !current; });
  }
  const invalidateDashboardStats = useCallback(() => {
    dashboardStatsCache.current = null;
    setDashboardStats(null);
  }, []);
  const loadDashboardStats = useCallback(async (workspaceId: string) => {
    const cached = dashboardStatsCache.current;
    if (cached?.workspaceId === workspaceId && Date.now() - cached.fetchedAt < STATS_CACHE_MS) {
      setDashboardStats(cached.value);
      return;
    }
    if (dashboardStatsRequest.current) return dashboardStatsRequest.current;
    const request = (async () => {
      setDashboardStatsLoading(true); setDashboardStatsError("");
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(`/api/dashboard?collabId=${encodeURIComponent(workspaceId)}&timeZone=${encodeURIComponent(timeZone)}`, { cache: "no-store" });
        const data = await response.json();
        if (response.status === 401) { requireSignIn(); return; }
        if (!response.ok) throw new Error(data.error ?? "Your work snapshot could not be loaded.");
        dashboardStatsCache.current = { workspaceId, value: data, fetchedAt: Date.now() };
        setDashboardStats(data);
      } catch (caught) { setDashboardStatsError(caught instanceof Error ? caught.message : "Your work snapshot could not be loaded."); }
      finally { setDashboardStatsLoading(false); dashboardStatsRequest.current = null; }
    })();
    dashboardStatsRequest.current = request;
    return request;
  }, [requireSignIn]);
  async function signOut() {
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error();
      setUsingServerCollabs(false); setUser(null); setCollabs([]);
    } catch { setError("We couldn’t sign you out. Please try again."); }
  }
  if (!user) return <AuthForm onAuthenticated={(nextUser) => { setUsingServerCollabs(false); setUser(nextUser); }} />;
  const name = user.displayName ?? user.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const workspace = collabs[0];
  const updateWorkspaceName = (name: string) => setCollabs((current) => current.map((collab) => collab.id === workspace?.id ? { ...collab, name } : collab));
  return <Context.Provider value={{ user, collabs, loading, error, refreshCollabs, requireSignIn, updateUser: setUser, updateWorkspaceName, dashboardStats, dashboardStatsError, dashboardStatsLoading, loadDashboardStats, invalidateDashboardStats }}>
    <main className="time-app unified-dashboard">
      <div className={`time-shell${collapsed ? " sidebar-collapsed" : ""}`}>
        <aside className="time-sidebar">
          <div className="sidebar-brand-row"><Link className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span className="brand-label">Papertrail</span></Link><button aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="sidebar-toggle" onClick={toggleSidebar} type="button"><DashboardIcon name="panel" /></button></div>
          <div className="employee-summary"><span>{name[0]?.toUpperCase()}</span><div className="employee-copy"><strong>{name}</strong><small title={user.email}>{user.email}</small></div></div>
          <nav aria-label="Main navigation">
            <Link className={`time-nav${pathname === "/" ? " active" : ""}`} href="/" prefetch title="Dashboard" aria-current={pathname === "/" ? "page" : undefined}><DashboardIcon name="home" /><span className="nav-label">Dashboard</span></Link>
            {workspace && <Link className={`time-nav${pathname.startsWith(`/collabs/${workspace.id}`) ? " active" : ""}`} href={`/collabs/${workspace.id}`} prefetch title="Workspace" aria-current={pathname === `/collabs/${workspace.id}` ? "page" : undefined}><DashboardIcon name="collab" /><span className="nav-label">Workspace</span></Link>}
          </nav>
          <div className="time-sidebar-footer"><p><DashboardIcon name="clock" /><span className="sidebar-security">Your people. Your workspace.</span></p><Link className={`time-nav sidebar-settings-link${pathname === "/settings" ? " active" : ""}`} href="/settings" prefetch title="Settings"><DashboardIcon name="settings" /><span className="nav-label">Settings</span></Link><button onClick={() => void signOut()} title="Sign out" type="button"><DashboardIcon name="logout" /><span className="logout-label">Sign out</span></button></div>
        </aside>
        <section className="time-workspace" id="dashboard">
          {error && <div className="time-notice error" role="alert">{error}<button onClick={() => void refreshCollabs()} type="button">Retry</button></div>}
          {children}
        </section>
      </div>
    </main>
  </Context.Provider>;
}
