import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  useTicket,
  useUpdateTicketStatus,
  useUpdateTicket,
  useAssignTicket,
  useAddTicketNote,
  useReturnTicket,
  useTicketEvents,
  useTeams,
  useOrgUsers,
  useMessages,
  type TicketStatus,
  type TicketPriority,
} from "../../api";
import { useAppStore } from "../../store";
import { useAuthStore } from "../../store/auth";
import { EscalateModal } from "../../components/tickets/EscalateModal";
import {
  ArrowLeft,
  ArrowUpCircle,
  ArrowDownCircle,
  MessageSquare,
  ChevronDown,
  Send,
  Loader2,
  Lock,
  UserPlus,
  ExternalLink,
  StickyNote,
} from "lucide-react";

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string; border: string }> = {
  OPEN: { label: "Open", bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/20" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/20" },
  ESCALATED: { label: "Escalated", bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", border: "border-orange-500/20" },
  RESOLVED: { label: "Resolved", bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/20" },
  CLOSED: { label: "Closed", bg: "bg-slate-500/10", text: "text-slate-700 dark:text-slate-400", border: "border-slate-500/20" },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; bg: string; text: string; border: string }> = {
  LOW: { label: "Low", bg: "bg-slate-500", text: "text-white", border: "border-slate-600" },
  MEDIUM: { label: "Medium", bg: "bg-blue-600", text: "text-white", border: "border-blue-700" },
  HIGH: { label: "High", bg: "bg-amber-600", text: "text-white", border: "border-amber-700" },
  URGENT: { label: "Urgent", bg: "bg-red-600", text: "text-white", border: "border-red-700" },
};

const EVENT_META: Record<string, { label: string }> = {
  CREATED: { label: "Ticket created" },
  ASSIGNED: { label: "Assigned" },
  REASSIGNED: { label: "Reassigned" },
  STATUS_CHANGED: { label: "Status changed" },
  PRIORITY_CHANGED: { label: "Priority changed" },
  TEAM_CHANGED: { label: "Team changed" },
  ESCALATED: { label: "Escalated" },
  RETURNED: { label: "Returned to agent" },
  NOTE_ADDED: { label: "Note added" },
  REPLIED: { label: "Reply sent" },
  RESOLVED: { label: "Resolved" },
  CLOSED: { label: "Closed" },
  REOPENED: { label: "Reopened" },
};

const controlTriggerClass =
  "flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-50";
const selectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function initials(name?: string | null, fallback = "?") {
  const s = (name || "").trim();
  if (!s) return fallback.slice(0, 2).toUpperCase();
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [showEscalate, setShowEscalate] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"NOTES" | "THREAD">("NOTES");

  const { data: ticket, isLoading } = useTicket(id);
  const { data: events = [] } = useTicketEvents(id);
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useOrgUsers();

  const updateStatus = useUpdateTicketStatus();
  const updateTicket = useUpdateTicket();
  const assignTicket = useAssignTicket();
  const addNote = useAddTicketNote();
  const returnTicket = useReturnTicket();
  const setSelectedContactId = useAppStore((s) => s.setSelectedContactId);

  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    activeTab === "THREAD" && ticket?.conversationId ? ticket.conversationId : undefined,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading ticket…
      </div>
    );
  }
  if (!ticket) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Ticket not found</div>;
  }

  const isEscalated = ticket.status === "ESCALATED";
  const isAgent = user?.role === "AGENT";
  const isManagerOrAbove =
    user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isAdminOrAbove = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isLocked = isEscalated && isAgent;
  const statusCfg = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];

  const agentUsers = users.filter((u) => {
    if (u.role !== "AGENT" && u.role !== "MANAGER") return false;
    if (!u.isActive) return false;
    if (isAdminOrAbove) return true;
    if (isManagerOrAbove && !isAdminOrAbove) return u.teamId === user?.teamId;
    return u.id === user?.id;
  });

  const allowedStatuses = (Object.keys(STATUS_CONFIG) as TicketStatus[]).filter((s) => {
    if (s === "ESCALATED") return false;
    if (isAgent) {
      const transitions: Record<string, string[]> = {
        OPEN: ["IN_PROGRESS"],
        IN_PROGRESS: ["OPEN", "RESOLVED"],
        ESCALATED: [],
        RESOLVED: ["OPEN"],
        CLOSED: [],
      };
      return (transitions[ticket.status] ?? []).includes(s);
    }
    return true;
  });

  const handleStatusChange = async (status: TicketStatus) => {
    setStatusOpen(false);
    try {
      await updateStatus.mutateAsync({ id: ticket.id, status });
      toast.success(`Status → ${STATUS_CONFIG[status].label}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePriorityChange = async (priority: TicketPriority) => {
    setPriorityOpen(false);
    try {
      await updateTicket.mutateAsync({ id: ticket.id, priority });
      toast.success(`Priority → ${PRIORITY_CONFIG[priority].label}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addNote.mutateAsync({ id: ticket.id, body: noteText });
      setNoteText("");
      toast.success("Note added");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReturn = async () => {
    try {
      await returnTicket.mutateAsync({ id: ticket.id });
      toast.success("Ticket returned to agent");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const customerLabel = ticket.customer?.name || "Unknown customer";
  const noteCount = ticket.notes?.length ?? 0;
  const isOpenPool = !ticket.assignedTo && !ticket.teamId;
  const canClaim =
    isAgent &&
    !isLocked &&
    !ticket.assignedTo &&
    (isOpenPool || ticket.teamId === user?.teamId);

  const handleClaim = async () => {
    try {
      await assignTicket.mutateAsync({
        id: ticket.id,
        assigneeId: user!.id,
        teamId: user?.teamId ?? "",
      });
      toast.success("Ticket claimed");
    } catch (err: any) {
      toast.error(err.message || "Failed to claim");
    }
  };

  const openInbox = () => {
    if (ticket.customerId) {
      setSelectedContactId(ticket.customerId);
      navigate("/inbox");
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 shrink-0">
        <button
          type="button"
          onClick={() => navigate("/tickets")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back to tickets"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-muted-foreground">#{ticket.number}</span>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
              {statusCfg.label}
            </span>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}>
              {priorityCfg.label}
            </span>
            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                <Lock className="w-3 h-3" /> Read only
              </span>
            )}
          </div>
          <h1 className="text-sm font-semibold text-foreground truncate mt-1">{ticket.subject}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-center">
          {ticket.conversationId && (
            <button
              type="button"
              onClick={openInbox}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Reply in Inbox
            </button>
          )}
          {canClaim && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={assignTicket.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Claim
            </button>
          )}
          {isEscalated && isManagerOrAbove && (
            <button
              type="button"
              onClick={handleReturn}
              disabled={returnTicket.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              Return
            </button>
          )}
          {!isLocked && ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && !isEscalated && (
            <button
              type="button"
              onClick={() => setShowEscalate(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              Escalate
            </button>
          )}
        </div>
      </header>

      {/* Main: left customer | center thread | right props */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT — Customer */}
        <aside className="w-[240px] shrink-0 border-r border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-base font-bold">
                {initials(ticket.customer?.name, ticket.customerId || "CU")}
              </div>
              <div className="min-w-0 w-full">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                <p className="text-sm font-semibold text-foreground break-words mt-0.5" title={customerLabel}>
                  {customerLabel}
                </p>
              </div>
            </div>

            {ticket.conversationId && (
              <button
                type="button"
                onClick={openInbox}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Open in Inbox
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {ticket.channel && (
              <MetaRow label="Channel">
                <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                  {ticket.channel}
                </span>
              </MetaRow>
            )}

            <MetaRow label="Created">
              <p className="text-xs font-medium text-foreground">
                {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
              </p>
              {ticket.creator && (
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{ticket.creator.username}</p>
              )}
            </MetaRow>

            {(ticket.team || ticket.assignee) && (
              <MetaRow label="Queue">
                <p className="text-xs text-foreground">
                  {ticket.assignee
                    ? ticket.assignee.username.split("@")[0]
                    : ticket.team
                      ? `${ticket.team.name} queue`
                      : "Open pool"}
                </p>
              </MetaRow>
            )}

            {ticket.description && (
              <MetaRow label="Description">
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
              </MetaRow>
            )}
          </div>
        </aside>

        {/* CENTER — Notes / thread + bottom composer */}
        <section className="flex-1 flex flex-col min-w-0 min-h-0 border-r border-border">
          <div className="flex items-center gap-0 border-b border-border bg-card px-2 shrink-0">
            <TabButton active={activeTab === "NOTES"} onClick={() => setActiveTab("NOTES")} count={noteCount}>
              Internal notes
            </TabButton>
            {ticket.conversationId && (
              <TabButton active={activeTab === "THREAD"} onClick={() => setActiveTab("THREAD")}>
                Customer thread
              </TabButton>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {activeTab === "NOTES" ? (
              !ticket.notes || ticket.notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-center">
                  <StickyNote className="w-7 h-7 text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium text-foreground">No notes yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Private to your team — never sent to the customer.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ticket.notes.map((note) => (
                    <article key={note.id} className="rounded-lg border border-border bg-card p-3.5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                          {initials(note.author?.username)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{note.author?.username ?? "Unknown"}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {note.isInternal && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                            <Lock className="w-2.5 h-2.5" />
                            Internal
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note.body}</p>
                    </article>
                  ))}
                </div>
              )
            ) : messagesLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-center">
                <MessageSquare className="w-7 h-7 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-medium">No messages</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[85%] ${
                      msg.direction === "outgoing" ? "ml-auto items-end" : "mr-auto items-start"
                    }`}
                  >
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.direction === "outgoing"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card border border-border rounded-bl-md"
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom bar — note composer */}
          {activeTab === "NOTES" && (
            <div className="shrink-0 border-t border-border bg-card px-4 py-3">
              {isLocked ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2.5 text-xs font-medium text-foreground text-center">
                  Escalated — notes disabled until a manager returns this ticket.
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <textarea
                    id="note-input"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleAddNote();
                      }
                    }}
                    rows={1}
                    placeholder="Add an internal note… (never sent to customer)"
                    className="flex-1 min-w-0 min-h-[40px] max-h-28 resize-y rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    id="add-note-btn"
                    type="button"
                    onClick={handleAddNote}
                    disabled={addNote.isPending || !noteText.trim()}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    {addNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Add
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT — Controls */}
        <aside className="w-[260px] shrink-0 bg-muted/20 overflow-y-auto">
          <div className="p-3 space-y-2">
            {!isLocked && (
              <ControlBlock label="Status">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusOpen(!statusOpen)}
                    disabled={allowedStatuses.length === 0}
                    className={controlTriggerClass}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      >
                        {statusCfg.label}
                      </span>
                    </span>
                    {allowedStatuses.length > 0 && <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  {statusOpen && allowedStatuses.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-md border border-border bg-card shadow-lg overflow-hidden py-1">
                        {allowedStatuses.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleStatusChange(s)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} ${STATUS_CONFIG[s].border}`}
                            >
                              {STATUS_CONFIG[s].label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </ControlBlock>
            )}

            <ControlBlock label="Priority">
              {isLocked || isAgent ? (
                <span
                  className={`inline-flex rounded-md border px-2.5 py-1.5 text-xs font-semibold ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}
                >
                  {priorityCfg.label}
                </span>
              ) : (
                <div className="relative">
                  <button type="button" onClick={() => setPriorityOpen(!priorityOpen)} className={controlTriggerClass}>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}
                    >
                      {priorityCfg.label}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {priorityOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setPriorityOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-md border border-border bg-card shadow-lg overflow-hidden py-1">
                        {(Object.keys(PRIORITY_CONFIG) as TicketPriority[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handlePriorityChange(p)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].text} ${PRIORITY_CONFIG[p].border}`}
                            >
                              {PRIORITY_CONFIG[p].label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </ControlBlock>

            <ControlBlock label="Assign to">
              {isOpenPool && !ticket.assignedTo && (
                <p className="text-[11px] text-muted-foreground mb-2">Open pool — any agent can claim.</p>
              )}
              {isLocked ? (
                <p className="text-xs font-medium text-foreground">
                  {ticket.assignee?.username ?? (ticket.team ? `Queue: ${ticket.team.name}` : "Unassigned")}
                </p>
              ) : isAgent ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    {ticket.assignedTo === user?.id
                      ? "You"
                      : ticket.assignee?.username ??
                        (ticket.team ? `Queue: ${ticket.team.name}` : "Unassigned")}
                  </p>
                  {canClaim && (
                    <button
                      type="button"
                      onClick={handleClaim}
                      disabled={assignTicket.isPending}
                      className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Claim this ticket
                    </button>
                  )}
                  {ticket.assignedTo === user?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        assignTicket
                          .mutateAsync({ id: ticket.id, assigneeId: "", teamId: ticket.teamId ?? "" })
                          .then(() => toast.success("Released to queue"))
                          .catch((err: any) => toast.error(err.message));
                      }}
                      disabled={assignTicket.isPending}
                      className="w-full rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      Release back to queue
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={
                    ticket.assignedTo
                      ? `user:${ticket.assignedTo}`
                      : ticket.teamId
                        ? `team:${ticket.teamId}`
                        : "unassigned"
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    let tId: string | undefined;
                    let aId: string | undefined;
                    if (val.startsWith("team:")) {
                      tId = val.replace("team:", "");
                    } else if (val.startsWith("user:")) {
                      aId = val.replace("user:", "");
                      tId = agentUsers.find((u) => u.id === aId)?.teamId || undefined;
                    }
                    assignTicket
                      .mutateAsync({ id: ticket.id, assigneeId: aId ?? "", teamId: tId ?? "" })
                      .then(() => toast.success("Assignment updated"))
                      .catch((err: any) => toast.error(err.message));
                  }}
                  className={selectClass}
                >
                  <option value="unassigned">Unassigned (open pool)</option>
                  {isManagerOrAbove && teams.length > 0 && (
                    <optgroup label="Team queues">
                      {teams.map((t) => (
                        <option key={t.id} value={`team:${t.id}`}>
                          {t.name} (open queue)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="People">
                    {agentUsers.map((u) => (
                      <option key={u.id} value={`user:${u.id}`}>
                        {u.name || u.username.split("@")[0]}
                        {u.team?.name ? ` — ${u.team.name}` : ""}
                      </option>
                    ))}
                  </optgroup>
                </select>
              )}
            </ControlBlock>

            <ControlBlock label="Activity">
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet</p>
              ) : (
                <ul className="space-y-0 divide-y divide-border">
                  {events.map((ev) => {
                    const meta = EVENT_META[ev.type] ?? { label: ev.type };
                    return (
                      <li key={ev.id} className="py-2.5 first:pt-0 last:pb-0">
                        <p className="text-xs font-medium text-foreground">{meta.label}</p>
                        {ev.note && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{ev.note}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ControlBlock>
          </div>
        </aside>
      </div>

      {showEscalate && <EscalateModal ticket={ticket} onClose={() => setShowEscalate(false)} />}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

function ControlBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-2.5 text-xs font-semibold transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {typeof count === "number" && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {count}
          </span>
        )}
      </span>
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
    </button>
  );
}
