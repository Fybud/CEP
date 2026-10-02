import { useState } from "react";
import {
  MessageSquare,
  TicketIcon,
  Radio,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useContactTimeline, type TimelineEvent, type Contact } from "../../api";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../inbox/utils";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  web_chat: "Web Chat",
};

const EVENT_STYLES: Record<
  string,
  { icon: React.ElementType; color: string; ring: string; label: string }
> = {
  message: {
    icon: MessageSquare,
    color: "text-blue-600 dark:text-blue-400",
    ring: "bg-blue-500/10 ring-blue-500/20",
    label: "Message",
  },
  ticket: {
    icon: TicketIcon,
    color: "text-violet-600 dark:text-violet-400",
    ring: "bg-violet-500/10 ring-violet-500/20",
    label: "Ticket",
  },
  ticket_note: {
    icon: StickyNote,
    color: "text-amber-600 dark:text-amber-400",
    ring: "bg-amber-500/10 ring-amber-500/20",
    label: "Note",
  },
  broadcast: {
    icon: Radio,
    color: "text-emerald-600 dark:text-emerald-400",
    ring: "bg-emerald-500/10 ring-emerald-500/20",
    label: "Broadcast",
  },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "message", label: "Messages" },
  { id: "ticket", label: "Tickets" },
  { id: "broadcast", label: "Broadcasts" },
] as const;

function TimelineEventRow({
  event,
  isLast,
}: {
  event: TimelineEvent;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const eventType = event.type ?? "message";
  const style = EVENT_STYLES[eventType] ?? EVENT_STYLES.message;
  const Icon = style.icon;
  const ts = event.timestamp
    ? formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })
    : "";

  const title =
    eventType === "message"
      ? `${event.direction === "incoming" ? "Received" : "Sent"} message`
      : eventType === "ticket"
        ? `Ticket #${event.ticketNumber ?? ""}${event.subject ? ` — ${event.subject}` : ""}`
        : eventType === "ticket_note"
          ? "Internal note"
          : `Broadcast · ${event.templateName ?? "Campaign"}`;

  const body =
    eventType === "message"
      ? event.content
      : eventType === "ticket_note"
        ? event.body
        : eventType === "broadcast"
          ? event.status === "failed"
            ? `Failed${event.error ? `: ${event.error}` : ""}`
            : "Sent via broadcast"
          : null;

  const hasBody = Boolean(body && body.length > 80);
  const channelLabel = event.channelType
    ? CHANNEL_LABELS[event.channelType] ?? event.channelType
    : null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1",
            style.ring,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", style.color)} />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-foreground">{title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {channelLabel && (
                <span className="text-[11px] text-muted-foreground">{channelLabel}</span>
              )}
              {eventType === "ticket" && event.status && (
                <span
                  className={cn(
                    "rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
                    event.status === "OPEN" && "bg-blue-500/10 text-blue-700 dark:text-blue-400",
                    event.status === "IN_PROGRESS" &&
                      "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                    event.status === "ESCALATED" && "bg-red-500/10 text-red-700 dark:text-red-400",
                    event.status === "RESOLVED" &&
                      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    event.status === "CLOSED" && "bg-muted text-muted-foreground",
                  )}
                >
                  {event.status.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <time className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{ts}</time>
        </div>

        {body && (
          <div className="mt-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
            <p
              className={cn(
                "text-xs leading-relaxed text-muted-foreground",
                !expanded && "line-clamp-2",
              )}
            >
              {body}
            </p>
            {hasBody && (
              <button
                type="button"
                onClick={() => setExpanded((p) => !p)}
                className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
              >
                {expanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {expanded ? "Less" : "More"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ContactTimelinePanelProps {
  contact: Contact;
  onOpenConversation?: (conversationId: string) => void;
}

export function ContactTimelinePanel({ contact }: ContactTimelinePanelProps) {
  const { data, isLoading } = useContactTimeline(contact.id);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const events = (data?.events ?? []).filter(
    (e) =>
      filter === "all" ||
      e.type === filter ||
      (filter === "ticket" && e.type === "ticket_note"),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No activity yet</p>
            <p className="max-w-[200px] text-xs text-muted-foreground">
              Messages, tickets, and broadcasts for this contact will show up here.
            </p>
          </div>
        ) : (
          <div>
            {events.map((event, i) => (
              <TimelineEventRow
                key={event.id}
                event={event}
                isLast={i === events.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
