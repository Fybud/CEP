import type { ChannelType } from "../api";

export type MessagingWindowState =
  | "ACTIVE"
  | "EXTENDED"
  | "EXPIRED"
  | "TEMPLATE_REQUIRED";

export interface ConversationWindow {
  channel: ChannelType;
  state: MessagingWindowState;
  lastCustomerMessageAt: string | null;
  expiresAt: string | null;
  canSendNormalMessage: boolean;
  requiresTemplate: boolean;
  requiresHumanAgentTag: boolean;
  requiresExternalInbox: boolean;
}

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

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

export function getMessagingWindow(
  channel: ChannelType,
  lastCustomerMessageAt: Date | null | undefined,
  options: { instagramHumanAgentEnabled?: boolean } = {},
): ConversationWindow {
  const instagramHumanAgentEnabled = options.instagramHumanAgentEnabled ?? false;

  if (!lastCustomerMessageAt) {
    if (channel === "email") {
      return activeEmailWindow();
    }
    return {
      channel,
      state: channel === "whatsapp" ? "TEMPLATE_REQUIRED" : "EXPIRED",
      lastCustomerMessageAt: null,
      expiresAt: null,
      canSendNormalMessage: false,
      requiresTemplate: channel === "whatsapp",
      requiresHumanAgentTag: false,
      requiresExternalInbox: channel === "instagram" || channel === "facebook",
    };
  }

  const msgTime = lastCustomerMessageAt.getTime();
  const diff = Date.now() - msgTime;

  if (channel === "email") {
    return activeEmailWindow(lastCustomerMessageAt.toISOString());
  }

  if (channel === "whatsapp") {
    if (diff < HOURS_24) {
      return {
        channel,
        state: "ACTIVE",
        lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
        expiresAt: new Date(msgTime + HOURS_24).toISOString(),
        canSendNormalMessage: true,
        requiresTemplate: false,
        requiresHumanAgentTag: false,
        requiresExternalInbox: false,
      };
    }
    return {
      channel,
      state: "TEMPLATE_REQUIRED",
      lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
      expiresAt: new Date(msgTime + HOURS_24).toISOString(),
      canSendNormalMessage: false,
      requiresTemplate: true,
      requiresHumanAgentTag: false,
      requiresExternalInbox: false,
    };
  }

  if (channel === "instagram") {
    if (diff <= HOURS_24) {
      return {
        channel,
        state: "ACTIVE",
        lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
        expiresAt: new Date(msgTime + HOURS_24).toISOString(),
        canSendNormalMessage: true,
        requiresTemplate: false,
        requiresHumanAgentTag: false,
        requiresExternalInbox: false,
      };
    }
    if (diff <= DAYS_7) {
      if (instagramHumanAgentEnabled) {
        return {
          channel,
          state: "EXTENDED",
          lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
          expiresAt: new Date(msgTime + DAYS_7).toISOString(),
          canSendNormalMessage: true,
          requiresTemplate: false,
          requiresHumanAgentTag: true,
          requiresExternalInbox: false,
        };
      }
      return {
        channel,
        state: "EXTENDED",
        lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
        expiresAt: new Date(msgTime + DAYS_7).toISOString(),
        canSendNormalMessage: false,
        requiresTemplate: false,
        requiresHumanAgentTag: false,
        requiresExternalInbox: true,
      };
    }
    return {
      channel,
      state: "EXPIRED",
      lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
      expiresAt: new Date(msgTime + DAYS_7).toISOString(),
      canSendNormalMessage: false,
      requiresTemplate: false,
      requiresHumanAgentTag: false,
      requiresExternalInbox: true,
    };
  }

  if (channel === "facebook") {
    if (diff <= HOURS_24) {
      return {
        channel,
        state: "ACTIVE",
        lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
        expiresAt: new Date(msgTime + HOURS_24).toISOString(),
        canSendNormalMessage: true,
        requiresTemplate: false,
        requiresHumanAgentTag: false,
        requiresExternalInbox: false,
      };
    }
    return {
      channel,
      state: "EXPIRED",
      lastCustomerMessageAt: lastCustomerMessageAt.toISOString(),
      expiresAt: new Date(msgTime + HOURS_24).toISOString(),
      canSendNormalMessage: false,
      requiresTemplate: false,
      requiresHumanAgentTag: false,
      requiresExternalInbox: true,
    };
  }

  return activeEmailWindow(lastCustomerMessageAt.toISOString());
}

function activeEmailWindow(lastCustomerMessageAt: string | null = null): ConversationWindow {
  return {
    channel: "email",
    state: "ACTIVE",
    lastCustomerMessageAt,
    expiresAt: null,
    canSendNormalMessage: true,
    requiresTemplate: false,
    requiresHumanAgentTag: false,
    requiresExternalInbox: false,
  };
}

/** Prefer API windowState; recompute from loaded messages when missing or stale. */
export function resolveConversationWindow(
  channel: ChannelType,
  apiWindow: ConversationWindow | undefined,
  messages: { direction: string; createdAt: string }[] | undefined,
  instagramHumanAgentEnabled: boolean,
): ConversationWindow {
  const fromMessages = lastIncomingMessageAt(messages);
  const computed = getMessagingWindow(channel, fromMessages, { instagramHumanAgentEnabled });

  if (!apiWindow) return computed;

  // If API says send is allowed but message history proves window closed, trust messages.
  if (apiWindow.canSendNormalMessage && !computed.canSendNormalMessage) {
    return computed;
  }

  if (apiWindow.requiresExternalInbox || !apiWindow.canSendNormalMessage) {
    return {
      ...apiWindow,
      requiresExternalInbox: apiWindow.requiresExternalInbox ?? computed.requiresExternalInbox,
    };
  }

  return apiWindow;
}
