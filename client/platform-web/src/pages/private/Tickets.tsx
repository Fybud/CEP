import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  useTickets,
  useUpdateTicketStatus,
  useTeams,
  useOrgUsers,
  type Ticket,
  type TicketStatus,
  type TicketPriority,
} from "../../api";
import { useAuthStore } from "../../store/auth";
import { formatDistanceToNow } from "date-fns";
import { Search, ChevronDown, X, Inbox, Filter } from "lucide-react";

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  OPEN: { label: "Open", bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/20" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/20" },
  ESCALATED: { label: "Escalated", bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", border: "border-orange-500/20" },
  RESOLVED: { label: "Resolved", bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/20" },
  CLOSED: { label: "Closed", bg: "bg-slate-500/10", text: "text-slate-700 dark:text-slate-400", border: "border-slate-500/20" },
};

const PRIORITY_CONFIG: Record<
  TicketPriority,
  { label: string; bg: string; text: string; border: string }
> = {
  LOW: { label: "Low", bg: "bg-slate-500", text: "text-white", border: "border-slate-600" },
  MEDIUM: { label: "Medium", bg: "bg-blue-600", text: "text-white", border: "border-blue-700" },
  HIGH: { label: "High", bg: "bg-amber-600", text: "text-white", border: "border-amber-700" },
  URGENT: { label: "Urgent", bg: "bg-red-600", text: "text-white", border: "border-red-700" },
};

const STATUS_FILTERS: Array<TicketStatus | "ALL"> = [
  "ALL",
  "OPEN",
  "IN_PROGRESS",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
];

const filterSelectClass =
  "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

function TicketStatusMenu({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateTicketStatus();
  const user = useAuthStore((s) => s.user);

  const handleChange = async (status: TicketStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    try {
      await update.mutateAsync({ id: ticket.id, status });
      toast.success(`Status → ${STATUS_CONFIG[status].label}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const allowedStatuses = (Object.keys(STATUS_CONFIG) as TicketStatus[]).filter((s) => {
    if (s === "ESCALATED") return false;
    if (user?.role === "AGENT" && s === "CLOSED") return false;
    return true;
  });

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex items-center gap-1 rounded-md transition-opacity hover:opacity-80"
      >
        <StatusBadge status={ticket.status} />
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-md border border-border bg-card shadow-lg overflow-hidden">
            {allowedStatuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={(e) => handleChange(s, e)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted transition-colors"
              >
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TicketsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("OPEN");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");

  const user = useAuthStore((s) => s.user);
  const hasPersonalTeam = user?.role === "MANAGER" || user?.role === "AGENT";
  const canFilterTeams =
    user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "MANAGER";
  const { data: teams = [] } = useTeams();
  const { data: orgUsers = [] } = useOrgUsers();

  const { data: tickets, isLoading } = useTickets({
    status: statusFilter !== "ALL" ? statusFilter : undefined,
    priority: priorityFilter !== "ALL" ? (priorityFilter as TicketPriority) : undefined,
    assigneeId: assigneeFilter !== "ALL" ? assigneeFilter : undefined,
    teamId: teamFilter !== "ALL" ? teamFilter : undefined,
    search: search.trim() || undefined,
  });

  const assignablePeople = useMemo(
    () =>
      orgUsers.filter(
        (u) => (u.role === "AGENT" || u.role === "MANAGER") && u.isActive,
      ),
    [orgUsers],
  );

  const activeFilterCount = [
    statusFilter !== "OPEN" && statusFilter !== "ALL",
    priorityFilter !== "ALL",
    assigneeFilter !== "ALL",
    teamFilter !== "ALL",
    search.trim().length > 0,
  ].filter(Boolean).length;

  const extraFilterCount = [
    priorityFilter !== "ALL",
    assigneeFilter !== "ALL",
    teamFilter !== "ALL",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter("OPEN");
    setPriorityFilter("ALL");
    setAssigneeFilter("ALL");
    setTeamFilter("ALL");
    setSearch("");
  };

  const handleMyTickets = () => {
    setStatusFilter("ALL");
    setAssigneeFilter(user?.id ?? "ALL");
    setTeamFilter("ALL");
    setPriorityFilter("ALL");
  };

  const handleMyTeam = () => {
    setStatusFilter("ALL");
    setAssigneeFilter("ALL");
    setPriorityFilter("ALL");
    if (user?.teamId) setTeamFilter(user.teamId);
  };

  const isMyTickets = assigneeFilter === user?.id && teamFilter === "ALL";
  const isMyTeam = hasPersonalTeam && teamFilter === user?.teamId && assigneeFilter === "ALL";

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground leading-tight">Tickets</h1>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${tickets?.length ?? 0} ticket${(tickets?.length ?? 0) === 1 ? "" : "s"}`}
            {" · "}Create tickets from Inbox
          </p>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex gap-1.5 border-b border-border bg-card/50 px-6 py-2.5 overflow-x-auto shrink-0">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3 bg-card/30 shrink-0">
        <button
          type="button"
          onClick={handleMyTickets}
          className={`inline-flex items-center rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
            isMyTickets
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          My tickets
        </button>
        {hasPersonalTeam && (
          <button
            type="button"
            onClick={handleMyTeam}
            className={`inline-flex items-center rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              isMyTeam
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            My team
          </button>
        )}

        <div className="hidden sm:block h-5 w-px bg-border" />

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            id="ticket-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, customer…"
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
            showFilters || extraFilterCount > 0
              ? "bg-primary/10 text-primary border border-primary/20"
              : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters {extraFilterCount > 0 && `(${extraFilterCount})`}
        </button>

        {showFilters && (
          <>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className={filterSelectClass}
            >
              <option value="ALL">All assignees</option>
              {assignablePeople.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.username.split("@")[0]}
                </option>
              ))}
            </select>

            {canFilterTeams && (
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="ALL">All teams</option>
                <option value="NONE">Open pool (no team)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={filterSelectClass}
            >
              <option value="ALL">All priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </>
        )}

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Loading tickets…
          </div>
        ) : !tickets?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="mb-3 text-muted-foreground/40">
              <Inbox className="w-10 h-10" />
            </div>
            <p className="text-sm font-semibold text-foreground">No tickets found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Try another status or clear filters. Create tickets from a conversation in Inbox.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold w-14">#</th>
                  <th className="px-4 py-3 text-left font-semibold">Subject</th>
                  <th className="px-4 py-3 text-left font-semibold w-40">Status</th>
                  <th className="px-4 py-3 text-left font-semibold w-28">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold w-32">Team</th>
                  <th className="px-4 py-3 text-left font-semibold w-36">Assignee</th>
                  <th className="px-4 py-3 text-left font-semibold w-36">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 align-middle font-mono text-xs font-semibold text-muted-foreground">
                      #{ticket.number}
                    </td>
                    <td className="px-4 py-3 align-middle max-w-[280px]">
                      <p className="font-semibold text-foreground truncate leading-snug">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ticket.customer?.name || "No customer"}
                        {ticket.channel ? ` · ${ticket.channel}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <TicketStatusMenu ticket={ticket} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-foreground">
                      {ticket.team?.name ?? <span className="text-muted-foreground">Open pool</span>}
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-foreground">
                      {ticket.assignee?.username?.split("@")[0] ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col divide-y divide-border">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="p-4 hover:bg-muted/40 transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground line-clamp-2 leading-snug">{ticket.subject}</p>
                    <span className="font-mono text-xs font-semibold text-muted-foreground shrink-0">#{ticket.number}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div onClick={(e) => e.stopPropagation()}><TicketStatusMenu ticket={ticket} /></div>
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span className="truncate">
                      {ticket.customer?.name || "No customer"}
                      {ticket.channel ? ` · ${ticket.channel}` : ""}
                    </span>
                    <span className="shrink-0 ml-2">{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
