import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TicketIcon, X, Link2, UserRound, Users } from "lucide-react";
import { useCreateTicket, useTeams, useOrgUsers, type TicketPriority } from "../../api";
import { useAuthStore } from "../../store/auth";

interface CreateTicketModalProps {
  conversationId?: string;
  customerId?: string;
  channel?: string;
  defaultSubject?: string;
  onClose: () => void;
}

type AssignMode = "none" | "person" | "team";

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

export function CreateTicketModal({
  conversationId,
  customerId,
  channel,
  defaultSubject,
  onClose,
}: CreateTicketModalProps) {
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [assignMode, setAssignMode] = useState<AssignMode>("none");
  const [personId, setPersonId] = useState("");
  const [teamId, setTeamId] = useState("");

  const createTicket = useCreateTicket();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useOrgUsers();
  const user = useAuthStore((s) => s.user);

  const isAdminOrAbove = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isManager = user?.role === "MANAGER";
  const canAssign = true;

  // Only Managers + Agents — never Super Admin / Admin
  const assignablePeople = useMemo(() => {
    return users
      .filter((u) => {
        if (u.role !== "MANAGER" && u.role !== "AGENT") return false;
        if (!u.isActive) return false;
        if (isManager) return u.teamId === user?.teamId;
        return true;
      })
      .map((u) => ({
        id: u.id,
        teamId: u.teamId ?? null,
        label: `${u.name || u.username.split("@")[0]}${u.team?.name ? ` — ${u.team.name}` : ""}`,
      }));
  }, [users, isManager, user?.teamId]);

  const visibleTeams = useMemo(() => {
    if (isManager && user?.teamId) {
      return teams.filter((t) => t.id === user.teamId);
    }
    return teams;
  }, [teams, isManager, user?.teamId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;

    let finalTeamId: string | undefined;
    let finalAssignedTo: string | undefined;

    if (assignMode === "person") {
      if (!personId) {
        toast.error("Select a person to assign");
        return;
      }
      finalAssignedTo = personId;
      // Team is implied by the person — store silently for queue context
      finalTeamId = assignablePeople.find((p) => p.id === personId)?.teamId || undefined;
    } else if (assignMode === "team") {
      if (!teamId) {
        toast.error("Select a team queue");
        return;
      }
      // Team queue only — no individual assignee (agents can claim)
      finalTeamId = teamId;
      finalAssignedTo = undefined;
    }

    try {
      const ticket = await createTicket.mutateAsync({
        subject: subject.trim(),
        description: description.trim() || undefined,
        conversationId,
        customerId,
        channel,
        priority,
        teamId: finalTeamId,
        assignedTo: finalAssignedTo,
      });
      toast.success(`Ticket #${ticket.number} created`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create ticket");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TicketIcon className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Create Ticket</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {conversationId && (
            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              Linked to current conversation
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Subject *</label>
            <input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              autoFocus
              placeholder="Brief description of the issue"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Description</label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="More detail about the issue (optional)"
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Priority</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`rounded-md border py-2 text-xs font-semibold transition-colors ${
                    priority === opt.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignment: Manager+ only. Agents auto-assign to self on the server. */}
          {canAssign ? (
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Assign</label>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {(
                [
                  { id: "none" as const, label: isAdminOrAbove ? "Open pool" : "Unassigned" },
                  { id: "person" as const, label: "Person" },
                  { id: "team" as const, label: "Team queue" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setAssignMode(opt.id);
                    setPersonId("");
                    setTeamId("");
                  }}
                  className={`rounded-md border py-2 text-xs font-semibold transition-colors ${
                    assignMode === opt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {assignMode === "person" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <UserRound className="w-3.5 h-3.5" />
                  Assignee (Managers & Agents)
                </label>
                <select
                  id="ticket-person"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  className={fieldClass}
                  required
                >
                  <option value="">Select person…</option>
                  {assignablePeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Team is taken from the person — no separate team needed.
                </p>
              </div>
            )}

            {assignMode === "team" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Team queue
                </label>
                <select
                  id="ticket-team"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className={fieldClass}
                  required
                >
                  <option value="">Select team…</option>
                  {visibleTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Open for any agent on that team to claim — no individual assignee.
                </p>
              </div>
            )}

            {assignMode === "none" && (
              <p className="text-[11px] text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
                {isAdminOrAbove
                  ? "Open pool: no team and no assignee — any agent can claim it."
                  : "Stays on your team as an open queue item until someone claims it."}
              </p>
            )}
          </div>
          ) : null}

          <div className="flex gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              id="create-ticket-submit"
              type="submit"
              disabled={createTicket.isPending || !subject.trim()}
              className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createTicket.isPending ? "Creating…" : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
