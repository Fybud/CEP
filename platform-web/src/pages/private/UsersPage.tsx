import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useOrgUsers,
  useCreateOrgUser,
  useUpdateOrgUser,
  useDeleteOrgUser,
  useTeams,
  type OrgUser,
  type UserRole,
} from "../../api";
import { useAuthStore } from "../../store/auth";
import {
  Users,
  Plus,
  X,
  User,
  Mail,
  Search,
  MoreVertical,
  Pencil,
  Power,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MANAGER: "Manager",
  AGENT: "Agent",
};

function allowedRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === "SUPER_ADMIN") return ["SUPER_ADMIN", "ADMIN", "MANAGER", "AGENT"];
  if (actorRole === "ADMIN") return ["MANAGER", "AGENT"];
  if (actorRole === "MANAGER") return ["AGENT"];
  return [];
}

function RoleBadge({ role }: { role: UserRole }) {
  const meta: Record<UserRole, string> = {
    SUPER_ADMIN: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
    ADMIN: "bg-blue-600 text-white",
    MANAGER: "bg-amber-500 text-white",
    AGENT: "bg-emerald-600 text-white",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${meta[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

function ActionsMenu({
  user,
  onEdit,
  onToggle,
  onDelete,
}: {
  user: OrgUser;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative flex justify-end" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-md border border-border bg-card shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggle();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted"
          >
            <Power className="w-3.5 h-3.5" />
            {user.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

interface CreateUserModalProps {
  actorRole: UserRole;
  actorTeamId?: string | null;
  onClose: () => void;
}
function CreateUserModal({ actorRole, actorTeamId, onClose }: CreateUserModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(actorRole === "MANAGER" ? "AGENT" : "AGENT");
  const [teamId, setTeamId] = useState(actorRole === "MANAGER" ? actorTeamId || "" : "");
  const createUser = useCreateOrgUser();
  const { data: teams = [] } = useTeams();
  const rolesAvailable = allowedRoles(actorRole);
  const showTeam = (role === "MANAGER" || role === "AGENT") && actorRole !== "MANAGER";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const u = await createUser.mutateAsync({
        name,
        email,
        role,
        teamId: actorRole === "MANAGER" ? actorTeamId || undefined : teamId || undefined,
      });
      toast.success(`User ${u.username} created`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Create User</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Add a member to your organization</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="new-user-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="e.g. Jane Doe"
                className={`${fieldClass} pl-10`}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Email *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="new-user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@company.com"
                className={`${fieldClass} pl-10`}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Role *</label>
            <div className="grid grid-cols-2 gap-2">
              {rolesAvailable.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs font-semibold transition-colors ${
                    role === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          {showTeam && (
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Team</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={fieldClass}>
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {actorRole === "MANAGER" && (
            <p className="text-xs text-muted-foreground">
              New agent will be added to your team automatically.
            </p>
          )}
          <div className="flex gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              id="create-user-submit"
              type="submit"
              disabled={createUser.isPending}
              className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createUser.isPending ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditUserModalProps {
  actorRole: UserRole;
  actorTeamId?: string | null;
  user: OrgUser;
  onClose: () => void;
}
function EditUserModal({ actorRole, actorTeamId, user, onClose }: EditUserModalProps) {
  const [name, setName] = useState(user.name || "");
  const [role, setRole] = useState<UserRole>(user.role);
  const [teamId, setTeamId] = useState(user.teamId || "");
  const updateUser = useUpdateOrgUser();
  const { data: teams = [] } = useTeams();
  const rolesAvailable = allowedRoles(actorRole);
  const showTeam = (role === "MANAGER" || role === "AGENT") && actorRole !== "MANAGER";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateUser.mutateAsync({
        id: user.id,
        name,
        role,
        teamId: actorRole === "MANAGER" ? actorTeamId || undefined : teamId || undefined,
      });
      toast.success(`User ${user.username} updated`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Edit User</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{user.username}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Doe" className={fieldClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={fieldClass}>
              {rolesAvailable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {showTeam && (
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Team</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={fieldClass}>
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              id="edit-user-submit"
              type="submit"
              disabled={updateUser.isPending}
              className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {updateUser.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UsersPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<OrgUser | null>(null);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const actor = useAuthStore((s) => s.user);
  const actorRole = (actor?.role ?? "AGENT") as UserRole;
  const { data: users = [], isLoading } = useOrgUsers();
  const { data: teams = [] } = useTeams();
  const updateUser = useUpdateOrgUser();
  const deleteUser = useDeleteOrgUser();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (actor?.id && u.id === actor.id) return false; // hide self
      if (teamFilter !== "ALL") {
        if (teamFilter === "NONE" && u.teamId) return false;
        if (teamFilter !== "NONE" && u.teamId !== teamFilter) return false;
      }
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter === "ACTIVE" && !u.isActive) return false;
      if (statusFilter === "INACTIVE" && u.isActive) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.team?.name || "").toLowerCase().includes(q)
      );
    });
  }, [users, search, teamFilter, roleFilter, statusFilter, actor?.id]);

  const handleToggleActive = async (user: OrgUser) => {
    try {
      await updateUser.mutateAsync({ id: user.id, isActive: !user.isActive });
      toast.success(`User ${user.isActive ? "deactivated" : "activated"}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteClick = (user: OrgUser) => {
    setDeletingUser(user);
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;
    try {
      await deleteUser.mutateAsync(deletingUser.id);
      toast.success("User deleted");
      setDeletingUser(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  const showTeamFilter = actorRole === "SUPER_ADMIN" || actorRole === "ADMIN";

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground leading-tight">Users & Roles</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} members</p>
        </div>
        {allowedRoles(actorRole).length > 0 && (
          <button
            id="invite-user-btn"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create User
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/50 px-6 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, role…"
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="ALL">All Roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="AGENT">Agent</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {showTeamFilter && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="ALL">All Teams</option>
            <option value="NONE">No Team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading users…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Users className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 text-left font-semibold rounded-tl-lg">User</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Team</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col min-w-0">
                        <span className="text-foreground text-sm font-semibold truncate">
                          {user.name || user.username.split("@")[0]}
                        </span>
                        <span className="text-muted-foreground text-xs truncate">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-foreground">
                      {user.team?.name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          user.isActive
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-500 text-white"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <ActionsMenu
                        user={user}
                        onEdit={() => setEditingUser(user)}
                        onToggle={() => handleToggleActive(user)}
                        onDelete={() => handleDeleteClick(user)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          actorRole={actorRole}
          actorTeamId={actor?.teamId}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editingUser && (
        <EditUserModal
          actorRole={actorRole}
          actorTeamId={actor?.teamId}
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(deletingUser)}
        title="Delete User"
        description={
          <>
            Are you sure you want to delete <strong>{deletingUser?.username}</strong>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete User"
        destructive={true}
        confirming={deleteUser.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  );
}
