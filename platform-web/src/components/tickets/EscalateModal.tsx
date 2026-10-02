import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, AlertTriangle, ArrowUpCircle } from "lucide-react";
import { useEscalateTicket, useTeams, useOrgUsers, type Ticket } from "../../api";
import { useAuthStore } from "../../store/auth";

interface EscalateModalProps {
  ticket: Ticket;
  onClose: () => void;
}

export function EscalateModal({ ticket, onClose }: EscalateModalProps) {
  const user = useAuthStore((s) => s.user);
  const isAgent = user?.role === "AGENT";
  const hasOwnTeam = !!user?.teamId;

  const [teamId, setTeamId] = useState(isAgent && hasOwnTeam ? user!.teamId! : ticket.teamId ?? "");
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  const escalate = useEscalateTicket();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useOrgUsers();

  // Agents escalate to Manager/Admin; Managers+ can pick anyone senior/peer
  const escalateTargets = useMemo(() => {
    return users.filter((u) => {
      if (!u.isActive) return false;
      if (u.id === user?.id) return false;
      if (isAgent) {
        return u.role === "MANAGER" || u.role === "ADMIN" || u.role === "SUPER_ADMIN";
      }
      return u.role === "MANAGER" || u.role === "ADMIN" || u.role === "SUPER_ADMIN" || u.role === "AGENT";
    });
  }, [users, isAgent, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isAgent) {
      if (!note.trim()) {
        toast.error("Add a reason for escalation");
        return;
      }
      if (!hasOwnTeam && !userId) {
        toast.error("Select a Manager or Admin to escalate to");
        return;
      }
      if (hasOwnTeam && !teamId && !userId) {
        toast.error("Escalate to your team queue, or pick a Manager/Admin");
        return;
      }
    } else if (!teamId && !userId) {
      toast.error("Select a team or user to escalate to");
      return;
    }

    try {
      await escalate.mutateAsync({
        id: ticket.id,
        teamId: userId ? undefined : teamId || undefined,
        targetUserId: userId || undefined,
        note: note.trim() || undefined,
      });
      toast.success(`Ticket #${ticket.number} escalated`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to escalate");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-foreground">Escalate Ticket #{ticket.number}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 px-3 py-2.5 text-xs text-orange-700 dark:text-orange-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {isAgent && !hasOwnTeam
                ? "You’re not on a team — escalate to any Manager or Admin. The ticket stays locked for you until they return it."
                : isAgent
                  ? "Escalate to your team manager queue, or directly to a Manager/Admin. You’ll have read-only access until it’s returned."
                  : "Status becomes ESCALATED and the target team or person is notified."}
            </span>
          </div>

          {isAgent && hasOwnTeam && (
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Team queue (your manager)
              </label>
              <select
                id="escalate-team"
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  if (e.target.value) setUserId("");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— select team —</option>
                {teams
                  .filter((t) => t.id === user?.teamId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {!isAgent && (
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Escalate to Team Queue</label>
              <select
                id="escalate-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— select team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">
              {isAgent && !hasOwnTeam
                ? "Escalate to Manager / Admin *"
                : isAgent
                  ? "Or escalate to a person (optional)"
                  : "Escalate to User (optional)"}
            </label>
            <select
              id="escalate-user"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                if (e.target.value && isAgent) setTeamId("");
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">— select user —</option>
              {escalateTargets.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.name || u.username.split("@")[0])} · {u.role.replace("_", " ")}
                  {u.team?.name ? ` · ${u.team.name}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">
              Reason / Note{isAgent ? " *" : ""}
            </label>
            <textarea
              id="escalate-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              required={isAgent}
              placeholder="Describe why this ticket needs escalation…"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              id="escalate-submit"
              type="submit"
              disabled={escalate.isPending}
              className="flex-1 rounded-md bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {escalate.isPending ? "Escalating…" : "Escalate Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
