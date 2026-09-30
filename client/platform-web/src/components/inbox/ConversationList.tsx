import type { ChannelType, Conversation } from "../../api";
import { useBlockedContacts } from "../../api";
import { Ban, Pin } from "lucide-react";
import {
  cn,
  contactDisplayName,
  formatMessageTime,
  initials,
} from "./utils";

type Props = {
  conversations: Conversation[];
  channelConversationsByContact?: Record<string, Conversation[]>;
  selectedContactId: string | null;
  onSelect: (conversation: Conversation) => void;
  emptyHint?: string;
  channelFilter?: "all" | ChannelType;
  /** Optimistically cleared unread (contact + channel scope). */
  readScopeKeys?: ReadonlySet<string>;
  /** Show intent/group chips (admin intent_classifier_enabled). */
  showIntent?: boolean;
  /**
   * Active group filter id (`all` | `pre_purchase` | `order` | …).
   * When `all`, badge shows the group; when a group is selected, badge shows the sub.
   */
  intentGroupFilter?: string;
};

export function listReadScopeKey(
  contactId: string,
  channelFilter: "all" | ChannelType,
): string {
  return `${contactId}:${channelFilter}`;
}

/** Total unread messages across all channels, or scoped to a specific channel. */
export function getUnreadCount(
  conversation: Conversation,
  channelFilter: "all" | ChannelType,
): number {
  const byChannel = conversation.contact.unreadByChannel;
  if (!byChannel) return 0;
  if (channelFilter !== "all") {
    return byChannel[channelFilter] ?? 0;
  }
  return Object.values(byChannel).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

function contactHasUnread(
  conversation: Conversation,
  channelFilter: "all" | ChannelType,
): boolean {
  if (channelFilter === "all") {
    return Boolean(conversation.contact.hasUnread);
  }
  const n = conversation.contact.unreadByChannel?.[channelFilter] ?? 0;
  return n > 0;
}

/** Strip HTML tags and CSS/script blocks so email previews are clean text. */
function stripHtmlForPreview(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ConversationList({
  conversations,
  channelConversationsByContact: _channelConversationsByContact,
  selectedContactId,
  onSelect,
  emptyHint,
  channelFilter = "all",
  readScopeKeys,
  showIntent = false,
  intentGroupFilter = "all",
}: Props) {
  const { data: blockedRows } = useBlockedContacts();
  const blockedIds = new Set((blockedRows ?? []).map((r) => r.customerId));
  const showChannelBadge = channelFilter === "all";
  const showIntentBadge = showIntent;
  const showGroupOnBadge = intentGroupFilter === "all";

  function resolveIntentGroup(c: Conversation): string | null {
    if (c.intentGroup) return c.intentGroup;
    const intent = c.intent;
    if (!intent) return null;
    if (intent.includes("/")) return intent.split("/")[0] ?? null;
    if (intent === "order_status") return "order";
    if (intent === "post_purchase_issue") return "post_purchase";
    if (intent === "non_customer_noise") return "noise";
    return intent;
  }

  function groupBadgeLabel(group: string | null): string {
    if (group === "pre_purchase") return "Pre";
    if (group === "order") return "Order";
    if (group === "post_purchase") return "Post";
    if (group === "noise") return "Noise";
    return group ?? "";
  }

  function subBadgeLabel(intent: string | null | undefined): string {
    if (!intent) return "";
    const leaf = intent.includes("/") ? intent.split("/")[1]! : intent;
    if (leaf === "status" || leaf === "order_status") return "Track";
    if (leaf === "product" || leaf === "pre_purchase") return "Product";
    if (leaf === "price") return "Price";
    if (leaf === "shipping") return "Ship";
    if (leaf === "change") return "Change";
    if (leaf === "payment") return "Pay";
    if (leaf === "delivery" || leaf === "post_purchase_issue") return "Delivery";
    if (leaf === "return") return "Return";
    if (leaf === "feedback") return "Feedback";
    if (leaf === "thanks" || leaf === "non_customer_noise") return "Thanks";
    if (leaf === "greeting") return "Hi";
    if (leaf === "human") return "Human";
    if (leaf === "spam") return "Spam";
    if (leaf === "other") return "Other";
    return leaf;
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">No conversations</p>
        <p className="text-xs text-muted-foreground">
          {emptyHint ??
            "Unresolved contacts appear here until every thread is resolved."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {conversations.map((conversation) => {
        const name = contactDisplayName(conversation.contact);

        // Last message preview — prefer the first message in the array (API returns
        // latest-first). Strip HTML for email threads so no CSS leaks through.
        const rawPreview =
          conversation.messages?.[0]?.content ??
          conversation.threadSubject ??
          "";
        const preview = rawPreview
          ? stripHtmlForPreview(rawPreview)
          : "No messages yet";

        const selected = selectedContactId === conversation.contactId;
        const scopeKey = listReadScopeKey(conversation.contactId, channelFilter);
        const isBlocked =
          Boolean(conversation.contact.blocked) || blockedIds.has(conversation.contactId);
        const hasUnread =
          !isBlocked &&
          contactHasUnread(conversation, channelFilter) &&
          !readScopeKeys?.has(scopeKey);
        const unreadCount =
          isBlocked || readScopeKeys?.has(scopeKey)
            ? 0
            : getUnreadCount(conversation, channelFilter);

        return (
          <button
            key={conversation.contactId}
            type="button"
            onClick={() => onSelect(conversation)}
            className={cn(
              "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left",
              selected ? "bg-muted" : "bg-card hover:bg-muted/50",
            )}
          >
            {/* Avatar with unread-count badge */}
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(name)}
              {unreadCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                  title={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "truncate text-[13px] text-foreground",
                      hasUnread ? "font-semibold" : "font-medium",
                    )}
                  >
                    {name}
                  </span>
                  {isBlocked ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-destructive"
                      title="Blocked — inbound messages are ignored"
                    >
                      <Ban className="h-2.5 w-2.5" />
                      Blocked
                    </span>
                  ) : null}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {conversation.pinned ? (
                    <Pin className="h-3 w-3 fill-primary text-primary" aria-label="Pinned" />
                  ) : null}
                  {showIntentBadge && (conversation.intent || conversation.intentGroup) ? (
                    <span
                      className="max-w-[4.5rem] truncate rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground"
                      title={
                        conversation.intent?.replaceAll("/", " · ").replaceAll("_", " ") ??
                        conversation.intentGroup ??
                        undefined
                      }
                    >
                      {showGroupOnBadge
                        ? groupBadgeLabel(resolveIntentGroup(conversation))
                        : subBadgeLabel(conversation.intent)}
                    </span>
                  ) : null}
                  {showChannelBadge ? (
                    <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      {conversation.channelType === "whatsapp"
                        ? "WA"
                        : conversation.channelType === "instagram"
                          ? "IG"
                          : conversation.channelType === "facebook"
                            ? "FB"
                            : conversation.channelType === "web_chat"
                              ? "Web"
                              : "Email"}
                    </span>
                  ) : null}
                  <span className="text-[10px] text-muted-foreground">
                    {formatMessageTime(conversation.lastMessageAt)}
                  </span>
                </div>
              </div>
              <p
                className={cn(
                  "mt-0.5 truncate text-xs",
                  isBlocked
                    ? "text-destructive/80"
                    : hasUnread
                      ? "text-foreground/80"
                      : "text-muted-foreground",
                )}
              >
                {isBlocked ? "Blocked — inbound messages ignored" : preview}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
