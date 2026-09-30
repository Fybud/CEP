import type { ChannelType } from "../generated/client/index.js";

export type MessagingWindowState =
  | "ACTIVE"
  | "EXTENDED"
  | "EXPIRED"
  | "TEMPLATE_REQUIRED";

export interface ConversationWindow {
  channel: ChannelType;
  state: MessagingWindowState;
  lastCustomerMessageAt: Date | null;
  expiresAt: Date | null;
  canSendNormalMessage: boolean;
  requiresTemplate: boolean;
  requiresHumanAgentTag: boolean;
  /** Instagram: agent must reply via the native Instagram app (CEP send blocked). */
  requiresExternalInbox: boolean;
}

export interface MessagingWindowOptions {
  /** When false (default), Instagram 24h–7d window blocks CEP sends and shows external inbox link. */
  instagramHumanAgentEnabled?: boolean;
}

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

export function getMessagingWindow(
  channel: ChannelType,
  lastCustomerMessageAt: Date | null | undefined,
  options: MessagingWindowOptions = {},
): ConversationWindow {
  const instagramHumanAgentEnabled = options.instagramHumanAgentEnabled ?? false;

  if (!lastCustomerMessageAt) {
    if (channel === "email" || channel === "web_chat") {
      return activeOpenWindow(channel);
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

  const now = Date.now();
  const msgTime = lastCustomerMessageAt.getTime();
  const diff = now - msgTime;

  if (channel === "email" || channel === "web_chat") {
    return activeOpenWindow(channel, lastCustomerMessageAt);
  }

  if (channel === "whatsapp") {
    if (diff < HOURS_24) {
      return {
        channel,
        state: "ACTIVE",
        lastCustomerMessageAt,
        expiresAt: new Date(msgTime + HOURS_24),
        canSendNormalMessage: true,
        requiresTemplate: false,
        requiresHumanAgentTag: false,
        requiresExternalInbox: false,
      };
    }

    return {
      channel,
      state: "TEMPLATE_REQUIRED",
      lastCustomerMessageAt,
      expiresAt: new Date(msgTime + HOURS_24),
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
        lastCustomerMessageAt,
        expiresAt: new Date(msgTime + HOURS_24),
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
          lastCustomerMessageAt,
          expiresAt: new Date(msgTime + DAYS_7),
          canSendNormalMessage: true,
          requiresTemplate: false,
          requiresHumanAgentTag: true,
          requiresExternalInbox: false,
        };
      }

      return {
        channel,
        state: "EXTENDED",
        lastCustomerMessageAt,
        expiresAt: new Date(msgTime + DAYS_7),
        canSendNormalMessage: false,
        requiresTemplate: false,
        requiresHumanAgentTag: false,
        requiresExternalInbox: true,
      };
    }

    return {
      channel,
      state: "EXPIRED",
      lastCustomerMessageAt,
      expiresAt: new Date(msgTime + DAYS_7),
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
        lastCustomerMessageAt,
        expiresAt: new Date(msgTime + HOURS_24),
        canSendNormalMessage: true,
        requiresTemplate: false,
        requiresHumanAgentTag: false,
        requiresExternalInbox: false,
      };
    }

    return {
      channel,
      state: "EXPIRED",
      lastCustomerMessageAt,
      expiresAt: new Date(msgTime + HOURS_24),
      canSendNormalMessage: false,
      requiresTemplate: false,
      requiresHumanAgentTag: false,
      requiresExternalInbox: true,
    };
  }

  return {
    channel,
    state: "ACTIVE",
    lastCustomerMessageAt,
    expiresAt: null,
    canSendNormalMessage: true,
    requiresTemplate: false,
    requiresHumanAgentTag: false,
    requiresExternalInbox: false,
  };
}

export function serializeConversationWindow(window: ConversationWindow) {
  return {
    channel: window.channel,
    state: window.state,
    lastCustomerMessageAt: window.lastCustomerMessageAt?.toISOString() ?? null,
    expiresAt: window.expiresAt?.toISOString() ?? null,
    canSendNormalMessage: window.canSendNormalMessage,
    requiresTemplate: window.requiresTemplate,
    requiresHumanAgentTag: window.requiresHumanAgentTag,
    requiresExternalInbox: window.requiresExternalInbox,
  };
}

function activeOpenWindow(
  channel: ChannelType,
  lastCustomerMessageAt: Date | null = null,
): ConversationWindow {
  return {
    channel,
    state: "ACTIVE",
    lastCustomerMessageAt,
    expiresAt: null,
    canSendNormalMessage: true,
    requiresTemplate: false,
    requiresHumanAgentTag: false,
    requiresExternalInbox: false,
  };
}
