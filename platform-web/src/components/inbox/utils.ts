import type { ChannelType, ConversationStatus } from "../../api";
import { cn } from "../../utils/utils";
import { formatWhatsAppDisplay as formatWaDisplay } from "../../utils/phone";

export const CHANNELS: { id: ChannelType; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "email", label: "Email" },
  { id: "web_chat", label: "Web Chat" },
];

export function channelLabel(channel: ChannelType): string {
  return CHANNELS.find((c) => c.id === channel)?.label ?? channel;
}

function listField(primary: unknown, list: unknown, opts?: { digitsOnly?: boolean }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const v = raw.trim();
    if (!v) return;
    const key = opts?.digitsOnly
      ? v.replace(/[^\d]/g, "")
      : v.replace(/[^\d+a-zA-Z@._-]/g, "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    // Keep canonical WhatsApp formatting for display (e.g. "+91 6303481401")
    out.push(opts?.digitsOnly ? formatWhatsAppDisplay(v) : v);
  };
  if (Array.isArray(list)) list.forEach(push);
  push(primary);
  return out;
}

/** Store/display: "+{country} {number}" e.g. "+91 6303481401" */
export function formatWhatsAppDisplay(raw: string): string {
  return formatWaDisplay(raw);
}

/** Instagram handles: letters/numbers/._ — no spaces or bio-style "Name | Brand". */
export function isLikelyInstagramUsername(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const u = raw.replace(/^@/, "").trim();
  if (!u || u.length > 30) return false;
  if (/\s|[|/]/.test(u)) return false;
  if (/^\d{5,}$/.test(u)) return false; // IGSID, not a handle
  return /^[a-zA-Z0-9._]+$/.test(u);
}

/** Meta standard Instagram API reply window (Human Agent extends to 7 days server-side). */
export const INSTAGRAM_API_WINDOW_MS = 24 * 60 * 60 * 1000;

export function lastIncomingMessageAt(
  messages: { direction: string; createdAt: string }[] | undefined,
): Date | null {
  if (!messages?.length) return null;
  let latest: Date | null = null;
  for (const m of messages) {
    if (m.direction !== "incoming") continue;
    const at = new Date(m.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

export function isInstagramApiWindowExpired(
  messages: { direction: string; createdAt: string }[] | undefined,
  nowMs = Date.now(),
): boolean {
  const lastIncoming = lastIncomingMessageAt(messages);
  if (!lastIncoming) return false;
  return nowMs - lastIncoming.getTime() > INSTAGRAM_API_WINDOW_MS;
}

/** Resolve @handle for deep links (ig.me/m/…). */
export function instagramUsernameFromContact(contact: {
  instagramId?: string | null;
  instagramDetails?: { username?: string | null } | null;
  identifiers?: Record<string, string>;
  identities?: Array<{ channel?: string; displayId?: string; metadata?: { username?: string } }>;
} | null | undefined): string | null {
  if (!contact) return null;
  const igIdentity = (contact.identities ?? []).find((i) => i.channel === "instagram");
  const candidates = [
    igIdentity?.displayId,
    igIdentity?.metadata?.username,
    contact.instagramDetails?.username,
    contact.instagramId,
    contact.identifiers?.instagram,
  ];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const u = raw.replace(/^@/, "").trim();
    if (isLikelyInstagramUsername(u)) return u;
  }
  return null;
}

/** Best-effort link to the customer's Instagram DM thread. */
export function instagramThreadOpenUrl(contact: Parameters<typeof instagramUsernameFromContact>[0]): {
  url: string;
  hasDirectThread: boolean;
  handleLabel: string | null;
} {
  const username = instagramUsernameFromContact(contact);
  if (username) {
    return {
      url: `https://ig.me/m/${encodeURIComponent(username)}`,
      hasDirectThread: true,
      handleLabel: `@${username}`,
    };
  }
  return {
    url: "https://www.instagram.com/direct/inbox/",
    hasDirectThread: false,
    handleLabel: null,
  };
}

/** All external IDs for a channel (WhatsApp / email can have multiple). */
export function identitiesFor(contact: any, channel: ChannelType): string[] {
  if (!contact) return [];

  const fromIdentities = (contact.identities ?? [])
    .filter((i: any) => i?.channel === channel && typeof i.externalId === "string")
    .map((i: any) => {
      // Prefer API displayId / metadata username for Instagram UI — never contact.name
      if (channel === "instagram") {
        const displayId =
          typeof i.displayId === "string" ? i.displayId.replace(/^@/, "").trim() : "";
        if (isLikelyInstagramUsername(displayId)) return `@${displayId}`;
        const username =
          typeof i.metadata?.username === "string"
            ? i.metadata.username.replace(/^@/, "").trim()
            : "";
        if (isLikelyInstagramUsername(username)) return `@${username}`;
      }
      return i.externalId as string;
    });

  if (channel === "whatsapp") {
    return listField(
      null,
      [
        ...fromIdentities,
        ...(Array.isArray(contact.whatsappIds) ? contact.whatsappIds : []),
        contact.whatsappId,
        contact.identifiers?.whatsapp,
      ],
      { digitsOnly: true },
    );
  }
  if (channel === "email") {
    return listField(null, [
      ...fromIdentities,
      ...(Array.isArray(contact.emails) ? contact.emails : []),
      contact.emailId,
      contact.email,
      contact.identifiers?.email,
    ]);
  }
  if (channel === "instagram") {
    const fromDetails =
      typeof contact.instagramDetails?.username === "string"
        ? contact.instagramDetails.username.replace(/^@/, "").trim()
        : "";

    const candidates = [
      ...fromIdentities,
      isLikelyInstagramUsername(fromDetails) ? `@${fromDetails}` : "",
    ].filter((v) => typeof v === "string" && v.trim());

    // Prefer real @username over bare IGSID — never contact.name (bio/display names).
    const handle = candidates.find((v: string) => isLikelyInstagramUsername(v));
    if (handle) return [handle.startsWith("@") ? handle : `@${handle}`];

    const igsid =
      fromIdentities.find((v: string) => /^\d{5,}$/.test(v)) ||
      (typeof contact.instagramScopedId === "string" ? contact.instagramScopedId : null) ||
      (typeof contact.instagramId === "string" && /^\d{5,}$/.test(contact.instagramId)
        ? contact.instagramId
        : null) ||
      contact.identifiers?.instagram ||
      null;
    return typeof igsid === "string" && igsid.trim() ? [igsid.trim()] : [];
  }
  if (channel === "facebook") {
    const candidates = [
      ...fromIdentities,
      contact.facebookId,
      contact.identifiers?.facebook,
    ].filter((v) => typeof v === "string" && v.trim());
    return [...new Set(candidates)];
  }
  return [];
}

export function identityFor(contact: any, channel: ChannelType): string | null {
  return identitiesFor(contact, channel)[0] ?? null;
}

export function formatIdentity(identity: string, channel: ChannelType): string {
  if (!identity) return identity;
  if (channel === "whatsapp") {
    return formatWhatsAppDisplay(identity);
  }
  if (channel === "instagram") {
    if (isLikelyInstagramUsername(identity)) {
      return identity.startsWith("@") ? identity : `@${identity}`;
    }
    return identity; // IGSID or unknown — don't fake @Name
  }
  return identity;
}

export function formatIdentities(ids: string[], channel: ChannelType): string {
  return ids.map((id) => formatIdentity(id, channel)).join(", ");
}

export function formatMessageTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function isSameCalendarDay(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
): boolean {
  if (!a || !b) return false;
  try {
    return calendarDayKey(new Date(a)) === calendarDayKey(new Date(b));
  } catch {
    return false;
  }
}

/** Bubble footer: time today; date + time when older. */
export function formatBubbleTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (isSameCalendarDay(date, now)) return time;

    const sameYear = date.getFullYear() === now.getFullYear();
    const day = date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    return `${day}, ${time}`;
  } catch {
    return "";
  }
}

/** Day-break label between messages: Today / Yesterday / Wed, Aug 19. */
export function formatDaySeparator(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    if (isSameCalendarDay(date, now)) return "Today";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameCalendarDay(date, yesterday)) return "Yesterday";

    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return "";
  }
}

export function statusTone(status: ConversationStatus): string {
  if (status === "open") return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  if (status === "pending") return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

export function channelAccent(channel: ChannelType, active: boolean): string {
  if (!active) return "border-transparent text-muted-foreground hover:text-foreground";
  if (channel === "whatsapp") return "border-emerald-600 text-emerald-700";
  if (channel === "instagram") return "border-pink-600 text-pink-700";
  if (channel === "facebook") return "border-blue-600 text-blue-700";
  return "border-primary text-primary";
}

export function contactDisplayName(contact: {
  name?: string | null;
  whatsappId?: string | null;
  whatsappIds?: string[] | null;
  email?: string | null;
  instagramId?: string | null;
  instagramDetails?: { username?: string | null } | null;
  facebookId?: string | null;
  facebookDetails?: { senderName?: string | null } | null;
  identifiers?: Record<string, string>;
  identities?: Array<{ channel?: string; displayId?: string; metadata?: { username?: string; senderName?: string } }>;
}): string {
  const name = contact.name?.trim();
  if (name && !/^\d{5,}$/.test(name)) {
    // Old ingest could store a profile/bio name as "@Rajiv … | Brand" — not a handle.
    if (name.startsWith("@") && !isLikelyInstagramUsername(name)) {
      return name.replace(/^@+/, "").trim() || name;
    }
    return name;
  }

  const igIdentity = (contact.identities ?? []).find((i) => i.channel === "instagram");
  const igUser =
    (typeof igIdentity?.displayId === "string" &&
    isLikelyInstagramUsername(igIdentity.displayId)
      ? igIdentity.displayId.startsWith("@")
        ? igIdentity.displayId
        : `@${igIdentity.displayId}`
      : null) ||
    (typeof igIdentity?.metadata?.username === "string" &&
    isLikelyInstagramUsername(igIdentity.metadata.username)
      ? `@${igIdentity.metadata.username.replace(/^@/, "")}`
      : null) ||
    (typeof contact.instagramDetails?.username === "string" &&
    isLikelyInstagramUsername(contact.instagramDetails.username)
      ? `@${contact.instagramDetails.username.replace(/^@/, "")}`
      : null);
  if (igUser) return igUser;

  const fbIdentity = (contact.identities ?? []).find((i) => i.channel === "facebook");
  const fbUser =
    (typeof fbIdentity?.displayId === "string" && fbIdentity.displayId.trim()
      ? fbIdentity.displayId.trim()
      : null) ||
    (typeof contact.facebookDetails?.senderName === "string" && contact.facebookDetails.senderName.trim()
      ? contact.facebookDetails.senderName.trim()
      : null);
  if (fbUser) return fbUser;

  if (name) return name; // last resort: IGSID or PSID-as-name

  const whatsapp =
    contact.whatsappId ||
    contact.identifiers?.whatsapp ||
    contact.whatsappIds?.find((id) => typeof id === "string" && id.trim()) ||
    null;
  if (whatsapp) return formatWhatsAppDisplay(whatsapp);
  return contact.email || contact.facebookId || "Unknown";
}

export function initials(name: string): string {
  // Skip leading @ / + so Instagram handles and phone-style labels use a real letter.
  const cleaned = name.trim().replace(/^[@+\s]+/, "");
  const match = cleaned.match(/[A-Za-z0-9]/);
  return match ? match[0]!.toUpperCase() : "?";
}

export function isActiveStatus(status: ConversationStatus): boolean {
  return status === "open" || status === "pending";
}

/** Contact is Active if any of their channel conversations is open/pending. */
export function isContactActive(
  conversations: { status: ConversationStatus }[],
): boolean {
  return conversations.some((c) => isActiveStatus(c.status));
}

/**
 * Prefer API-derived contact.globalStatus; fall back to scanning channel rows.
 * Status itself is always stored per channel conversation — never on Contact.
 */
export function contactGlobalIsActive(
  contact: { globalStatus?: "active" | "resolved" } | null | undefined,
  channelConversations: { status: ConversationStatus }[],
): boolean {
  if (contact?.globalStatus === "active") return true;
  if (contact?.globalStatus === "resolved") return false;
  return isContactActive(channelConversations);
}

/** Prefer newest active channel conversation; else newest overall. */
export function pickPrimaryConversation<
  T extends { status: ConversationStatus; lastMessageAt?: string | null },
>(conversations: T[]): T {
  const sorted = [...conversations].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
  return sorted.find((c) => isActiveStatus(c.status)) ?? sorted[0]!;
}

/** List row for inbox: scoped channel when filtered, else primary across channels. */
export function pickListConversation<
  T extends {
    status: ConversationStatus;
    lastMessageAt?: string | null;
    channelType: ChannelType;
  },
>(conversations: T[], channelFilter: "all" | ChannelType): T | null {
  if (!conversations.length) return null;
  if (channelFilter === "all") return pickPrimaryConversation(conversations);
  const scoped = conversations.filter((c) => c.channelType === channelFilter);
  if (!scoped.length) return null;
  return pickPrimaryConversation(scoped);
}

/** Newest email thread for a contact (or null). */
export function pickPrimaryEmailThread<
  T extends {
    channelType: ChannelType;
    status: ConversationStatus;
    lastMessageAt?: string | null;
  },
>(conversations: T[]): T | null {
  const email = conversations.filter((c) => c.channelType === "email");
  if (!email.length) return null;
  return pickPrimaryConversation(email);
}

/** Subject label for email thread chips. */
export function emailThreadLabel(conversation: {
  threadSubject?: string | null;
  messages?: { subject?: string | null; content?: string }[];
}): string {
  if (conversation.threadSubject?.trim()) return conversation.threadSubject.trim();
  const subject = conversation.messages?.[0]?.subject?.trim();
  if (subject) {
    return subject.replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "").trim() || "(no subject)";
  }
  const preview = conversation.messages?.[0]?.content?.trim();
  if (preview) return preview.length > 40 ? `${preview.slice(0, 37)}…` : preview;
  return "(no subject)";
}

export function unresolvedChannels<
  T extends { status: ConversationStatus; lastMessageAt?: string | null },
>(conversations: T[]): T[] {
  return conversations
    .filter((c) => isActiveStatus(c.status))
    .sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
}

/** Next unresolved channel after resolving `excludeId`, or null if none left. */
export function nextUnresolvedConversation<
  T extends { id: string; status: ConversationStatus; lastMessageAt?: string | null },
>(conversations: T[], excludeId?: string): T | null {
  const open = unresolvedChannels(
    excludeId ? conversations.filter((c) => c.id !== excludeId) : conversations,
  );
  return open[0] ?? null;
}

export { cn };
