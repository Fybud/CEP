import { useState, useEffect, useRef } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { Loader2 } from "lucide-react";
import { Download, MoreHorizontal, Moon, Sun, Key, LogOut, Plus, Building, MonitorPlay, X, Search, Edit2, RefreshCw, MoreVertical, Trash2, ArrowLeft } from "lucide-react";

import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";

type FeatureFlag = {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
};

type Organization = {
  id: string;
  name: string;
  websiteUrl: string;
  dbName: string;
  dbUrlConfigured: boolean;
  dbUrl: string;
};

type Session = {
  id: string;
  browser: string;
  os: string;
  userName?: string;
  userEmail?: string;
  createdAt: string;
  _count: { events: number };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api/v1";

export function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem("theme") === "dark");
  useEffect(() => {
    if (isDark) { document.documentElement.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { document.documentElement.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [isDark]);
  const [token, setToken] = useState<string | null>(localStorage.getItem("admin_token"));
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"features" | "sessions">("features");
  
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Org Form
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgWebsite, setNewOrgWebsite] = useState("");
  const [newOrgDbUrl, setNewOrgDbUrl] = useState("");

  // Search & Edit States
  const [searchQuery, setSearchQuery] = useState("");
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgWebsite, setEditOrgWebsite] = useState("");
  const [editOrgDbUrl, setEditOrgDbUrl] = useState("");
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  
  // Menu State for list view
  const [menuOpenOrgId, setMenuOpenOrgId] = useState<string | null>(null);
  const [sessionMenuOpenId, setSessionMenuOpenId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [featureSearchQuery, setFeatureSearchQuery] = useState("");

  // Player State
  const [playingSession, setPlayingSession] = useState<string | null>(null);
  const [playingError, setPlayingError] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (token) fetchOrganizations();
  }, [token]);

  useEffect(() => {
    if (token && selectedOrgId) {
      if (activeTab === "features") fetchFeatures(selectedOrgId);
      if (activeTab === "sessions") fetchSessions(selectedOrgId);
      
      const org = organizations.find((o) => o.id === selectedOrgId);
      if (org) {
        setEditOrgName(org.name);
        setEditOrgWebsite(org.websiteUrl || "");
        setEditOrgDbUrl("");
        setEditingOrgId(null);
      }
    } else {
      setFeatures([]);
      setSessions([]);
    }
  }, [token, selectedOrgId, activeTab, organizations]);
  
  // Close menu when clicking outside (simple hack)
  useEffect(() => {
    const handleClick = () => { setMenuOpenOrgId(null); setSessionMenuOpenId(null); };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return handleLogout();
        throw new Error("Failed to fetch organizations");
      }
      const data = await res.json();
      setOrganizations(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          name: newOrgName, 
          websiteUrl: newOrgWebsite, 
          dbUrl: newOrgDbUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to create organization");
      const org = await res.json();
      setOrganizations([org, ...organizations]);
      setShowNewOrg(false);
      setNewOrgName("");
      setNewOrgWebsite("");
      setNewOrgDbUrl("");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = editingOrgId;
    if (!targetId) return;

    try {
      const targetOrg = organizations.find(o => o.id === targetId);
      const payload: any = {
        name: editOrgName,
        websiteUrl: editOrgWebsite,
      };
      
      // Only send dbUrl if it was actually modified
      if (targetOrg && editOrgDbUrl !== targetOrg.dbUrl) {
        payload.dbUrl = editOrgDbUrl || undefined;
      }

      const res = await fetch(`${API_BASE}/admin/organizations/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update organization");
      setOrganizations((prev) =>
        prev.map((org) => (org.id === targetId ? data : org)),
      );
      setEditOrgDbUrl("");
      setEditingOrgId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const deleteOrganization = async (orgId: string) => {
    if (!window.confirm("Are you sure you want to delete this organization?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${orgId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete organization");
      setOrganizations(organizations.filter(o => o.id !== orgId));
      if (selectedOrgId === orgId) setSelectedOrgId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fetchFeatures = async (orgId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${orgId}/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch features");
      setFeatures(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async (orgId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${orgId}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch sessions");
      setSessions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!selectedOrgId || !sessionToDelete) return;
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}/sessions/${sessionToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete session");
      setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
      setSessionToDelete(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

    const downloadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}/sessions/${sessionId}/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch session events");
      const events = await res.json();
      
      const safeEventsJson = JSON.stringify(events).replace(/</g, '\u003c');
      
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FyBud Session Replay - ${sessionId}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.1.1/dist/style.css" />
  <script src="https://cdn.jsdelivr.net/npm/rrweb-player@2.1.1/dist/index.js"></script>
  <style>
    body, html { margin: 0; padding: 0; height: 100vh; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; overflow: hidden; }
    .header { background: #1e293b; border-bottom: 1px solid #334155; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; color: white; flex-shrink: 0; }
    .header-logo { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 18px; letter-spacing: -0.5px; }
    .header-logo svg { width: 24px; height: 24px; color: #3b82f6; }
    .badge { background: rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid rgba(59, 130, 246, 0.3); }
    .player-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; overflow: hidden; }
    #player { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border-radius: 12px; overflow: hidden; background: white; }
    .replayer-wrapper { margin: 0 auto; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      FyBud Session Replay
    </div>
    <div class="badge">ID: ${sessionId}</div>
  </div>
  <div class="player-container">
    <div id="player"></div>
  </div>
  <script>
    const events = ${safeEventsJson};
    if (events.length > 1) {
      new rrwebPlayer({
        target: document.getElementById('player'),
        props: {
          events,
          autoPlay: true,
          width: 1024,
          height: 576,
        },
      });
    } else {
      document.getElementById('player').innerHTML = '<h2 style="padding: 2rem; color: #64748b; text-align: center;">Not enough events to replay.</h2>';
    }
  </script>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `replay-${sessionId}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const watchSession = async (sessionId: string) => {
    setPlayingSession(sessionId);
    setPlayingError(null);
    
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}/sessions/${sessionId}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const events = await res.json();
      
      if (!res.ok) throw new Error(events.error || "Failed to fetch events");
      if (events.length < 2) throw new Error("Not enough events to replay this session");

      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.innerHTML = "";
          playerInstanceRef.current = new rrwebPlayer({
            target: playerRef.current,
            props: {
              events,
              autoPlay: true,
            },
          });
        }
      }, 100);
    } catch (err: any) {
      setPlayingError(err.message);
    }
  };

  const closePlayer = () => {
    setPlayingSession(null);
    setPlayingError(null);
    if (playerInstanceRef.current) {
      playerInstanceRef.current.pause();
      playerInstanceRef.current = null;
    }
  };

  const toggleFeature = async (featureKey: string, enabled: boolean) => {
    if (!selectedOrgId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}/features/${featureKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update feature");
      
      setFeatures((prev) => {
        const exists = prev.some((f) => f.key === featureKey);
        if (exists) {
          return prev.map((f) => (f.key === featureKey ? { ...f, enabled } : f));
        }
        return [...prev, { key: featureKey, enabled, description: "", updatedAt: new Date().toISOString() }];
      });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLoginSuccess = async (credentialResponse: any) => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("admin_token", data.token);
      setToken(data.token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setToken(null);
    setFeatures([]);
    setSessions([]);
    setOrganizations([]);
    setSelectedOrgId(null);
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        await handleLoginSuccess({ credential: tokenResponse.access_token });
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError("Google sign-in was cancelled or failed");
    },
    flow: "implicit",
  });

  if (!token) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-sm mx-4">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight" aria-label="FyBud Admin">
              <span className="text-foreground">Fy</span>
              <span className="bg-[linear-gradient(110deg,#b8a7f5_0%,#8b7df0_45%,#5c4db5_70%,#b8a7f5_100%)] bg-[length:200%_auto] bg-clip-text text-transparent">
                Bud
              </span>
              <span className="text-foreground"> Admin</span>
            </h1>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-2xl">
            <h2 className="text-xl font-semibold text-foreground mb-2 text-center">Sign in</h2>
            <p className="text-muted-foreground text-sm mb-6 text-center">
              Use your company Google account to continue
            </p>

            {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 text-center">{error}</div>}

            <button
              onClick={() => googleLogin()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {loading ? "Signing in…" : "Continue with Google"}
            </button>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              Only authorized administrators can access this platform.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedOrg = organizations.find(o => o.id === selectedOrgId);
  const filteredOrgs = organizations.filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-background flex relative">
      {/* Sidebar */}
      <aside className="z-10 flex w-[4.75rem] shrink-0 flex-col border-r border-border bg-card">
        <div className="flex flex-col items-center gap-2 border-b border-border px-2 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <img src="/favicon.png" alt="FyBud" className="w-6 h-6 object-contain invert brightness-0" />
          </div>
          <span
            className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-foreground"
            title="Super Admin"
          >
            S.Admin
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          <p className="mb-1 px-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Work
          </p>
          <button
            onClick={() => setSelectedOrgId(null)}
            title="Organizations"
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 transition-colors ${
              !selectedOrgId
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Building className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Orgs</span>
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-border px-2 py-3">
          <button
            type="button"
            onClick={() => setIsDark(!isDark)}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="text-[10px] font-medium leading-none">Theme</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {!selectedOrgId ? (
          // ORGANIZATION LIST VIEW
          <div className="p-8 w-full">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
                <p className="text-muted-foreground mt-1">Manage and configure tenant environments</p>
              </div>
              <button 
                onClick={() => setShowNewOrg(!showNewOrg)} 
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" /> New Organization
              </button>
            </div>

            {showNewOrg && (
              <div className="mb-8 bg-card p-6 rounded-2xl shadow-sm border border-border">
                <h2 className="text-lg font-semibold mb-4 text-foreground">Add New Organization</h2>
                <form onSubmit={createOrganization} className="flex flex-col gap-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Company Name</label>
                      <input required value={newOrgName} onChange={e => setNewOrgName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Acme Corp" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Client Database URL</label>
                      <input required type="text" value={newOrgDbUrl} onChange={e => setNewOrgDbUrl(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="postgresql://user:password@host:5432/database" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
                      <input value={newOrgWebsite} onChange={e => setNewOrgWebsite(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="acme.com" />
                    </div>
                    <div>
                      <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
                        Create
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-visible relative">
              <div className="p-4 border-b border-border flex items-center justify-between bg-background/50">
                <div className="relative w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Search organizations..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="text-sm text-muted-foreground font-medium">
                  {filteredOrgs.length} {filteredOrgs.length === 1 ? 'result' : 'results'}
                </div>
              </div>

              {filteredOrgs.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredOrgs.map(org => (
                    <div key={org.id} className="p-4 flex items-center justify-between hover:bg-background transition-colors group">
                      <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedOrgId(org.id)}>
                        
                        <div>
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{org.name}</h3>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                            {org.websiteUrl && <span>{org.websiteUrl}</span>}
                            {org.websiteUrl && <span>&bull;</span>}
                            <span>DB: {org.dbName}</span>
                            <span>&bull;</span>
                            <span className={org.dbUrlConfigured ? "text-green-600" : "text-amber-500"}>
                              {org.dbUrlConfigured ? "Connected" : "Not Configured"}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenOrgId(menuOpenOrgId === org.id ? null : org.id);
                          }}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        
                        {menuOpenOrgId === org.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-card rounded-xl shadow-lg border border-border py-1 z-20">
                            <button 
                              onClick={() => {
                                setEditingOrgId(org.id);
                                setEditOrgName(org.name);
                                setEditOrgWebsite(org.websiteUrl || "");
                                setEditOrgDbUrl(org.dbUrl || "");
                                setMenuOpenOrgId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-background flex items-center gap-2"
                            >
                              <Edit2 className="w-4 h-4 text-muted-foreground" /> Edit Details
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedOrgId(org.id);
                                setMenuOpenOrgId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-background flex items-center gap-2"
                            >
                              <MonitorPlay className="w-4 h-4 text-muted-foreground" /> Open Dashboard
                            </button>
                            <div className="h-px bg-muted my-1 mx-2" />
                            <button 
                              onClick={() => {
                                deleteOrganization(org.id);
                                setMenuOpenOrgId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium"
                            >
                              <Trash2 className="w-4 h-4" /> Delete Organization
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground">
                  <Building className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No organizations found matching your search.</p>
                </div>
              )}
            </div>
          </div>
        ) : selectedOrg ? (
          // ORGANIZATION DETAIL VIEW
          <div className="p-8 w-full">
            <button 
              onClick={() => {
                setSelectedOrgId(null);
                setEditingOrgId(null);
              }}
              className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Organizations
            </button>
            <div className="bg-card rounded-2xl shadow-sm border border-border relative">
              <div className="p-6 border-b border-border bg-background/50">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-start gap-4">

                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-foreground">{selectedOrg.name}</h2>

                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedOrg.websiteUrl && <span className="mr-3">{selectedOrg.websiteUrl}</span>}
                        Database: <span className="font-medium text-foreground">{selectedOrg.dbName}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => activeTab === "features" ? fetchFeatures(selectedOrgId) : fetchSessions(selectedOrgId)}
                    disabled={loading}
                    className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-background transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Data
                  </button>
                </div>

                

                <div className="flex gap-2">
                  <button 
                    onClick={() => setActiveTab("features")} 
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === "features" ? "bg-card text-primary shadow-sm border border-border" : "text-slate-600 hover:bg-muted border border-transparent"}`}
                  >
                    <Key className="w-4 h-4" /> Feature Toggles
                  </button>
                  <button 
                    onClick={() => setActiveTab("sessions")} 
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === "sessions" ? "bg-card text-primary shadow-sm border border-border" : "text-slate-600 hover:bg-muted border border-transparent"}`}
                  >
                    <MonitorPlay className="w-4 h-4" /> Session Replays
                  </button>
                </div>
              </div>
              
              <div className="p-0 bg-card">
                {error && (
                  <div className="p-6 text-sm text-red-600 bg-red-50 border-b border-red-100">
                    {error}
                  </div>
                )}

                {activeTab === "features" && (
                  <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search features..."
                        value={featureSearchQuery}
                        onChange={(e) => setFeatureSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                )}
                {activeTab === "features" && (
                  <div className="divide-y divide-border">
                    {(() => {
                      const standardKeys = [
                        { key: "rrweb", description: "Enable RRWeb session recording" },
                        { key: "whatsapp_templates_enabled", description: "Enable WhatsApp Templates management page" },
                        { key: "whatsapp_template_injection_enabled", description: "Show 'Use template' button in WhatsApp chat — lets agents send approved templates during active conversations" },
                        { key: "instagram_human_agent_enabled", description: "Allow Instagram HUMAN_AGENT replies from CEP after 24h" },
                        { key: "broadcast_enabled", description: "Enable WhatsApp template broadcasting to multiple contacts at once" },
                        { key: "whatsapp_channel", description: "Enable WhatsApp channel" },
                        { key: "instagram_channel", description: "Enable Instagram channel" },
                        { key: "facebook_channel", description: "Enable Facebook channel" },
                        { key: "email_channel", description: "Enable Email channel" },
                        { key: "web_chat_channel", description: "Enable Web Chat channel (site embed widget)" },
                        { key: "intent_classifier_enabled", description: "Classify inbound into pre_purchase / order / post_purchase / noise (with subs). English + Hinglish." },
                        { key: "agentic_replies_enabled", description: "Auto-reply order/status from Shopify; auto-resolve noise. Other intents stay human-only." },
                      ];
                      
                      const allFeatures = [...features];
                      standardKeys.forEach(sk => {
                        if (!allFeatures.some(f => f.key === sk.key)) {
                          allFeatures.push({
                            key: sk.key,
                            enabled: false,
                            description: sk.description,
                            updatedAt: "",
                          });
                        }
                      });
                      
                      const featureLabels: Record<string, string> = {
                        "rrweb": "Session Replays",
                        "whatsapp_templates_enabled": "WhatsApp Templates",
                        "whatsapp_template_injection_enabled": "Send Template in Chat",
                        "instagram_human_agent_enabled": "Instagram Human Agent",
                        "broadcast_enabled": "WhatsApp Broadcasting",
                        "whatsapp_channel": "WhatsApp Channel",
                        "instagram_channel": "Instagram Channel",
                        "facebook_channel": "Facebook Channel",
                        "email_channel": "Email Channel",
                        "web_chat_channel": "Web Chat Channel",
                        "intent_classifier_enabled": "Intent Classifier",
                        "agentic_replies_enabled": "Agentic Replies",
                      };
                      
                      const filteredFeatures = allFeatures.filter(f => {
                        const q = featureSearchQuery.toLowerCase();
                        const label = featureLabels[f.key] ?? f.key;
                        return f.key.toLowerCase().includes(q) || label.toLowerCase().includes(q);
                      });
                      if (loading) {
                        return (
                          <div className="p-16 flex flex-col items-center justify-center text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
                            <p className="font-medium text-foreground">Loading features...</p>
                          </div>
                        );
                      }
                      
                      return (
                        <>
                          {filteredFeatures.length === 0 && !loading && !error && (
                            <div className="p-16 text-center text-muted-foreground">
                              <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                                <Key className="w-8 h-8 text-muted-foreground" />
                              </div>
                              <p className="font-medium text-foreground">No feature flags found</p>
                              <p className="text-sm mt-1">Try adjusting your search or add a new feature flag.</p>
                            </div>
                          )}
                          
                          {filteredFeatures.map((feature) => (
                            <div key={feature.key} className="p-6 flex items-center justify-between hover:bg-background/80 transition-colors group">
                              <div>
                                <h3 className="font-semibold text-foreground flex items-center gap-3">
                                  {featureLabels[feature.key] ?? feature.key}
                                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${feature.enabled ? "bg-green-50 text-green-700 border border-green-200" : "bg-muted text-muted-foreground border border-border"}`}>
                                    {feature.enabled ? "Active" : "Disabled"}
                                  </span>
                                </h3>
                              </div>
                              
                              <button
                                onClick={() => toggleFeature(feature.key, !feature.enabled)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${feature.enabled ? "bg-[#f38020]" : "bg-slate-200"}`}
                              >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out ${feature.enabled ? "translate-x-5" : "translate-x-0"}`} />
                              </button>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}

                {activeTab === "sessions" && (
                  <div className="divide-y divide-slate-100">
                    {sessions.length === 0 && !loading && !error && (
                      <div className="p-16 text-center text-muted-foreground">
                        <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                          <MonitorPlay className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="font-medium text-foreground">No session replays found</p>
                        <p className="text-sm mt-1">There are no recent sessions recorded for this organization.</p>
                      </div>
                    )}

                      {sessions.map((session) => {
                        const browserName = session.browser?.includes("Chrome") ? "Chrome" :
                                            session.browser?.includes("Safari") && !session.browser?.includes("Chrome") ? "Safari" :
                                            session.browser?.includes("Firefox") ? "Firefox" :
                                            session.browser?.includes("Edge") ? "Edge" : 
                                            "Browser";
                        return (
                          <div key={session.id} className="p-4 flex items-center justify-between hover:bg-muted/40 transition-colors group">
                            <div>
                              <h3 className="font-medium text-foreground text-sm flex items-center gap-2">
                                {session.userName || 'Anonymous User'}
                                {session.userEmail && <span className="text-muted-foreground font-normal text-xs">{session.userEmail}</span>}
                              </h3>
                              <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
                                <span>{new Date(session.createdAt).toLocaleString()}</span>
                                <span>&bull;</span>
                                <span>{browserName}</span>
                                <span>&bull;</span>
                                <span>{session._count.events} events</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => watchSession(session.id)}
                                disabled={session._count.events < 2}
                                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                              >
                                Watch
                              </button>
                              
                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSessionMenuOpenId(sessionMenuOpenId === session.id ? null : session.id); }}
                                  className="p-1.5 text-muted-foreground hover:bg-muted rounded-md transition-colors"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                                
                                {sessionMenuOpenId === session.id && (
                                  <div className="absolute right-0 mt-1 w-36 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-20 py-1">
                                    <button
                                      onClick={() => { downloadSession(session.id); setSessionMenuOpenId(null); }}
                                      className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
                                    >
                                      <Download className="w-4 h-4" /> Download
                                    </button>
                                    <button
                                      onClick={() => { setSessionToDelete(session.id); setSessionMenuOpenId(null); }}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center gap-2"
                                    >
                                      <Trash2 className="w-4 h-4" /> Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* rrweb Player Modal */}
      {playingSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-8">
          <div className="bg-background rounded-2xl shadow-2xl overflow-hidden w-full max-w-6xl flex flex-col border border-slate-700">
            <div className="p-4 border-b border-border flex items-center justify-between bg-card">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <MonitorPlay className="w-5 h-5 text-primary" />
                Session Replay Viewer
              </h3>
              <button 
                onClick={closePlayer}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors border border-transparent hover:border-border"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-8 flex-1 flex flex-col items-center justify-center min-h-[600px] bg-muted/50">
              {playingError ? (
                <div className="text-red-600 bg-red-50 p-6 rounded-xl border border-red-100 text-center max-w-md">
                  <p className="font-bold text-lg mb-2">Could not play session</p>
                  <p className="text-sm">{playingError}</p>
                </div>
              ) : (
                <div ref={playerRef} className="w-full h-full max-w-[1024px] max-h-[768px] bg-card rounded-xl shadow-sm border border-border overflow-hidden" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Organization Modal */}
      {editingOrgId && (
        (() => {
          const orgToEdit = organizations.find(o => o.id === editingOrgId);
          return orgToEdit ? (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-lg rounded-2xl shadow-lg border border-border overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                     Edit {orgToEdit.name}
                  </h3>
                  <button onClick={() => setEditingOrgId(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form onSubmit={updateOrganization} className="p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Organization Name</label>
                    <input required value={editOrgName} onChange={e => setEditOrgName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-background text-foreground" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Website URL</label>
                    <input value={editOrgWebsite} onChange={e => setEditOrgWebsite(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-background text-foreground" placeholder="acme.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Client Database URL</label>
                    <input type="text" required value={editOrgDbUrl} onChange={(e) => setEditOrgDbUrl(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-background text-foreground" placeholder="postgresql://user:password@host:5432/database" />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={() => setEditingOrgId(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Cancel
                    </button>
                    <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm">
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null;
        })()
      )}

      {/* Delete Session Modal */}
      {sessionToDelete && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-lg border border-border overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Session</h3>
              <p className="text-sm text-muted-foreground">Are you sure you want to delete this session? This action cannot be undone.</p>
            </div>
            <div className="p-4 border-t border-border bg-muted/30 flex justify-end gap-3">
              <button 
                onClick={() => setSessionToDelete(null)} 
                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteSession} 
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
