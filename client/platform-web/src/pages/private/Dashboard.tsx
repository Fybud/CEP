import { useMemo, useState } from "react";
import {
  MessageSquare,
  Users,
  Loader2,
  Inbox,
  TicketIcon,
  Clock,
  CheckCircle2,
  UserX,
  MessagesSquare,
  Mail,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useDashboardMetrics, useEnabledChannelTypes, type ChannelType } from "../../api";
import { cn } from "../../utils/utils";
import { useNavigate } from "react-router-dom";

function channelLabel(channel: string) {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "email":
      return "Email";
    case "web_chat":
      return "Web Chat";
    default:
      return channel;
  }
}

function ChannelMark({ channel }: { channel?: string }) {
  const label = channelLabel(channel || "");
  const short =
    channel === "whatsapp"
      ? "WA"
      : channel === "instagram"
        ? "IG"
        : channel === "facebook"
          ? "FB"
          : channel === "email"
            ? "EM"
            : channel === "web_chat"
              ? "WC"
              : "?";
  return (
    <span
      title={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {short}
    </span>
  );
}

const CHANNEL_BAR: Record<string, string> = {
  whatsapp: "bg-emerald-500",
  instagram: "bg-pink-500",
  facebook: "bg-blue-500",
  email: "bg-amber-500",
  web_chat: "bg-violet-500",
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  ESCALATED: "bg-red-500",
  RESOLVED: "bg-emerald-500",
  CLOSED: "bg-slate-400",
};

const TICKET_STATUS_TEXT: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function DashboardPage() {
  const { data: dashboard, isLoading, isError, error } = useDashboardMetrics();
  const { enabledChannels, channelsReady } = useEnabledChannelTypes();
  const navigate = useNavigate();
  const [agingExpanded, setAgingExpanded] = useState(false);

  const enabledSet = useMemo(() => new Set(enabledChannels), [enabledChannels]);

  /** Only feature-enabled + connected channels (same rules as Inbox). */
  const channelDistribution = useMemo(() => {
    const raw = dashboard?.channelDistribution ?? {};
    const out: Record<string, number> = {};
    for (const [channel, count] of Object.entries(raw)) {
      if (!channelsReady) continue;
      if (enabledSet.has(channel as ChannelType)) out[channel] = Number(count) || 0;
    }
    return out;
  }, [dashboard?.channelDistribution, enabledSet, channelsReady]);

  const agingSample = useMemo(() => {
    const sample = dashboard?.agingConversations?.sample ?? [];
    if (!channelsReady) return [];
    return sample.filter((item) => enabledSet.has(item.channelType as ChannelType));
  }, [dashboard?.agingConversations?.sample, enabledSet, channelsReady]);

  /** Recompute buckets from the filtered sample (API totals include disabled channels). */
  const agingOver48 = useMemo(
    () => agingSample.filter((item) => item.ageHours >= 48).length,
    [agingSample],
  );
  const agingOver24 = useMemo(
    () => agingSample.filter((item) => item.ageHours < 48).length,
    [agingSample],
  );
  const agingTotal = agingOver24 + agingOver48;

  const openConv = dashboard?.openConversations ?? 0;
  const unresolved = dashboard?.pendingConversations ?? 0;
  const unassigned = dashboard?.unassignedTickets ?? 0;
  const totalTickets = Object.values(dashboard?.ticketsByStatus ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  const openTickets = Object.entries(dashboard?.ticketsByStatus ?? {})
    .filter(([s]) => s === "OPEN" || s === "IN_PROGRESS" || s === "ESCALATED")
    .reduce((a, [, c]) => a + c, 0);
  const channelEntries = useMemo(
    () =>
      Object.entries(channelDistribution).sort(
        (a, b) => Number(b[1]) - Number(a[1]),
      ),
    [channelDistribution],
  );
  const channelTotal = channelEntries.reduce((a, [, b]) => a + Number(b), 0);
  const topChannel = channelEntries[0];

  const metrics = [
    {
      title: "Open conversations",
      value: openConv.toLocaleString(),
      hint: "Needs attention in inbox",
      icon: MessagesSquare,
      onClick: () => navigate("/inbox"),
    },
    {
      title: "Unresolved contacts",
      value: unresolved.toLocaleString(),
      hint: openConv ? `${pct(unresolved, openConv)}% of open chats` : "Contacts still open",
      icon: Inbox,
      onClick: () => navigate("/inbox"),
    },
    {
      title: "Aging over 24h",
      value: agingTotal.toLocaleString(),
      hint: agingOver48 > 0 ? `${agingOver48} waiting 48h+` : "Waiting for a reply",
      icon: Clock,
      warn: agingTotal > 0,
    },
    {
      title: "Unassigned tickets",
      value: unassigned.toLocaleString(),
      hint: totalTickets ? `${pct(unassigned, totalTickets)}% of tickets` : "No queue backlog",
      icon: UserX,
      onClick: () => navigate("/tickets"),
    },
    {
      title: "Active contacts",
      value: (dashboard?.activeContacts ?? 0).toLocaleString(),
      hint: "People with open threads",
      icon: Users,
      onClick: () => navigate("/contacts"),
    },
    {
      title: "Messages",
      value: channelTotal.toLocaleString(),
      hint: topChannel
        ? `Top channel: ${channelLabel(topChannel[0])}`
        : channelsReady && enabledChannels.length === 0
          ? "No channels connected"
          : "On enabled channels",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-card/50 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <h1 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
          Dashboard
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Inbox load, ticket queue, and channel mix.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center sm:px-5">
            <p className="text-sm font-medium text-foreground">Could not load dashboard</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(error as Error)?.message || "Try refreshing the page."}
            </p>
          </div>
        ) : (
          <>
            {/* Insight strip */}
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
              <div className="min-w-0 rounded-xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Inbox pressure</span>
                </div>
                <p className="mt-2 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
                  {openConv ? `${pct(agingTotal, openConv)}%` : "0%"}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                  of open chats are aging past 24 hours
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <TicketIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Ticket queue</span>
                </div>
                <p className="mt-2 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
                  {openTickets.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    / {totalTickets.toLocaleString()}
                  </span>
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                  {unassigned > 0
                    ? `${unassigned} still unassigned`
                    : "Active tickets across teams"}
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Channel lead</span>
                </div>
                <p className="mt-2 truncate text-xl font-semibold text-foreground sm:text-2xl">
                  {topChannel ? channelLabel(topChannel[0]) : "—"}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                  {topChannel && channelTotal
                    ? `${topChannel[1]} messages · ${pct(Number(topChannel[1]), channelTotal)}% of volume`
                    : "No channel traffic yet"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
              {metrics.map((m) => (
                <button
                  key={m.title}
                  type="button"
                  disabled={!m.onClick}
                  onClick={m.onClick}
                  className={cn(
                    "min-w-0 rounded-xl border border-border bg-card p-3 text-left transition-colors sm:p-4",
                    m.onClick && "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    !m.onClick && "cursor-default",
                    m.warn && "border-amber-500/30",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between sm:mb-3">
                    <m.icon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4",
                        m.warn ? "text-amber-600" : "text-muted-foreground",
                      )}
                    />
                    {m.warn ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    ) : null}
                  </div>
                  <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                    {m.value}
                  </p>
                  <p className="mt-1 text-[11px] font-medium leading-snug text-foreground sm:text-xs">
                    {m.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
                    {m.hint}
                  </p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
              <section className="min-w-0 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">Tickets by status</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                      {totalTickets.toLocaleString()} total
                      <span className="hidden sm:inline"> · click a status to open Tickets</span>
                    </p>
                  </div>
                  <TicketIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="p-4 sm:p-5">
                  {totalTickets === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground sm:py-10">
                      <CheckCircle2 className="h-7 w-7 opacity-30" />
                      <p className="text-sm">No tickets yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(dashboard?.ticketsByStatus ?? {}).map(([status, count]) => {
                        const share = pct(count, totalTickets);
                        return (
                          <button
                            key={status}
                            type="button"
                            className="w-full space-y-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            onClick={() => navigate("/tickets")}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                                <span
                                  className={cn(
                                    "h-2 w-2 shrink-0 rounded-full",
                                    TICKET_STATUS_COLORS[status] ?? "bg-slate-400",
                                  )}
                                />
                                <span className="truncate">
                                  {TICKET_STATUS_TEXT[status] ?? status}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {count} · {share}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  TICKET_STATUS_COLORS[status] ?? "bg-slate-400",
                                )}
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {(dashboard?.ticketsByTeam ?? []).length > 0 && (
                  <div className="border-t border-border px-4 py-4 sm:px-5">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      By team
                    </h3>
                    <div className="space-y-3">
                      {(dashboard?.ticketsByTeam ?? []).map((team) => {
                        const max = Math.max(
                          ...(dashboard?.ticketsByTeam ?? []).map((t) => t.count),
                          1,
                        );
                        const share = Math.round((team.count / max) * 100);
                        return (
                          <div key={team.teamName} className="min-w-0 space-y-1.5">
                            <div className="flex justify-between gap-2 text-xs">
                              <span className="truncate font-medium text-foreground">
                                {team.teamName}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {team.count}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary/80"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="min-w-0 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">Channel mix</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                      Message volume across connected channels
                    </p>
                  </div>
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="p-4 sm:p-5">
                  {channelTotal === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground sm:py-10">
                      <MessageSquare className="h-7 w-7 opacity-30" />
                      <p className="text-center text-sm">
                        {!channelsReady
                          ? "Loading channels…"
                          : enabledChannels.length === 0
                            ? "No enabled channels connected"
                            : "No channel data yet"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted sm:h-3">
                        {channelEntries.map(([channel, count]) => (
                          <div
                            key={channel}
                            title={`${channelLabel(channel)}: ${count}`}
                            className={cn(
                              "h-full min-w-[2px] first:rounded-l-full last:rounded-r-full",
                              CHANNEL_BAR[channel] ?? "bg-slate-400",
                            )}
                            style={{
                              width: `${pct(Number(count), channelTotal)}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="space-y-3">
                        {channelEntries.map(([channel, count]) => {
                          const share = pct(Number(count), channelTotal);
                          return (
                            <div key={channel} className="min-w-0 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                                  <ChannelMark channel={channel as ChannelType} />
                                  <span className="truncate">{channelLabel(channel)}</span>
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {count} · {share}%
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    CHANNEL_BAR[channel] ?? "bg-slate-400",
                                  )}
                                  style={{ width: `${share}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <section className="min-w-0 rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Aging conversations</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                    Unresolved chats waiting over 24 hours
                  </p>
                </div>
                {agingTotal > 0 ? (
                  <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-700 dark:text-amber-400">
                    {agingTotal}
                  </span>
                ) : (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>
              <div className="p-4 sm:p-5">
                {!channelsReady ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground sm:py-10">
                    <Loader2 className="h-7 w-7 animate-spin opacity-50" />
                    <p className="text-sm">Loading channels…</p>
                  </div>
                ) : enabledChannels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground sm:py-10">
                    <MessageSquare className="h-7 w-7 opacity-30" />
                    <p className="text-center text-sm">No enabled channels connected</p>
                  </div>
                ) : agingTotal === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground sm:py-10">
                    <CheckCircle2 className="h-7 w-7 opacity-30" />
                    <p className="text-sm">Nothing aging past 24h</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:gap-6 md:grid-cols-[minmax(0,200px)_1fr] lg:grid-cols-[220px_1fr]">
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-1">
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-lg font-semibold tabular-nums text-foreground sm:text-xl">
                          {agingOver24}
                        </p>
                        <p className="text-[11px] text-muted-foreground sm:text-xs">24–48 hours</p>
                      </div>
                      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                        <p className="text-lg font-semibold tabular-nums text-foreground sm:text-xl">
                          {agingOver48}
                        </p>
                        <p className="text-[11px] text-muted-foreground sm:text-xs">
                          Over 48 hours
                        </p>
                      </div>
                    </div>

                    {agingSample.length > 0 && (
                      <div className="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border">
                        {agingSample
                          .slice(0, agingExpanded ? undefined : 6)
                          .map((item) => (
                            <button
                              key={item.conversationId}
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                              onClick={() => navigate("/inbox")}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <ChannelMark channel={item.channelType} />
                                <span className="truncate text-xs font-medium text-foreground">
                                  {item.contactName}
                                </span>
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {item.ageHours}h
                              </span>
                            </button>
                          ))}
                        {agingSample.length > 6 && (
                          <button
                            type="button"
                            onClick={() => setAgingExpanded((p) => !p)}
                            className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/30"
                          >
                            {agingExpanded
                              ? "Show less"
                              : `Show ${agingSample.length - 6} more`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
