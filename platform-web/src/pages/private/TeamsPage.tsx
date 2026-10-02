import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTeams, useTeam, useOrgUsers, type UserRole } from "../../api";
import { useAuthStore } from "../../store/auth";
import {
  Building2,
  Plus,
  X,
  Users,
  ChevronRight,
  ArrowLeft,
  Search,
  ShieldCheck,
  Shield,
  Briefcase,
  Headphones,
} from "lucide-react";

const ROLE_META: Record<UserRole, { label: string; icon: React.ReactNode; className: string }> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
    className: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
  },
  ADMIN: {
    label: "Admin",
    icon: <Shield className="w-3.5 h-3.5" />,
    className: "bg-blue-600 text-white",
  },
  MANAGER: {
    label: "Manager",
    icon: <Briefcase className="w-3.5 h-3.5" />,
    className: "bg-amber-500 text-white",
  },
  AGENT: {
    label: "Agent",
    icon: <Headphones className="w-3.5 h-3.5" />,
    className: "bg-emerald-600 text-white",
  },
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiPost(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error ?? `${res.status}`);
  }
  return res.json();
}

interface CreateTeamModalProps {
  token: string;
  onClose: () => void;
  onCreated: () => void;
}
function CreateTeamModal({ token, onClose, onCreated }: CreateTeamModalProps) {
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: users = [] } = useOrgUsers();
  const { data: teams = [] } = useTeams();

  // Managers who already manage a team cannot be assigned to another
  const assignedManagerIds = useMemo(
    () => new Set(teams.map((t) => t.managerId).filter(Boolean) as string[]),
    [teams],
  );
  const managers = users.filter(
    (u) => u.role === "MANAGER" && u.isActive && !assignedManagerIds.has(u.id),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/v1/teams", { name, managerId: managerId || undefined }, token);
      toast.success(`Team "${name}" created`);
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Create Team</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Team Name *</label>
            <input
              id="team-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. L1 Support, Billing"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Manager</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">No manager</option>
              {managers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.username}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Each team has one manager. Managers already assigned to a team are hidden.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              id="create-team-submit"
              type="submit"
              disabled={loading}
              className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamMembersView({ teamId, onBack }: { teamId: string; onBack?: () => void }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const { data: detail, isLoading: detailLoading } = useTeam(teamId);
  const { data: orgUsers = [], isLoading: usersLoading } = useOrgUsers();

  const teamFromList = teams.find((t) => t.id === teamId);
  const team = detail ?? teamFromList;
  const isLoading = (detailLoading || teamsLoading || usersLoading) && !team;

  const members = useMemo(() => {
    const fromDetail = detail?.members;
    const fromOrg = orgUsers
      .filter((u) => u.teamId === teamId)
      .map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      }));
    const base = fromDetail && fromDetail.length > 0 ? fromDetail : fromOrg;
    const q = search.trim().toLowerCase();
    return base.filter((m) => {
      if (roleFilter !== "ALL" && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.username.toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });
  }, [detail?.members, orgUsers, teamId, search, roleFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading members…</div>
    );
  }
  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Building2 className="w-8 h-8 opacity-30" />
        <p className="text-sm">Team not found</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Back to teams
          </button>
        )}
      </div>
    );
  }

  const managerLabel = team.manager
    ? team.manager.name || team.manager.username
    : null;

  return (
    <div className="flex flex-col h-full bg-background">
        <div className="flex items-center gap-3 border-b border-border bg-card px-6 py-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Back to teams"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-foreground leading-tight truncate">{team.name}</h1>
          <p className="text-xs text-muted-foreground">
            {members.length} member{members.length === 1 ? "" : "s"}
            {managerLabel ? ` · Manager: ${managerLabel}` : ""}
            {team._count?.tickets != null ? ` · ${team._count.tickets} tickets` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/50 px-6 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, role…"
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "ALL" | UserRole)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="ALL">All Roles</option>
          <option value="MANAGER">Manager</option>
          <option value="AGENT">Agent</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Users className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-medium text-foreground">No members found</p>
            <p className="text-xs mt-1">Assign users to this team from Users & Roles.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 text-left font-semibold rounded-tl-lg">Member</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold rounded-tr-lg">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const roleMeta = ROLE_META[m.role as UserRole];
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground truncate">
                            {m.name || m.username.split("@")[0]}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">{m.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {roleMeta ? (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${roleMeta.className}`}
                          >
                            {roleMeta.icon}
                            {roleMeta.label}
                          </span>
                        ) : (
                          <span className="text-xs font-medium">{m.role.replace("_", " ")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                            m.isActive ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"
                          }`}
                        >
                          {m.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function TeamsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const user = useAuthStore((s) => s.user);
  const isManager = user?.role === "MANAGER";
  const canCreate = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const { data: teams = [], isLoading, refetch } = useTeams();

  const token = (() => {
    try {
      return (JSON.parse(localStorage.getItem("cep-auth-store") ?? "{}") as any)?.state?.token ?? "";
    } catch {
      return "";
    }
  })();

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.manager?.name || "").toLowerCase().includes(q) ||
        (t.manager?.username || "").toLowerCase().includes(q),
    );
  }, [teams, search]);

  // Manager: jump straight into their team members view
  useEffect(() => {
    if (!isManager) return;
    if (user?.teamId) {
      setSelectedTeamId(user.teamId);
      return;
    }
    if (teams.length === 1) setSelectedTeamId(teams[0]!.id);
  }, [isManager, user?.teamId, teams]);

  if (selectedTeamId) {
    return (
      <TeamMembersView
        teamId={selectedTeamId}
        onBack={isManager ? undefined : () => setSelectedTeamId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground leading-tight">Teams</h1>
          <p className="text-xs text-muted-foreground">
            {filteredTeams.length} team{filteredTeams.length === 1 ? "" : "s"}
          </p>
        </div>
        {canCreate && (
          <button
            id="create-team-btn"
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Team
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/50 px-6 py-3 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams or managers…"
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading teams…</div>
        ) : filteredTeams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center">
            <Building2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-medium text-foreground">
              {teams.length === 0
                ? isManager
                  ? "You are not assigned to a team"
                  : "No teams yet"
                : "No teams match your search"}
            </p>
            {canCreate && teams.length === 0 && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" />
                New Team
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 text-left font-semibold">Team</th>
                  <th className="px-4 py-3 text-left font-semibold">Manager</th>
                  <th className="px-4 py-3 text-left font-semibold">Members</th>
                  <th className="px-4 py-3 text-left font-semibold">Tickets</th>
                  <th className="px-4 py-3 text-right font-semibold w-12" />
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team) => (
                  <tr
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-foreground">{team.name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-foreground">
                      {team.manager ? (
                        team.manager.name || team.manager.username
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                        {team._count?.members ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-foreground">
                      {team._count?.tickets ?? 0}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <ChevronRight className="w-4 h-4 text-muted-foreground inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && canCreate && (
        <CreateTeamModal token={token} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
      )}
    </div>
  );
}
