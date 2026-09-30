import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { toast } from "sonner";
import { Mail, MessageCircle, Search, TicketIcon, Plus, ChevronDown } from "lucide-react";
import {
  useAccounts,
  useContacts,
  useConversations,
  useDeleteMessages,
  useEnabledChannelTypes,
  useFeatureFlag,
  useMessages,
  useSendMessage,
  useSuppressConversation,
  useUpdateConversation,
  markConversationRead,
  useTickets,
  type ChannelType,
  type Conversation,
  type TicketStatus,
  useSendWhatsAppTemplate,
} from "../../api";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";
import {
  CHANNELS,
  ConversationEmptyState,
  ConversationList,
  listReadScopeKey,
  getUnreadCount,
  ConversationThread,
  CustomerDetails,
  LivePulse,
  channelLabel,
  cn,
  contactDisplayName,
  contactGlobalIsActive,
  identitiesFor,
  isActiveStatus,
  pickListConversation,
  pickPrimaryConversation,
  pickPrimaryEmailThread,
} from "../../components/inbox";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { CreateTicketModal } from "../../components/tickets/CreateTicketModal";
import { KeyboardShortcutsOverlay } from "../../components/ui/KeyboardShortcutsOverlay";
import { useInboxKeyboardShortcuts } from "../../hooks/useInboxKeyboardShortcuts";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

type ChannelFilter = "all" | ChannelType;
type PendingDelete =
  | { kind: "clear"; conversationId: string; channel: ChannelType }
  | {
      kind: "messages";
      conversationId: string;
      channel: ChannelType;
      messageIds: string[];
      resolve: (ok: boolean) => void;
    };

/** Statuses that block "create without warning" — CLOSED/RESOLVED do not. */
const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "ESCALATED"];

function isActiveTicketStatus(status: TicketStatus): boolean {
  return ACTIVE_TICKET_STATUSES.includes(status);
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

const CHANNEL_FILTER_ICONS: Record<ChannelType, ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  instagram: InstagramGlyph,
  facebook: FacebookGlyph,
  email: Mail,
  web_chat: MessageCircle,
};

const INTENT_FILTERS = [
  { id: "all" as const, label: "All intents", short: "All" },
  { id: "pre_purchase" as const, label: "Pre-purchase", short: "Pre" },
  { id: "order" as const, label: "Order", short: "Order" },
  { id: "post_purchase" as const, label: "Post-purchase", short: "Post" },
  { id: "noise" as const, label: "Noise", short: "Noise" },
];

type IntentFilter = (typeof INTENT_FILTERS)[number]["id"];

/** Resolve group from intentGroup or leaf/legacy intent string. */
function conversationIntentGroup(c: {
  intent?: string | null;
  intentGroup?: string | null;
}): string | null {
  if (c.intentGroup) return c.intentGroup;
  const intent = c.intent;
  if (!intent) return null;
  if (intent.includes("/")) return intent.split("/")[0] ?? null;
  if (intent === "order_status") return "order";
  if (intent === "post_purchase_issue") return "post_purchase";
  if (intent === "non_customer_noise") return "noise";
  return intent;
}

export function InboxPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [intentMenuOpen, setIntentMenuOpen] = useState(false);
  const intentMenuRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ChannelType>("whatsapp");
  const { data: intentFlag } = useFeatureFlag("intent_classifier_enabled");
  const intentClassifierEnabled = intentFlag?.enabled === true;

  useEffect(() => {
    if (!intentClassifierEnabled && intentFilter !== "all") {
      setIntentFilter("all");
    }
  }, [intentClassifierEnabled, intentFilter]);

  useEffect(() => {
    if (!intentMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!intentMenuRef.current?.contains(e.target as Node)) {
        setIntentMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIntentMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [intentMenuOpen]);

  const intentFilterLabel =
    INTENT_FILTERS.find((o) => o.id === intentFilter)?.short ?? "All";

  const [customerContextOpen, setCustomerContextOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("inbox-customer-context-open");
      if (saved === null) return false; // minimized by default
      return saved === "true";
    } catch {
      return false;
    }
  });
  const setCustomerContextOpenPersisted = (open: boolean | ((prev: boolean) => boolean)) => {
    setCustomerContextOpen((prev) => {
      const next = typeof open === "function" ? open(prev) : open;
      try {
        localStorage.setItem("inbox-customer-context-open", String(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  };
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedEmailThreadId, setSelectedEmailThreadId] = useState<string | null>(null);
  const [composingNewEmail, setComposingNewEmail] = useState(false);
  const [readScopeKeys, setReadScopeKeys] = useState<Set<string>>(() => new Set());
  /** Unread totals when a scope was marked read — only re-show badge if count increases. */
  const readUnreadBaselineRef = useRef<Map<string, number>>(new Map());
  const [createTicketConv, setCreateTicketConv] = useState<{conversationId: string; channel: string; customerId?: string} | null>(null);
  const [confirmCreateAnother, setConfirmCreateAnother] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const focusedContactRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const {
    data: conversations,
    isPending: conversationsPending,
    isFetching: conversationsFetching,
  } = useConversations("all");
  const { selectedContactId, setSelectedContactId } = useAppStore();
  const { data: accounts } = useAccounts();
  const { data: directoryContacts } = useContacts(accounts?.[0]?.id);

  const sendMessage = useSendMessage();
  const updateStatus = useUpdateConversation();
  const suppressConversation = useSuppressConversation();
  const deleteMessages = useDeleteMessages();
  const { enabledChannels, channelsReady } = useEnabledChannelTypes();
  const enabledSet = useMemo(() => new Set(enabledChannels), [enabledChannels]);

  /** Channel threads grouped by contact — status lives per channel conversation. */
  const conversationsByContact = useMemo(() => {
    const map: Record<string, Conversation[]> = {};
    for (const conversation of conversations ?? []) {
      if (channelsReady && !enabledSet.has(conversation.channelType)) continue;
      (map[conversation.contactId] ??= []).push(conversation);
    }
    return map;
  }, [conversations, enabledSet, channelsReady]);

  const listConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const items: Conversation[] = [];

    for (const channelConvs of Object.values(conversationsByContact)) {
      const listRow = pickListConversation(channelConvs, channelFilter);
      if (!listRow) continue;

      if (statusFilter === "active") {
        if (channelFilter === "all") {
          if (!contactGlobalIsActive(listRow.contact, channelConvs)) continue;
        } else if (!isActiveStatus(listRow.status)) {
          continue;
        }
      }

      if (intentClassifierEnabled && intentFilter !== "all") {
        if (channelFilter === "all") {
          if (!channelConvs.some((c) => conversationIntentGroup(c) === intentFilter)) continue;
        } else if (conversationIntentGroup(listRow) !== intentFilter) {
          continue;
        }
      }

      if (!query) {
        items.push({
          ...listRow,
          pinned: channelConvs.some((c) => c.pinned) || listRow.pinned,
        });
        continue;
      }

      const matches = channelConvs.some((conversation) => {
        const name = conversation.contact.name?.toLowerCase() ?? "";
        const email = conversation.contact.email?.toLowerCase() ?? "";
        const whatsappParts = [
          conversation.contact.whatsappId,
          conversation.contact.identifiers?.whatsapp,
          ...(conversation.contact.whatsappIds ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const preview = conversation.messages?.[0]?.content?.toLowerCase() ?? "";
        const subject =
          (conversation.threadSubject ?? conversation.messages?.[0]?.subject ?? "").toLowerCase();
        const digitsQuery = query.replace(/[^\d]/g, "");
        const digitsWhatsapp = whatsappParts.replace(/[^\d]/g, "");
        return (
          name.includes(query) ||
          email.includes(query) ||
          whatsappParts.includes(query) ||
          preview.includes(query) ||
          subject.includes(query) ||
          (digitsQuery.length >= 4 && digitsWhatsapp.includes(digitsQuery))
        );
      });
      if (matches) {
        items.push({
          ...listRow,
          pinned: channelConvs.some((c) => c.pinned) || listRow.pinned,
        });
      }
    }

    return items.sort((a, b) => {
      const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pin !== 0) return pin;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversationsByContact, statusFilter, channelFilter, searchQuery, intentFilter, intentClassifierEnabled]);

  /** New inbound while a thread is open — show the unread bar again only if count rose. */
  useEffect(() => {
    if (!conversations?.length) return;
    const byContact = new Map<string, Conversation>();
    for (const c of conversations) {
      if (!byContact.has(c.contactId)) byContact.set(c.contactId, c);
    }
    setReadScopeKeys((prev) => {
      if (!prev.size) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const key of prev) {
        const sep = key.indexOf(":");
        if (sep <= 0) continue;
        const contactId = key.slice(0, sep);
        const filter = key.slice(sep + 1) as ChannelFilter;
        const conv = byContact.get(contactId);
        if (!conv) continue;
        const serverCount = getUnreadCount(conv, filter);
        const baseline = readUnreadBaselineRef.current.get(key) ?? 0;
        // Pin/refetch must not revive the badge; only a higher unread count means new mail.
        if (serverCount > baseline) {
          next.delete(key);
          readUnreadBaselineRef.current.delete(key);
          changed = true;
        } else {
          // Keep baseline in sync as server catches up after mark-read (count drops).
          readUnreadBaselineRef.current.set(key, serverCount);
        }
      }
      return changed ? next : prev;
    });
  }, [conversations]);

  const markScopeRead = (contactId: string, filter: ChannelFilter, conversation: Conversation) => {
    const scopeKey = listReadScopeKey(contactId, filter);
    readUnreadBaselineRef.current.set(scopeKey, getUnreadCount(conversation, filter));
    setReadScopeKeys((prev) => {
      if (prev.has(scopeKey)) return prev;
      const next = new Set(prev);
      next.add(scopeKey);
      return next;
    });
  };
  const channelFilterOptions = useMemo(() => {
    // Don't flash every channel while flags/inboxes load — wait, then only connected+enabled.
    if (!channelsReady) return [];
    const enabled = CHANNELS.filter((c) => enabledChannels.includes(c.id));
    if (!enabled.length) return [];
    return [{ id: "all" as const, label: "All" }, ...enabled];
  }, [channelsReady, enabledChannels]);

  const listEmptyHint =
    channelFilter === "all"
      ? statusFilter === "active"
        ? "Unresolved contacts appear here until every thread is resolved."
        : "No contacts match this filter."
      : statusFilter === "active"
        ? `No unresolved ${channelLabel(channelFilter)} conversations.`
        : `No ${channelLabel(channelFilter)} conversations.`;

  const contactConversations = useMemo(() => {
    const map: Partial<Record<ChannelType, Conversation>> = {};
    if (!selectedContactId) return map;
    const rows = (conversations ?? []).filter((conversation) => {
      if (conversation.contactId !== selectedContactId) return false;
      if (channelsReady && !enabledSet.has(conversation.channelType)) return false;
      return true;
    });
    for (const type of ["whatsapp", "instagram", "facebook", "email", "web_chat"] as ChannelType[]) {
      const scoped = rows.filter((c) => c.channelType === type);
      if (!scoped.length) continue;
      if (type === "email") {
        const selected =
          (selectedEmailThreadId && scoped.find((c) => c.id === selectedEmailThreadId)) ||
          pickPrimaryConversation(scoped);
        map.email = selected;
      } else {
        map[type] = pickPrimaryConversation(scoped);
      }
    }
    return map;
  }, [
    conversations,
    selectedContactId,
    enabledSet,
    channelsReady,
    selectedEmailThreadId,
  ]);

  const emailThreads = useMemo(() => {
    if (!selectedContactId) return [] as Conversation[];
    return (conversationsByContact[selectedContactId] ?? [])
      .filter((c) => c.channelType === "email")
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [conversationsByContact, selectedContactId]);

  // Reset email thread selection when switching contacts.
  useEffect(() => {
    setSelectedEmailThreadId(null);
    setComposingNewEmail(false);
  }, [selectedContactId]);

  // Keep email thread selection valid; default to newest.
  useEffect(() => {
    if (activeTab !== "email") return;
    if (composingNewEmail) return;
    if (selectedEmailThreadId && emailThreads.some((t) => t.id === selectedEmailThreadId)) {
      return;
    }
    const newest = pickPrimaryEmailThread(emailThreads);
    setSelectedEmailThreadId(newest?.id ?? null);
  }, [activeTab, emailThreads, selectedEmailThreadId, composingNewEmail]);

  const selectedListConversation =
    listConversations.find((c) => c.contactId === selectedContactId) ??
    (selectedContactId && conversationsByContact[selectedContactId]
      ? pickPrimaryConversation(conversationsByContact[selectedContactId]!)
      : null);

  const directoryContact = useMemo(
    () => directoryContacts?.find((c) => c.id === selectedContactId) ?? null,
    [directoryContacts, selectedContactId],
  );

  const selectedContact =
    contactConversations[activeTab]?.contact ??
    selectedListConversation?.contact ??
    Object.values(contactConversations)[0]?.contact ??
    directoryContact ??
    null;

  /** Email / WhatsApp can start outbound when an identity exists (Shopify-linked email, etc.). Instagram cannot. */
  const selectedConversation = useMemo(() => {
    if (!selectedContactId || !selectedContact) return null;
    const pinned = (conversationsByContact[selectedContactId] ?? []).some((c) => c.pinned);

    if (activeTab === "email") {
      if (composingNewEmail) {
        return {
          id: `${selectedContactId}:email:new`,
          contactId: selectedContactId,
          accountId: "workspace",
          status: "resolved" as const,
          lastMessageAt: null,
          channelType: "email" as const,
          externalThreadId: null,
          threadSubject: "New email",
          inbox: {
            id: "channel_email",
            name: "Email",
            channelType: "email" as const,
          },
          contact: selectedContact,
          messages: [],
          pinned,
        } satisfies Conversation;
      }
      const existing =
        (selectedEmailThreadId &&
          emailThreads.find((t) => t.id === selectedEmailThreadId)) ||
        contactConversations.email ||
        emailThreads[0] ||
        null;
      if (existing) return { ...existing, pinned: existing.pinned || pinned };
      if (channelsReady && !enabledSet.has("email")) return null;
      const ids = identitiesFor(selectedContact, "email");
      if (!ids.length) return null;
      return {
        id: `${selectedContactId}:email:new`,
        contactId: selectedContactId,
        accountId: "workspace",
        status: "resolved" as const,
        lastMessageAt: null,
        channelType: "email" as const,
        externalThreadId: null,
        threadSubject: "New email",
        inbox: {
          id: "channel_email",
          name: "Email",
          channelType: "email" as const,
        },
        contact: selectedContact,
        messages: [],
        pinned,
      } satisfies Conversation;
    }

    const existing = contactConversations[activeTab];
    if (existing) return { ...existing, pinned: existing.pinned || pinned };
    if (activeTab === "instagram" || activeTab === "facebook") return null;
    if (channelsReady && !enabledSet.has(activeTab)) return null;
    const ids = identitiesFor(selectedContact, activeTab);
    if (!ids.length) return null;
    return {
      id: `${selectedContactId}:${activeTab}`,
      contactId: selectedContactId,
      accountId: "workspace",
      status: "resolved" as const,
      lastMessageAt: null,
      channelType: activeTab,
      inbox: {
        id: `channel_${activeTab}`,
        name: channelLabel(activeTab),
        channelType: activeTab,
      },
      contact: selectedContact,
      messages: [],
      pinned,
    } satisfies Conversation;
  }, [
    selectedContactId,
    selectedContact,
    contactConversations,
    conversationsByContact,
    activeTab,
    channelsReady,
    enabledSet,
    composingNewEmail,
    selectedEmailThreadId,
    emailThreads,
  ]);

  const conversationId = selectedConversation?.id;
  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    selectedConversation?.id
  );

  const { data: linkedTickets } = useTickets(
    selectedConversation ? { conversationId: selectedConversation.id } : undefined
  );
  const activeTicket = linkedTickets?.find((t) => isActiveTicketStatus(t.status));
  /** Prefer active ticket for View CTA; else most recent linked (incl. CLOSED/RESOLVED). */
  const viewTicket = activeTicket ?? linkedTickets?.[0];

  const openCreateTicket = () => {
    if (!selectedConversation) return;
    setCreateTicketConv({
      conversationId: selectedConversation.id,
      channel: selectedConversation.channelType,
      customerId: selectedConversation.contactId,
    });
  };

  const handleCreateTicketClick = () => {
    if (activeTicket) {
      setConfirmCreateAnother(true);
      return;
    }
    openCreateTicket();
  };

  /**
   * Never paint messages until this exact conversation is ready.
   * `isPending` alone is false when the new thread is cached, so the previous
   * contact's bubbles can flash (or skip the loader entirely). Gate on id match.
   */
  const [messagesReadyFor, setMessagesReadyFor] = useState<string | null>(null);
  useLayoutEffect(() => {
    setMessagesReadyFor(null);
  }, [conversationId]);
  useEffect(() => {
    setConfirmCreateAnother(false);
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId || messagesLoading) return;
    setMessagesReadyFor(conversationId);
  }, [conversationId, messagesLoading]);
  const showMessagesLoader =
    Boolean(conversationId) && messagesReadyFor !== conversationId;

  /** Mark read when opening a channel tab (not only list click). */
  useEffect(() => {
    const id = selectedConversation?.id;
    if (!id || id.endsWith(":email:new") || !selectedContactId || !selectedConversation) return;
    markScopeRead(selectedContactId, channelFilter, selectedConversation);
    void markConversationRead(id).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark when thread/filter changes
  }, [selectedConversation?.id, selectedContactId, channelFilter]);

  useEffect(() => {
    if (!channelsReady) return;
    if (!enabledChannels.length) return;
    if (!enabledChannels.includes(activeTab)) {
      setActiveTab(enabledChannels[0]!);
    }
  }, [enabledChannels, activeTab, channelsReady]);

  /** Drop channel filter if that channel was disconnected. */
  useEffect(() => {
    if (!channelsReady) return;
    if (channelFilter === "all") return;
    if (!enabledChannels.includes(channelFilter)) {
      setChannelFilter("all");
    }
  }, [channelsReady, enabledChannels, channelFilter]);

  /** Align open thread with the list channel scope when the filter changes. */
  useEffect(() => {
    if (channelFilter === "all" || !selectedContactId) return;
    const rows = conversationsByContact[selectedContactId];
    if (rows?.some((c) => c.channelType === channelFilter)) {
      setActiveTab(channelFilter);
    }
    // Only when the filter changes — polls must not steal the agent's tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [channelFilter]);

  /**
   * Once per contact open (including after data arrives), focus unresolved channel.
   * Polls/refetches won't steal the tab the agent chose.
   * Contacts → Chat: if no threads yet, pick first channel with an identity.
   * When a list channel filter is active, prefer that channel if present.
   */
  useEffect(() => {
    if (!selectedContactId) {
      focusedContactRef.current = null;
      return;
    }
    if (focusedContactRef.current === selectedContactId) return;
    const rows = conversationsByContact[selectedContactId];
    if (rows?.length) {
      focusedContactRef.current = selectedContactId;
      const scoped =
        channelFilter !== "all"
          ? rows.find((c) => c.channelType === channelFilter)
          : null;
      setActiveTab(scoped?.channelType ?? pickPrimaryConversation(rows).channelType);
      setStatusFilter("all");
      return;
    }
    const contact = directoryContacts?.find((c) => c.id === selectedContactId);
    if (!contact) return;
    focusedContactRef.current = selectedContactId;
    setStatusFilter("all");
    if (
      channelFilter !== "all" &&
      (!channelsReady || enabledSet.has(channelFilter)) &&
      identitiesFor(contact, channelFilter).length > 0
    ) {
      setActiveTab(channelFilter);
      return;
    }
    const preferred = (["whatsapp", "email", "instagram", "facebook"] as ChannelType[]).find((ch) => {
      if (channelsReady && !enabledSet.has(ch)) return false;
      return identitiesFor(contact, ch).length > 0;
    });
    if (preferred) setActiveTab(preferred);
    else if (enabledChannels[0]) setActiveTab(enabledChannels[0]);
  }, [
    selectedContactId,
    conversationsByContact,
    directoryContacts,
    channelsReady,
    enabledSet,
    enabledChannels,
    channelFilter,
  ]);

  const handleSelectConversation = (conversation: Conversation) => {
    const contactId = conversation.contactId;
    const rows = conversationsByContact[contactId] ?? [conversation];
    focusedContactRef.current = contactId;
    setSelectedContactId(contactId);

    markScopeRead(contactId, channelFilter, conversation);

    const toMark =
      channelFilter === "all"
        ? rows
        : rows.filter((c) => c.channelType === channelFilter);
    for (const row of toMark) {
      void markConversationRead(row.id).catch(() => {
        /* list refetch on messages fetch will reconcile */
      });
    }

    if (channelFilter !== "all" && rows.some((c) => c.channelType === channelFilter)) {
      setActiveTab(channelFilter);
    } else {
      setActiveTab(pickPrimaryConversation(rows).channelType);
    }
  };

  const handleSend = async (
    content: string,
    subject?: string,
    media?: { mediaKey: string; mediaMimeType: string; mediaFilename: string },
  ): Promise<boolean> => {
    if (!selectedConversation || !selectedContactId) return false;
    const channel = selectedConversation.channelType;
    const conversationId = selectedConversation.id;

    try {
      const data = await sendMessage.mutateAsync({
        id: conversationId,
        content,
        subject,
        mediaKey: media?.mediaKey,
        mediaMimeType: media?.mediaMimeType,
        mediaFilename: media?.mediaFilename,
      });
      if (!data.result?.ok || !data.message) {
        toast.error(data.result?.error || "Message failed to send on channel");
        return false;
      }
      if (channel === "email" && data.conversationId) {
        setComposingNewEmail(false);
        setSelectedEmailThreadId(data.conversationId);
      }
      toast.success(
        channel === "email" && conversationId.endsWith(":new")
          ? "Email sent"
          : `${channelLabel(channel)} reply sent`,
      );
      return true;
    } catch (err: any) {
      const msg = err.message || "Failed to send message";
      const isWindowError =
        /messaging window|template is required|template required|Reply from the Instagram/i.test(msg);

      if (isWindowError) {
        toast.error("Cannot send message", {
          description:
            channel === "instagram"
              ? "The Instagram reply window has closed. Use Open Instagram Inbox below, or wait for the customer to message you."
              : channel === "facebook"
                ? "The Facebook reply window has closed. Use Open Meta Inbox below, or wait for the customer to message you."
                : channel === "whatsapp"
                  ? "The 24-hour WhatsApp window has closed. Send an approved template instead."
                  : msg,
          duration: 7000,
        });
      } else {
        toast.error(msg);
      }
      return false;
    }
  };

  const sendWhatsAppTemplate = useSendWhatsAppTemplate();

  const handleSendTemplate = async (templateId: string, variables: Record<string, string>) => {
    if (!selectedConversation || !selectedContactId) return false;
    
    try {
      const data = await sendWhatsAppTemplate.mutateAsync({
        id: selectedConversation.id,
        templateId,
        variables
      });
      if (!data.result?.ok || !data.message) {
        toast.error(data.result?.error || "Template failed to send");
        return false;
      }
      toast.success("Template sent — awaiting delivery confirmation");
      return true;
    } catch (err: any) {
      toast.error(err.message || "Failed to send template");
      return false;
    }
  };

  const handleResolve = () => {
    if (!selectedConversation || !selectedContactId) return;
    const channel = selectedConversation.channelType;
    const resolvedId = selectedConversation.id;

    updateStatus.mutate(
      { id: resolvedId, status: "resolved" },
      {
        onSuccess: () => {
          toast.success(`${channelLabel(channel)} resolved`);
        },
        onError: (err) => toast.error(err.message || "Failed to resolve channel"),
      },
    );
  };

  useInboxKeyboardShortcuts({
    enabled: true,
    onToggleShortcuts: () => setShortcutsOpen((v) => !v),
    onNextConversation: () => {
      if (!listConversations.length) return;
      const idx = listConversations.findIndex((c) => c.contactId === selectedContactId);
      const next = listConversations[(idx < 0 ? -1 : idx) + 1];
      if (next) setSelectedContactId(next.contactId);
    },
    onPrevConversation: () => {
      if (!listConversations.length) return;
      const idx = listConversations.findIndex((c) => c.contactId === selectedContactId);
      const prev = listConversations[idx <= 0 ? listConversations.length - 1 : idx - 1];
      if (prev) setSelectedContactId(prev.contactId);
    },
    onResolve: handleResolve,
    onAssignToSelf: () => {
      toast.message("Assign from ticket detail — inbox claim is not enabled yet");
    },
  });

  const handleClearChat = () => {
    if (!selectedConversation || !selectedContactId) return;
    setPendingDelete({
      kind: "clear",
      conversationId: selectedConversation.id,
      channel: selectedConversation.channelType,
    });
  };

  const handleDeleteMessages = (messageIds: string[]): Promise<boolean> => {
    if (!selectedConversation || messageIds.length === 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      setPendingDelete({
        kind: "messages",
        conversationId: selectedConversation.id,
        channel: selectedConversation.channelType,
        messageIds,
        resolve,
      });
    });
  };

  const closeDeleteDialog = (ok = false) => {
    if (pendingDelete?.kind === "messages") pendingDelete.resolve(ok);
    setPendingDelete(null);
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;

    if (pendingDelete.kind === "clear") {
      const { conversationId, channel } = pendingDelete;
      suppressConversation.mutate(conversationId, {
        onSuccess: () => {
          toast.success(`${channelLabel(channel)} conversation cleared`);
          setPendingDelete(null);
        },
        onError: (err) => {
          toast.error(err.message || "Failed to clear conversation");
          setPendingDelete(null);
        },
      });
      return;
    }

    const { conversationId, messageIds, resolve } = pendingDelete;
    try {
      await deleteMessages.mutateAsync({ id: conversationId, messageIds });
      toast.success(
        messageIds.length === 1
          ? "Message deleted"
          : `${messageIds.length} messages deleted`,
      );
      resolve(true);
      setPendingDelete(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete messages");
      resolve(false);
      setPendingDelete(null);
    }
  };

  const deleteDialogBusy =
    (pendingDelete?.kind === "clear" && suppressConversation.isPending) ||
    (pendingDelete?.kind === "messages" && deleteMessages.isPending);

  const deleteDialogTitle =
    pendingDelete?.kind === "clear"
      ? `Clear ${channelLabel(pendingDelete.channel)} conversation?`
      : pendingDelete?.kind === "messages"
        ? `Delete ${pendingDelete.messageIds.length} ${channelLabel(pendingDelete.channel)} message${
            pendingDelete.messageIds.length === 1 ? "" : "s"
          }?`
        : "";

  const deleteDialogDescription =
    pendingDelete?.kind === "clear" ? (
      <>
        This removes every {channelLabel(pendingDelete.channel)} message for this contact.
        New messages from the customer will still appear.
      </>
    ) : pendingDelete?.kind === "messages" ? (
      <>
        This removes the selected message
        {pendingDelete.messageIds.length === 1 ? "" : "s"}. This cannot be undone.
      </>
    ) : null;

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-background relative">
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={deleteDialogTitle}
        description={deleteDialogDescription}
        confirmLabel={pendingDelete?.kind === "clear" ? "Clear conversation" : "Delete"}
        cancelLabel="Cancel"
        destructive
        confirming={deleteDialogBusy}
        onConfirm={() => void confirmPendingDelete()}
        onCancel={() => closeDeleteDialog(false)}
      />
      <ConfirmDialog
        open={confirmCreateAnother}
        title="Active ticket already exists"
        description={
          activeTicket ? (
            <>
              Ticket #{activeTicket.number} is still{" "}
              <span className="font-medium text-foreground">
                {activeTicket.status.replaceAll("_", " ").toLowerCase()}
              </span>{" "}
              for this conversation. Create another ticket anyway?
            </>
          ) : (
            "An active ticket already exists for this conversation. Create another one anyway?"
          )
        }
        confirmLabel="Create another"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmCreateAnother(false);
          openCreateTicket();
        }}
        onCancel={() => setConfirmCreateAnother(false)}
      />
      {/* Outer group keeps the contacts list width stable; customer toggle only affects the inner group. */}
      <PanelGroup direction="horizontal" autoSaveId="inbox-list-panels-v3" className="flex h-full w-full">
        <Panel defaultSize={20} minSize={16} maxSize={36} className="flex shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="text-base font-semibold tracking-tight text-foreground">Inbox</h1>
            <LivePulse active={conversationsFetching || !conversationsPending} />
          </div>
          <div className="flex h-8 shrink-0 items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={cn(
                "h-full rounded px-2.5 text-[11px] font-medium leading-none",
                statusFilter === "active"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Unresolved
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "h-full rounded px-2.5 text-[11px] font-medium leading-none",
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
          </div>
        </div>

        <div className="space-y-2 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts…"
              className="h-9 w-full rounded-md border border-border bg-background py-0 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {(channelFilterOptions.length > 0 || intentClassifierEnabled) ? (
            <div className="flex min-w-0 items-center gap-2">
              {channelFilterOptions.length > 0 ? (
                <div
                  className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-hide"
                  role="tablist"
                  aria-label="Channel filter"
                >
                  {channelFilterOptions.map((option) => {
                    const selected = channelFilter === option.id;
                    const Icon =
                      option.id === "all" ? null : CHANNEL_FILTER_ICONS[option.id];
                    const shortLabel =
                      option.id === "whatsapp"
                        ? "WA"
                        : option.id === "instagram"
                          ? "IG"
                          : option.id === "facebook"
                            ? "FB"
                            : option.id === "web_chat"
                              ? "Web"
                              : option.id === "email"
                                ? "Email"
                                : option.label;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setChannelFilter(option.id)}
                        title={option.label}
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium leading-none transition-colors",
                          selected
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        {Icon ? <Icon className="h-3 w-3" /> : null}
                        <span>{shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1" />
              )}
              {intentClassifierEnabled ? (
                <div className="relative ml-auto shrink-0" ref={intentMenuRef}>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={intentMenuOpen}
                    onClick={() => setIntentMenuOpen((open) => !open)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium leading-none text-foreground transition-colors hover:bg-muted/60",
                      intentFilter !== "all" && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <span className="text-muted-foreground">Intent</span>
                    <span>{intentFilterLabel}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                  {intentMenuOpen ? (
                    <div
                      role="listbox"
                      aria-label="Intent filter"
                      className="absolute right-0 top-full z-40 mt-1 min-w-[9.5rem] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
                    >
                      {INTENT_FILTERS.map((option) => {
                        const selected = intentFilter === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setIntentFilter(option.id);
                              setIntentMenuOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center px-3 py-2 text-left text-xs transition-colors",
                              selected
                                ? "bg-muted font-medium text-foreground"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <ConversationList
          conversations={listConversations}
          channelConversationsByContact={conversationsByContact}
          selectedContactId={selectedContactId}
          onSelect={handleSelectConversation}
          emptyHint={listEmptyHint}
          channelFilter={channelFilter}
          readScopeKeys={readScopeKeys}
          showIntent={intentClassifierEnabled}
          intentGroupFilter={intentFilter}
        />
      </Panel>

      <PanelResizeHandle className="w-1.5 flex items-center justify-center bg-border/50 hover:bg-primary/50 transition-colors cursor-col-resize z-10">
        <div className="h-6 w-1 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
      </PanelResizeHandle>

      <Panel defaultSize={80} minSize={40} className="flex min-w-0 flex-1 flex-col">
        <PanelGroup
          direction="horizontal"
          autoSaveId="inbox-thread-customer-v3"
          className="flex h-full w-full"
        >
          <Panel defaultSize={customerContextOpen ? 72 : 100} minSize={40} className="flex min-w-0 flex-1 flex-col">
            {!selectedContactId || !selectedContact ? (
              <ConversationEmptyState />
            ) : (
              <ConversationThread
              key={selectedConversation?.id ?? selectedContactId}
              contactName={contactDisplayName(selectedContact)}
              contact={selectedContact}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              conversationsByChannel={contactConversations}
              selectedConversation={selectedConversation}
              emailThreads={emailThreads}
              composingNewEmail={composingNewEmail}
              onSelectEmailThread={(id) => {
                setComposingNewEmail(false);
                setSelectedEmailThreadId(id);
              }}
              onComposeNewEmail={() => {
                setComposingNewEmail(true);
                setSelectedEmailThreadId(null);
              }}
              messages={showMessagesLoader ? undefined : messages}
              loadingMessages={showMessagesLoader}
              onResolve={handleResolve}
              resolving={updateStatus.isPending}
              onClearChat={handleClearChat}
              clearingChat={suppressConversation.isPending}
              onDeleteMessages={handleDeleteMessages}
              deletingMessages={deleteMessages.isPending}
              onSend={handleSend}
              onSendTemplate={handleSendTemplate}
              sending={sendMessage.isPending || sendWhatsAppTemplate.isPending}
              customerContextOpen={customerContextOpen}
              onToggleCustomerContext={() => setCustomerContextOpenPersisted((open) => !open)}
              enabledChannels={enabledChannels}
            />
          )}
          </Panel>

          {customerContextOpen && (
            <>
              <PanelResizeHandle className="w-1.5 flex items-center justify-center bg-border/50 hover:bg-primary/50 transition-colors cursor-col-resize z-10">
                <div className="h-6 w-1 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
              </PanelResizeHandle>
              <Panel defaultSize={28} minSize={18} maxSize={40} className="flex shrink-0 flex-col border-l border-border bg-card">
                <CustomerDetails
                  key={selectedContactId ?? "none"}
                  contact={selectedContact}
                  conversationsByChannel={contactConversations}
                  onClose={() => setCustomerContextOpenPersisted(false)}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </Panel>
      </PanelGroup>

      {/* Ticket CTA — visible when a conversation is selected */}
      {selectedConversation && (
        viewTicket ? (
          <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
            <button
              id="inbox-view-ticket-btn"
              type="button"
              onClick={() => navigate(`/tickets/${viewTicket.id}`)}
              title={`View Ticket #${viewTicket.number}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-md hover:bg-muted transition-colors"
            >
              <TicketIcon className="h-4 w-4 text-muted-foreground" />
              View Ticket #{viewTicket.number}
              {!activeTicket && (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {viewTicket.status === "RESOLVED" ? "Resolved" : "Closed"}
                </span>
              )}
            </button>
            <button
              id="inbox-create-ticket-btn"
              type="button"
              onClick={handleCreateTicketClick}
              title={
                activeTicket
                  ? "Create another ticket for this conversation"
                  : "Create Ticket from this conversation"
              }
              className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {activeTicket ? "Create Another" : "Create Ticket"}
            </button>
          </div>
        ) : (
          <button
            id="inbox-create-ticket-btn"
            type="button"
            onClick={openCreateTicket}
            title="Create Ticket from this conversation"
            className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
          >
            <TicketIcon className="h-4 w-4" />
            Create Ticket
          </button>
        )
      )}

      {createTicketConv && (
        <CreateTicketModal
          conversationId={createTicketConv.conversationId}
          channel={createTicketConv.channel}
          customerId={createTicketConv.customerId}
          onClose={() => setCreateTicketConv(null)}
        />
      )}

      <KeyboardShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

