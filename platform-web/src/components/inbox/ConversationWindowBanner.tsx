import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Clock, ExternalLink, Send } from "lucide-react";
import type { ChannelType, Contact } from "../../api";
import { formatDistanceToNow, intervalToDuration } from "date-fns";
import { Button } from "../ui/button";
import { instagramThreadOpenUrl } from "./utils";

type WindowState = "ACTIVE" | "EXTENDED" | "EXPIRED" | "TEMPLATE_REQUIRED";

interface Props {
  channel: ChannelType;
  state: WindowState;
  expiresAt: string | null;
  canSendNormalMessage: boolean;
  requiresTemplate: boolean;
  requiresHumanAgentTag: boolean;
  requiresExternalInbox?: boolean;
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const duration = intervalToDuration({ start: 0, end: ms });
  const hours = duration.hours ?? 0;
  const minutes = duration.minutes ?? 0;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ConversationWindowBanner({
  channel,
  state,
  expiresAt,
  requiresExternalInbox,
}: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (channel === "email" || !expiresAt) return;
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [channel, expiresAt]);

  if (channel === "email") return null;

  if (state === "ACTIVE" && expiresAt) {
    const remaining = formatRemaining(expiresAt);
    const expiringSoon =
      new Date(expiresAt).getTime() - Date.now() <= 60 * 60 * 1000;

    return (
      <div
        className={`flex items-center gap-2 border-b px-4 py-2 text-xs font-medium ${
          expiringSoon
            ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {expiringSoon ? (
          <AlertCircle className="h-4 w-4 shrink-0" />
        ) : (
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        )}
        <span>
          {channel === "whatsapp" ? "WhatsApp" : channel === "facebook" ? "Facebook" : "Instagram"} window active · expires in {remaining}
        </span>
      </div>
    );
  }

  if (state === "EXTENDED" && !requiresExternalInbox) {
    return (
      <div className="flex items-center gap-2 border-b border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-400">
        <Clock className="h-4 w-4 shrink-0" />
        <span>
          Extended 7-day Instagram window · expires{" "}
          {expiresAt ? formatDistanceToNow(new Date(expiresAt), { addSuffix: true }) : "soon"}
        </span>
      </div>
    );
  }

  return null;
}

function RecoveryBannerWrapper({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mx-4 mb-4">
      <div className="border-b border-border bg-muted/30 px-5 py-4 text-center">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="flex justify-center bg-background px-5 py-4">
        {children}
      </div>
    </div>
  );
}

interface InstagramExternalInboxPanelProps {
  contact: Contact | null;
  state: "EXPIRED" | "EXTENDED";
}

export function InstagramExternalInboxPanel({ contact, state }: InstagramExternalInboxPanelProps) {
  const link = instagramThreadOpenUrl(contact);
  const isExpired = state === "EXPIRED";

  return (
    <RecoveryBannerWrapper
      title="Instagram window closed"
      description={isExpired ? "The 7-day messaging window has expired. Please use the Instagram app to reply." : "The 24-hour messaging window has expired. Please use the Instagram app to reply."}
    >
      {link.hasDirectThread && link.handleLabel ? (
        <Button asChild size="sm" className="gap-2 shadow-sm">
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <Send className="h-4 w-4" />
            Message {link.handleLabel}
          </a>
        </Button>
      ) : (
        <Button asChild variant="default" size="sm" className="gap-2">
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            Open Instagram Inbox
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      )}
    </RecoveryBannerWrapper>
  );
}

interface WhatsAppTemplateClosedPanelProps {
  templatesEnabled: boolean;
  children: ReactNode;
}

export function WhatsAppTemplateClosedPanel({
  templatesEnabled,
  children,
}: WhatsAppTemplateClosedPanelProps) {
  if (!templatesEnabled) {
    return (
      <RecoveryBannerWrapper
        title="WhatsApp window closed"
        description="The 24-hour service window has expired. You must wait for the customer to send a new message before you can reply."
      >
        <Button disabled variant="secondary" size="sm">Template sending disabled</Button>
      </RecoveryBannerWrapper>
    );
  }

  return (
    <RecoveryBannerWrapper
      title="WhatsApp window closed"
      description="The 24-hour service window has expired. Send an approved template to resume the conversation."
    >
      {children}
    </RecoveryBannerWrapper>
  );
}

export function FacebookExternalInboxPanel(_props?: { contact?: Contact | null }) {
  return (
    <RecoveryBannerWrapper
      title="Facebook window closed"
      description="The 24-hour messaging window has expired. You must wait for the customer to send a message or reply via Meta Business Suite."
    >
      <Button asChild variant="default" size="sm" className="gap-2">
        <a href="https://business.facebook.com/latest/inbox" target="_blank" rel="noopener noreferrer">
          Open Meta Inbox
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
    </RecoveryBannerWrapper>
  );
}
