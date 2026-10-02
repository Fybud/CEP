import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Loader2,
  MessageSquare,
  Mic,
  MoreVertical,
  PanelRight,
  Paperclip,
  Send,
  Square,
  Trash2,
  X,
  FileVideo,
  FileAudio,
  FileText,
  FileImage,
  Ban,
  AlertTriangle,
  TicketIcon,
  Plus,
  Pin,
} from "lucide-react";
import type { ChannelType, Conversation, Message } from "../../api";
import {
  useFeatureFlag,
  downloadTranscript,
  useToggleContactPin,
  useBlockCustomer,
  useUnblockCustomer,
  useBlockedContacts,
} from "../../api";
import { resolveConversationWindow } from "../../lib/messagingWindow";
import {
  uploadConversationAttachment,
  channelSupportsAttachments,
  getChannelMediaLimit,
  formatBytes,
} from "../../lib/channel-media";
import { useDraft } from "../../lib/useDraft";
import { useAuthStore } from "../../store/auth";
import { MessageMedia } from "./MessageMedia";
import {
  InstagramExternalInboxPanel,
  FacebookExternalInboxPanel,
  WhatsAppTemplateClosedPanel,
} from "./ConversationWindowBanner";
import { WhatsAppTemplateSelector } from "./WhatsAppTemplateSelector";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { toast } from "sonner";
import {
  CHANNELS,
  channelLabel,
  cn,
  emailThreadLabel,
  formatBubbleTime,
  formatDaySeparator,
  formatIdentities,
  identitiesFor,
  initials,
  isActiveStatus,
  isSameCalendarDay,
} from "./utils";

const LONG_MESSAGE_CHARS = 480;

function sanitizeEmailHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  // Keep <style> — many marketing emails depend on it. Strip executable surfaces only.
  document
    .querySelectorAll("script, iframe, object, embed, form, link, meta")
    .forEach((element) => element.remove());

  document.body.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        ((name === "href" || name === "src" || name === "action") &&
          /^(?:javascript|vbscript):|^data:text\/html/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return document.body.innerHTML;
}

const EMAIL_COLLAPSED_MAX_PX = 320;

/**
 * Renders an HTML email body inside a sandboxed iframe.
 * Parent clips with max-height for expand/collapse — never truncate the HTML string.
 */
function EmailIframe({
  html,
  onContentHeight,
}: {
  html: string;
  onContentHeight?: (height: number) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onHeightRef = useRef(onContentHeight);
  onHeightRef.current = onContentHeight;

  const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  img, video { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  td, th { word-break: break-word; overflow-wrap: anywhere; }
  a { color: inherit; }
</style>
</head>
<body>${html}</body>
</html>`;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let scheduled = 0;
    const timers: number[] = [];

    const fit = () => {
      try {
        const doc = iframe.contentDocument;
        const body = doc?.body;
        if (!doc || !body) return;

        body.style.transform = "none";
        body.style.width = "auto";

        const frameWidth = Math.max(iframe.clientWidth, 1);
        const contentWidth = Math.max(
          body.scrollWidth,
          doc.documentElement.scrollWidth,
          1,
        );
        const scale = contentWidth > frameWidth + 1 ? frameWidth / contentWidth : 1;

        if (scale < 1) {
          body.style.transformOrigin = "top left";
          body.style.transform = `scale(${scale})`;
          body.style.width = `${100 / scale}%`;
        } else {
          body.style.transform = "";
          body.style.width = "";
        }

        const rawHeight = Math.max(body.scrollHeight, doc.documentElement.scrollHeight, 1);
        const height = Math.max(24, Math.ceil(rawHeight * scale));
        iframe.style.height = `${height}px`;
        onHeightRef.current?.(height);
      } catch {
        // ignore
      }
    };

    const scheduleFit = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(fit);
    };

    let frameRo: ResizeObserver | null = null;
    const onLoad = () => {
      scheduleFit();
      for (const ms of [150, 400, 1000]) {
        timers.push(window.setTimeout(scheduleFit, ms));
      }
      try {
        frameRo = new ResizeObserver(scheduleFit);
        frameRo.observe(iframe);
      } catch {
        // ignore
      }
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") onLoad();

    return () => {
      iframe.removeEventListener("load", onLoad);
      cancelAnimationFrame(scheduled);
      timers.forEach((id) => window.clearTimeout(id));
      frameRo?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-same-origin allow-popups"
      referrerPolicy="no-referrer"
      title="Email content"
      style={{ width: "100%", height: 24, border: "none", display: "block", overflow: "hidden" }}
      scrolling="no"
    />
  );
}

function MessageBody({
  message,
  showBodyLabel,
  incoming,
}: {
  message: Message;
  showBodyLabel: boolean;
  incoming: boolean;
}) {
  const content = message.content;
  const [expanded, setExpanded] = useState(false);
  const [emailHeight, setEmailHeight] = useState(0);

  // ── Template message rendering ────────────────────────────────────────────
  if (message.contentType === "template") {
    // Legacy format: [WhatsApp Template: name] — extract name and show badge only
    const legacyMatch = content.match(/^\[WhatsApp Template:\s*(.+)\]$/i);
    if (legacyMatch) {
      const name = legacyMatch[1].replace(/_/g, " ");
      return (
        <div className="min-w-0 space-y-1">
          <div className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            incoming ? "bg-primary/10 text-primary" : "bg-white/20 text-white/80",
          )}>
            Template
          </div>
          <div className="break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{name}</div>
        </div>
      );
    }
    // New format: actual rendered body text — show body + a small "Template" badge
    const isLongTpl = content.length > LONG_MESSAGE_CHARS;
    const visibleTpl = !isLongTpl || expanded ? content : `${content.slice(0, LONG_MESSAGE_CHARS).trimEnd()}…`;
    return (
      <div className="min-w-0 space-y-1">
        <div className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          incoming ? "bg-primary/10 text-primary" : "bg-white/20 text-white/80",
        )}>
          Template
        </div>
        <div className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
          {visibleTpl}
        </div>
        {isLongTpl && (
          <button
            type="button"
            className={cn("mt-1 text-[11px] font-medium underline-offset-2 hover:underline", incoming ? "text-primary" : "text-primary-foreground/90")}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpanded((v) => !v); }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  const isHtmlEmail = message.contentType === "html";
  // Plain text only: char truncation. HTML uses max-height clip so markup stays intact.
  const isLong = !isHtmlEmail && content.length > LONG_MESSAGE_CHARS;
  const visible = !isLong || expanded ? content : `${content.slice(0, LONG_MESSAGE_CHARS).trimEnd()}…`;
  const isMediaPlaceholder = /^\[(image|audio|video|file|document)\]$/i.test(content.trim());
  /** Backend sometimes stores the type name as content when there's no caption. */
  const isGenericMediaLabel = /^(image|audio|video|file|document)$/i.test(content.trim());
  const isMediaType = ["image", "video", "audio", "file"].includes(message.contentType);
  const showText =
    Boolean(content.trim()) &&
    !(message.hasMedia && (isMediaPlaceholder || isGenericMediaLabel)) &&
    !(!message.hasMedia && (isMediaPlaceholder || isMediaType || isGenericMediaLabel));
  const showMissingMedia =
    !message.hasMedia && (isMediaPlaceholder || isMediaType || isGenericMediaLabel);
  const renderedHtml = isHtmlEmail ? sanitizeEmailHtml(content) : "";
  const emailNeedsToggle = isHtmlEmail && emailHeight > EMAIL_COLLAPSED_MAX_PX + 8;

  return (
    <div className="min-w-0 space-y-1.5">
      {message.hasMedia && (
        <div className="flex flex-col gap-2">
          {(message.mediaItems?.length
            ? message.mediaItems
            : [
                {
                  mediaKey: "",
                  mimeType: message.mediaMimeType ?? "application/octet-stream",
                  filename: message.mediaFilename,
                  contentType: message.contentType,
                },
              ]
          ).map((item, index) => (
            <MessageMedia
              key={`${message.id}-${index}-${item.filename ?? item.mimeType}`}
              messageId={message.id}
              index={index}
              mimeType={item.mimeType}
              filename={item.filename}
              contentType={item.contentType ?? message.contentType}
              incoming={incoming}
            />
          ))}
        </div>
      )}
      {showMissingMedia && (
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {message.contentType === "image" || /^\[image\]$/i.test(content.trim())
            ? "Image unavailable"
            : "Attachment unavailable"}
        </div>
      )}
      {showText && (
        <div>
          {showBodyLabel && (
            <span className="mb-1 mr-2 block text-[10px] font-bold uppercase tracking-wider opacity-60">
              Body:
            </span>
          )}
          {isHtmlEmail ? (
            <div
              className="relative overflow-hidden rounded-md border border-border/60 bg-white"
              style={
                emailNeedsToggle && !expanded
                  ? { maxHeight: EMAIL_COLLAPSED_MAX_PX }
                  : undefined
              }
            >
              <EmailIframe html={renderedHtml} onContentHeight={setEmailHeight} />
              {emailNeedsToggle && !expanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
              )}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
              {visible}
            </div>
          )}
          {(isLong || emailNeedsToggle) && (
            <button
              type="button"
              className={cn(
                "mt-1 text-[11px] font-medium underline-offset-2 hover:underline",
                incoming ? "text-primary" : "text-primary-foreground/90",
              )}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setExpanded((v) => !v);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  contactName: string;
  contact?: any;
  activeTab: ChannelType;
  onTabChange: (channel: ChannelType) => void;
  conversationsByChannel: Partial<Record<ChannelType, Conversation>>;
  selectedConversation: Conversation | null;
  /** All Gmail threads for this contact (email channel only). */
  emailThreads?: Conversation[];
  composingNewEmail?: boolean;
  onSelectEmailThread?: (conversationId: string) => void;
  onComposeNewEmail?: () => void;
  messages: Message[] | undefined;
  loadingMessages: boolean;
  onResolve: () => void;
  resolving: boolean;
  onClearChat?: () => void;
  clearingChat?: boolean;
  onDeleteMessages?: (messageIds: string[]) => Promise<boolean>;
  deletingMessages?: boolean;
  onSend: (
    content: string,
    subject?: string,
    media?: { mediaKey: string; mediaMimeType: string; mediaFilename: string },
  ) => Promise<boolean>;
  onSendTemplate?: (
    templateId: string,
    variables: Record<string, string>
  ) => Promise<boolean>;
  sending: boolean;
  customerContextOpen: boolean;
  onToggleCustomerContext: () => void;
  enabledChannels?: ChannelType[];
  viewTicket?: any;
  activeTicket?: any;
  onViewTicket?: () => void;
  onCreateTicket?: () => void;
};

export function ConversationThread({
  contactName,
  contact,
  activeTab,
  onTabChange,
  conversationsByChannel,
  selectedConversation,
  emailThreads = [],
  composingNewEmail = false,
  onSelectEmailThread,
  onComposeNewEmail,
  messages,
  loadingMessages,
  onResolve,
  resolving,
  onClearChat,
  clearingChat,
  onDeleteMessages,
  deletingMessages,
  onSend,
  onSendTemplate,
  sending,
  customerContextOpen,
  onToggleCustomerContext,
  enabledChannels,
  viewTicket,
  activeTicket,
  onViewTicket,
  onCreateTicket,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  const { draft, setDraft, clearDraft } = useDraft(selectedConversation?.id);
  const [subject, setSubject] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const blockCustomer = useBlockCustomer();
  const unblockCustomer = useUnblockCustomer();
  const { data: blockedRows } = useBlockedContacts();
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);

  const contactCustomerId =
    contact?.id || selectedConversation?.contactId || selectedConversation?.contact?.id || null;
  const isContactBlocked =
    Boolean(contact?.blocked) ||
    Boolean(selectedConversation?.contact?.blocked) ||
    (contactCustomerId
      ? Boolean(blockedRows?.some((row) => row.customerId === contactCustomerId))
      : false);

  const { data: featureFlag } = useFeatureFlag("whatsapp_templates_enabled");
  const { data: instagramHumanAgentFlag } = useFeatureFlag("instagram_human_agent_enabled");

  const effectiveWindow = resolveConversationWindow(
    activeTab,
    selectedConversation?.windowState,
    messages,
    instagramHumanAgentFlag?.enabled ?? false,
  );

  const composerBlocked =
    activeTab !== "email" &&
    (effectiveWindow.requiresExternalInbox ||
      effectiveWindow.state === "EXPIRED" ||
      (!effectiveWindow.canSendNormalMessage && effectiveWindow.state !== "TEMPLATE_REQUIRED"));

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Audio recording ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingCancelledRef = useRef(false);

  const toggleContactPin = useToggleContactPin();

  const startRecording = async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // If the user hit cancel/delete, discard the audio entirely
        if (recordingCancelledRef.current) {
          audioChunksRef.current = [];
          recordingCancelledRef.current = false;
          return;
        }
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const file = new File([blob], `voice-message-${timestamp}.${ext}`, { type: mimeType });
        const limit = getChannelMediaLimit(activeTab, mimeType);
        if (audioChunksRef.current.length > 0) {
          if (file.size > limit) {
            setFileError(`Recording too large (${formatBytes(limit)} limit for this channel)`);
          } else {
            setFileError(null);
            setPendingFile(file);
          }
        }
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      toast.error("Microphone access denied. Please allow microphone permission and try again.");
    }
  };

  const stopRecording = (cancel = false) => {
    if (!isRecording || !mediaRecorderRef.current) return;
    recordingCancelledRef.current = cancel; // checked inside onstop
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingSeconds(0);
  };

  const cancelRecording = () => {
    stopRecording(true);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);
  // ──────────────────────────────────────────────────────────────────────────

  const needsAttentionHere = Boolean(
    selectedConversation && isActiveStatus(selectedConversation.status),
  );
  const busy = resolving || clearingChat || deletingMessages;
  const hasMessages = Boolean(messages?.length);
  const isNewEmailCompose =
    activeTab === "email" &&
    (composingNewEmail || selectedConversation?.id.endsWith(":email:new"));
  const showChatMenu =
    Boolean(selectedConversation) && !selecting && !isNewEmailCompose;

  useEffect(() => {
    setPendingFile(null);
    setSelecting(false);
    setSelectedIds(new Set());
    setMenuOpen(false);
    if (isNewEmailCompose) {
      setSubject("");
    } else if (activeTab === "email" && selectedConversation?.threadSubject) {
      // Prefill reply subject from the selected thread; agent can still edit.
      const base = selectedConversation.threadSubject;
      setSubject(base.toLowerCase().startsWith("re:") ? base : `Re: ${base}`);
    } else {
      setSubject("");
    }
  }, [selectedConversation?.id, activeTab, isNewEmailCompose, selectedConversation?.threadSubject]);

  useEffect(() => {
    if (!messages?.length) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, messages?.[messages.length - 1]?.id]);

  const prevMessagesRef = useRef<Message[]>([]);
  // Reset previous messages snapshot when conversation changes to avoid stale comparisons
  useEffect(() => {
    prevMessagesRef.current = [];
  }, [selectedConversation?.id]);
  useEffect(() => {
    if (messages) {
      if (prevMessagesRef.current.length > 0) {
        for (const msg of messages) {
          const prev = prevMessagesRef.current.find((m) => m.id === msg.id);
          if (prev && prev.status !== "failed" && msg.status === "failed") {
            toast.error(msg.errorMessage ? `Message failed: ${msg.errorMessage}` : "Message failed to send");
          }
        }
      }
      prevMessagesRef.current = messages;
    }
  }, [messages]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSend = async () => {
    const content = draft.trim();
    if ((!content && !pendingFile) || sending || uploading || !selectedConversation) return;
    const subjectValue = activeTab === "email" ? subject.trim() : undefined;

    let media: { mediaKey: string; mediaMimeType: string; mediaFilename: string } | undefined;
    if (pendingFile && channelSupportsAttachments(activeTab)) {
      setUploading(true);
      try {
        const uploaded = await uploadConversationAttachment(selectedConversation.id, pendingFile);
        media = {
          mediaKey: uploaded.mediaKey,
          mediaMimeType: uploaded.mediaMimeType,
          mediaFilename: uploaded.mediaFilename,
        };
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        return;
      } finally {
        setUploading(false);
      }
    }

    const ok = await onSend(content, subjectValue, media);
    if (ok) {
      clearDraft();
      setSubject("");
      setPendingFile(null);
      setFileError(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set((messages ?? []).map((m) => m.id)));
  };

  const exitSelectMode = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (!onDeleteMessages || selectedIds.size === 0) return;
    const ok = await onDeleteMessages([...selectedIds]);
    if (ok) exitSelectMode();
  };

  const channelIds = contact ? identitiesFor(contact, activeTab) : [];
  const identity = channelIds.length
    ? formatIdentities(channelIds, activeTab)
    : null;
  const canInitiateChannel = activeTab === "email" || activeTab === "whatsapp";
  const isLinkedAwaitingFirst =
    Boolean(selectedConversation) && !hasMessages && channelIds.length > 0;

  if (loadingMessages) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-40 max-w-[50%] animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 max-w-[35%] animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
          <div className="h-6 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4 overflow-hidden">
          <div className="flex w-full justify-start">
            <div className="h-10 w-2/3 animate-pulse rounded-2xl rounded-tl-sm bg-muted/60" />
          </div>
          <div className="flex w-full justify-end">
            <div className="h-14 w-3/4 animate-pulse rounded-2xl rounded-tr-sm bg-primary/10" />
          </div>
          <div className="flex w-full justify-start">
            <div className="h-20 w-1/2 animate-pulse rounded-2xl rounded-tl-sm bg-muted/60" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <ConfirmDialog
        open={blockConfirmOpen}
        title="Block contact?"
        description={
          <>
            New messages from this contact will no longer appear in your inbox.
          </>
        }
        confirmLabel="Block"
        cancelLabel="Cancel"
        destructive
        confirming={blockCustomer.isPending}
        onConfirm={() => {
          const customerId = selectedConversation?.contactId;
          if (!customerId) {
            setBlockConfirmOpen(false);
            return;
          }
          blockCustomer.mutate(
            { customerId },
            {
              onSuccess: () => {
                toast.success("Contact blocked");
                setBlockConfirmOpen(false);
              },
              onError: (err) => {
                toast.error(err.message || "Failed to block contact");
              },
            },
          );
        }}
        onCancel={() => setBlockConfirmOpen(false)}
      />
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(contactName)}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">{contactName}</h2>
              {isContactBlocked ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  <Ban className="h-3 w-3" />
                  Blocked
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {identity ? `${channelLabel(activeTab)}: ${identity}` : channelLabel(activeTab)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {selectedConversation && needsAttentionHere && !selecting && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResolve}
              disabled={busy}
              className="gap-2 border-emerald-500/40 bg-emerald-500/5 text-emerald-800 hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">Resolve {channelLabel(activeTab)}</span>
              <span className="sm:hidden">Resolve</span>
            </Button>
          )}

          {selectedConversation && viewTicket && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewTicket}
              title={`View Ticket #${viewTicket.number}`}
              className="gap-2"
            >
              <TicketIcon className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">Ticket #{viewTicket.number}</span>
              {!activeTicket && (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {viewTicket.status === "RESOLVED" ? "Resolved" : "Closed"}
                </span>
              )}
            </Button>
          )}

          {selectedConversation && onCreateTicket && (
            <Button
              variant="default"
              size="sm"
              onClick={onCreateTicket}
              title={activeTicket ? "Create another ticket" : "Create Ticket"}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{activeTicket ? "Create Another" : "Create Ticket"}</span>
            </Button>
          )}

          <Button
            variant={customerContextOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleCustomerContext}
            className="h-9 w-9"
            aria-pressed={customerContextOpen}
            aria-label={customerContextOpen ? "Hide customer details" : "Show customer details"}
            title={customerContextOpen ? "Hide customer details" : "Customer details"}
          >
            <PanelRight className="h-4 w-4" />
          </Button>

          {showChatMenu && (
            <div className="relative" ref={menuRef}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="More actions"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
                >
                  {selectedConversation && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                      disabled={toggleContactPin.isPending}
                      onClick={() => {
                        setMenuOpen(false);
                        toggleContactPin.mutate(selectedConversation.id, {
                          onSuccess: (res) =>
                            toast.success(res.pinned ? "Pinned to top" : "Unpinned"),
                          onError: (err) =>
                            toast.error(err.message || "Could not update pin"),
                        });
                      }}
                    >
                      <Pin
                        className={cn(
                          "h-4 w-4 text-muted-foreground",
                          selectedConversation.pinned && "fill-primary text-primary",
                        )}
                      />
                      {selectedConversation.pinned ? "Unpin contact" : "Pin contact"}
                    </button>
                  )}
                  {isAdmin && onDeleteMessages && hasMessages && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                      onClick={() => {
                        setMenuOpen(false);
                        setSelecting(true);
                      }}
                    >
                      <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      Select messages
                    </button>
                  )}
                  {selectedConversation && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                      onClick={() => {
                        setMenuOpen(false);
                        void downloadTranscript(selectedConversation.id).catch((err) => {
                          toast.error(err?.message || "Failed to download transcript");
                        });
                      }}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Download transcript
                    </button>
                  )}
                  {selectedConversation && !isContactBlocked && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setMenuOpen(false);
                        setBlockConfirmOpen(true);
                      }}
                    >
                      <Ban className="h-4 w-4" />
                      Block contact
                    </button>
                  )}
                  {selectedConversation && isContactBlocked && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                      disabled={unblockCustomer.isPending}
                      onClick={() => {
                        setMenuOpen(false);
                        if (!contactCustomerId) return;
                        unblockCustomer.mutate(contactCustomerId, {
                          onSuccess: () => toast.success("Contact unblocked"),
                          onError: (err) =>
                            toast.error(err.message || "Failed to unblock contact"),
                        });
                      }}
                    >
                      <Ban className="h-4 w-4 text-muted-foreground" />
                      Unblock contact
                    </button>
                  )}
                  {onClearChat && isAdmin && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!hasMessages || busy}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
                      onClick={() => {
                        setMenuOpen(false);
                        onClearChat();
                      }}
                    >
                      {clearingChat ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Clear chat
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isContactBlocked ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-destructive">This contact is blocked</p>
            <p className="text-[11px] text-muted-foreground">
              Incoming messages are ignored on all channels.
            </p>
          </div>
        </div>
      ) : null}

      {selecting && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-2">
          <p className="text-sm text-muted-foreground">
            {selectedIds.size === 0
              ? "Tap messages to select"
              : `${selectedIds.size} selected`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAll}
              disabled={!hasMessages || busy}
            >
              Select all
            </Button>
            {isAdmin && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDeleteSelected()}
                disabled={selectedIds.size === 0 || busy}
              >
                {deletingMessages ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete selected
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={exitSelectMode}
              disabled={busy}
              className="gap-1"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex h-11 shrink-0 items-stretch gap-0 border-b border-border bg-card px-2">
        {(enabledChannels
          ? CHANNELS.filter((c) => enabledChannels.includes(c.id))
          : []
        ).map((channel) => {
          const conversation =
            channel.id === "email"
              ? emailThreads[0] || conversationsByChannel[channel.id]
              : conversationsByChannel[channel.id];
          const linkedIds = contact ? identitiesFor(contact, channel.id) : [];
          const canStart =
            channel.id === "email" || channel.id === "whatsapp"
              ? linkedIds.length > 0
              : false;
          const hasConversation =
            channel.id === "email"
              ? emailThreads.length > 0 || Boolean(conversationsByChannel.email)
              : Boolean(conversation);
          const tabAvailable = hasConversation || canStart;
          const channelNeedsAttention = conversation
            ? isActiveStatus(conversation.status)
            : false;
          const selected = activeTab === channel.id;

          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => onTabChange(channel.id)}
              className={cn(
                "relative inline-flex items-center gap-2 px-3.5 text-sm font-medium transition-colors",
                selected
                  ? "bg-muted/70 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                !tabAvailable && !selected && "opacity-50",
              )}
              title={
                conversation
                  ? `${channel.label} · ${conversation.status}${
                      channelNeedsAttention ? " · open" : ""
                    }`
                  : canStart
                    ? `${channel.label} · linked · send first message`
                    : `${channel.label} · no thread yet`
              }
            >
              {selected && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
              {channelNeedsAttention && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              )}
              {!channelNeedsAttention && hasConversation && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              )}
              <span>{channel.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "email" && (emailThreads.length > 0 || onComposeNewEmail) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
          <div
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-hide"
            role="tablist"
            aria-label="Email threads"
          >
            {emailThreads.map((thread) => {
              const selected =
                !isNewEmailCompose && selectedConversation?.id === thread.id;
              const label = emailThreadLabel(thread);
              return (
                <button
                  key={thread.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={label}
                  onClick={() => onSelectEmailThread?.(thread.id)}
                  className={cn(
                    "max-w-[200px] shrink-0 truncate rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
            {onComposeNewEmail && (
              <button
                type="button"
                role="tab"
                aria-selected={isNewEmailCompose}
                onClick={() => onComposeNewEmail()}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isNewEmailCompose
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-dashed border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                + New email
              </button>
            )}
          </div>
        </div>
      )}

      {!selectedConversation ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {enabledChannels && enabledChannels.length === 0
                ? "No channels connected"
                : activeTab === "instagram"
                ? "Waiting for the customer on Instagram"
                : activeTab === "facebook"
                ? "Waiting for the customer on Facebook"
                : channelIds.length
                  ? `${channelLabel(activeTab)} linked · waiting for first message`
                  : `No ${channelLabel(activeTab)} on this contact`}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {enabledChannels && enabledChannels.length === 0
                ? "Connect a channel in Settings to start messaging."
                : activeTab === "instagram"
                ? "The customer needs to message first on Instagram. Switch tabs for WhatsApp or Email."
                : activeTab === "facebook"
                ? "The customer needs to message first on Facebook Messenger. Switch tabs for WhatsApp or Email."
                : channelIds.length
                  ? canInitiateChannel
                    ? "You can send the first message from here."
                    : "Switch tabs to open another conversation."
                  : "Add this on the contact, then you can message from here."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-2.5 overflow-y-auto scrollbar-hide p-4 sm:p-5">
            {loadingMessages && !messages?.length && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingMessages && isLinkedAwaitingFirst && (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  {activeTab === "email"
                    ? "Email linked · waiting for first message."
                    : activeTab === "whatsapp"
                      ? "WhatsApp linked · send the first message."
                      : "No messages in this conversation yet."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canInitiateChannel
                    ? "Write a message below to get started."
                    : "Waiting for the customer to message first."}
                </p>
              </div>
            )}
            {!loadingMessages && !isLinkedAwaitingFirst && (!messages || messages.length === 0) && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No messages in this conversation yet.
              </div>
            )}
            {messages?.map((message, index) => {
              const incoming = message.direction === "incoming";
              const failed = !incoming && message.status === "failed";
              const isSelected = selectedIds.has(message.id);
              const prev = index > 0 ? messages[index - 1] : null;
              const showDaySeparator =
                !prev || !isSameCalendarDay(prev.createdAt, message.createdAt);
              const dayLabel = showDaySeparator
                ? formatDaySeparator(message.createdAt)
                : null;
              return (
                <Fragment key={message.id}>
                  {dayLabel && (
                    <div className="flex justify-center py-1.5">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        {dayLabel}
                      </span>
                    </div>
                  )}
                  <div
                    ref={(el) => {
                      if (el) messageRefs.current.set(message.id, el);
                      else messageRefs.current.delete(message.id);
                    }}
                    className={cn(
                      "flex w-fit max-w-[min(100%,48rem)] items-end group rounded-lg",
                      incoming ? "mr-auto" : "ml-auto flex-row-reverse",
                    )}
                  >
                  <div
                    className={cn(
                      "flex w-fit flex-col",
                      message.contentType === "html" || message.subject
                        ? "max-w-full w-full"
                        : "max-w-[min(100%,32rem)]",
                      incoming ? "items-start" : "items-end",
                    )}
                  >
                    <div className="flex max-w-full items-end gap-2 relative">
                      {selecting && (
                        <button
                          type="button"
                          aria-label={isSelected ? "Deselect message" : "Select message"}
                          onClick={() => toggleSelected(message.id)}
                          className={cn(
                            "mb-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px]",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-transparent",
                          )}
                        >
                          ✓
                        </button>
                      )}
                      <div
                        role={selecting ? "button" : undefined}
                        tabIndex={selecting ? 0 : undefined}
                        onClick={() => selecting && toggleSelected(message.id)}
                        onKeyDown={(e) => {
                          if (!selecting) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelected(message.id);
                          }
                        }}
                        className={cn(
                          "min-w-0 max-w-full overflow-hidden text-left text-sm",
                          message.hasMedia &&
                            !message.content
                              ?.trim()
                              ?.replace(/^\[(image|audio|video|file|document)\]$/i, "")
                            ? "rounded-xl p-1.5"
                            : "rounded-xl px-3 py-2",
                          incoming
                            ? "rounded-tl-sm border border-border bg-card text-foreground"
                            : failed
                              ? "rounded-tr-sm border border-destructive/40 bg-destructive/10 text-foreground"
                              : message.contentType === "html"
                                ? "rounded-tr-sm border border-border bg-card text-foreground"
                                : "rounded-tr-sm bg-primary text-primary-foreground",
                          selecting && "cursor-pointer",
                          selecting && isSelected && "ring-2 ring-primary ring-offset-1",
                          !selecting && "cursor-default",
                        )}
                      >
                        {message.subject && (
                          <div className="mb-2 border-b border-border/50 pb-2">
                            <span className="mr-2 text-[10px] font-bold uppercase tracking-wider opacity-60">
                              Subject:
                            </span>
                            <strong className="break-words text-[13px] font-semibold opacity-90 [overflow-wrap:anywhere]">
                              {message.subject}
                            </strong>
                          </div>
                        )}
                        {message.pinned && (
                          <div className="flex items-center gap-1 mb-1 text-primary">
                            <Pin className="h-3 w-3 fill-current" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider">Pinned</span>
                          </div>
                        )}
                        {!incoming && message.agentic ? (
                          <div
                            className={cn(
                              "mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider",
                              failed || message.contentType === "html"
                                ? "text-muted-foreground"
                                : "text-primary-foreground/80",
                            )}
                            title={
                              message.agenticIntent
                                ? `Auto-replied (${message.agenticIntent.replaceAll("_", " ")})`
                                : "Auto-replied"
                            }
                          >
                            Auto
                          </div>
                        ) : null}
                        <MessageBody
                          message={message}
                          showBodyLabel={Boolean(message.subject)}
                          incoming={incoming || failed || message.contentType === "html"}
                        />
                        <div
                          className={cn(
                            "mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70",
                            incoming || failed || message.contentType === "html"
                              ? "text-muted-foreground"
                              : "text-primary-foreground",
                          )}
                        >
                          <span title={new Date(message.createdAt).toLocaleString()}>
                            {formatBubbleTime(message.createdAt)}
                          </span>
                          {!incoming &&
                            (failed ? (
                              <AlertCircle className="h-3 w-3 text-destructive" />
                            ) : message.status === "queued" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 opacity-80" />
                            ))}
                        </div>
                      </div>
                    </div>
                    {failed && (
                      <p className="mt-1 text-[11px] text-destructive">
                        {message.errorMessage ? `Failed: ${message.errorMessage}` : "Failed to send"}
                      </p>
                    )}
                  </div>
                </div>
                </Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {!selecting && (
            <div className="shrink-0 border-t border-border bg-card">
              <div className="p-3">
                {effectiveWindow.state === "TEMPLATE_REQUIRED" ? (
                  <WhatsAppTemplateClosedPanel templatesEnabled={featureFlag?.enabled ?? false}>
                    <div className="flex justify-center">
                      <WhatsAppTemplateSelector
                        preferInternalCategory="CUSTOMER_REENGAGEMENT"
                        contactName={contactName}
                        onSelect={async (template, variables) => {
                          if (onSendTemplate) {
                            await onSendTemplate(template.id, variables);
                          } else {
                            toast.error("Template sending not fully wired on this page");
                          }
                        }}
                      />
                    </div>
                  </WhatsAppTemplateClosedPanel>
                ) : effectiveWindow.requiresExternalInbox && activeTab === "instagram" ? (
                  <InstagramExternalInboxPanel
                    contact={contact}
                    state={effectiveWindow.state === "EXPIRED" ? "EXPIRED" : "EXTENDED"}
                  />
                ) : effectiveWindow.requiresExternalInbox && activeTab === "facebook" ? (
                  <FacebookExternalInboxPanel contact={contact} />
                ) : composerBlocked ? (
                  activeTab === "instagram" ? (
                    <InstagramExternalInboxPanel contact={contact} state="EXPIRED" />
                  ) : activeTab === "facebook" ? (
                    <FacebookExternalInboxPanel contact={contact} />
                  ) : (
                    <WhatsAppTemplateClosedPanel templatesEnabled={false}>
                      <p className="text-center text-sm text-muted-foreground">
                        You cannot send a message from CEP until the customer replies again.
                      </p>
                    </WhatsAppTemplateClosedPanel>
                  )
                ) : (
                  <div
                    className={cn(
                      "flex flex-col gap-1.5 rounded-xl border bg-background p-1.5",
                      needsAttentionHere ? "border-primary/25" : "border-border",
                    )}
                  >
                  {/* Email subject line */}
                 {activeTab === "email" && (
                  <input
                    type="text"
                    placeholder={
                      isNewEmailCompose ? "Subject" : "Subject (reply keeps this thread)"
                    }
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full border-b border-border bg-transparent px-2 py-2 text-sm font-semibold placeholder:font-normal focus:outline-none"
                  />
                )}
                {fileError && (
                  <div className="flex items-center justify-between rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fileError}</span>
                    </div>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setFileError(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {pendingFile && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm border border-border">
                    {pendingFile.type.startsWith("image/") ? (
                      <FileImage className="h-4 w-4 shrink-0 text-blue-400" />
                    ) : pendingFile.type.startsWith("video/") ? (
                      <FileVideo className="h-4 w-4 shrink-0 text-purple-400" />
                    ) : pendingFile.type.startsWith("audio/") ? (
                      <FileAudio className="h-4 w-4 shrink-0 text-amber-400" />
                    ) : pendingFile.type.includes("pdf") ? (
                      <FileText className="h-4 w-4 shrink-0 text-red-400" />
                    ) : (
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{pendingFile.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatBytes(pendingFile.size)}
                    </span>
                    <button
                      type="button"
                      className="ml-2 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                      onClick={() => {
                        setPendingFile(null);
                        setFileError(null);
                      }}
                      aria-label="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-1">
                  {channelSupportsAttachments(activeTab) && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const limit = getChannelMediaLimit(activeTab, file.type || "application/octet-stream");
                          if (file.size > limit) {
                            setFileError(`File too large (${formatBytes(limit)} limit for ${channelLabel(activeTab)})`);
                            setPendingFile(null);
                          } else {
                            setFileError(null);
                            setPendingFile(file);
                          }
                          e.target.value = "";
                        }}
                      />
                      {/* Paperclip – attach file */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="mb-0.5 h-9 w-9 shrink-0"
                        disabled={sending || uploading || isRecording}
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach file"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>

                      {/* Microphone / Cancel Recording */}
                      {isRecording ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="mb-0.5 h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={cancelRecording}
                          title="Cancel recording"
                          aria-label="Cancel recording"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="mb-0.5 h-9 w-9 shrink-0"
                          disabled={sending || uploading || pendingFile !== null}
                          onClick={startRecording}
                          title="Record voice message"
                          aria-label="Record voice message"
                        >
                          <Mic className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                  {isRecording ? (
                    <div className="flex-1 flex items-center justify-between bg-transparent px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                        <span className="text-sm font-medium tabular-nums text-foreground tracking-widest">
                          {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700 font-medium"
                        onClick={() => stopRecording(false)}
                      >
                        <Square className="mr-2 h-3.5 w-3.5 fill-current" />
                        Stop
                      </Button>
                    </div>
                  ) : (
                    <div className="relative flex-1">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder={
                          isNewEmailCompose
                            ? "Write a new email…"
                            : isLinkedAwaitingFirst && canInitiateChannel
                              ? `Message on ${channelLabel(activeTab)}…`
                              : `Reply on ${channelLabel(activeTab)}…`
                        }
                        rows={1}
                        className="max-h-[120px] min-h-[40px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-relaxed focus:outline-none"
                      />
                    </div>
                  )}
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={
                      (!draft.trim() && !pendingFile) || 
                      sending || 
                      uploading || 
                      fileError !== null
                    }
                    className="mb-0.5 h-9 w-9 shrink-0"
                  >
                    {sending || uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              )}
              {selectedConversation?.windowState?.canSendNormalMessage !== false && (
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  ⌘/Ctrl+Enter to send
                </p>
              )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ConversationEmptyState() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card">
        <MessageSquare className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">Select a conversation</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Pick a contact from the list to open the conversation.
        </p>
      </div>
    </div>
  );
}

