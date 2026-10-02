import type { ChannelType } from "../generated/client/index.js";

export const NEW_EMAIL_THREAD = "new";

export type ParsedConversationId = {
  customerId: string;
  channelType: ChannelType;
  /** Gmail thread id for email; absent for WA/IG or "compose new email". */
  externalThreadId?: string;
  /** True when agent is composing a brand-new email (not a reply). */
  isNewEmailThread?: boolean;
};

export function buildConversationId(
  customerId: string,
  channelType: ChannelType,
  externalThreadId?: string | null,
): string {
  if (channelType === "email" && externalThreadId) {
    return `${customerId}:email:${externalThreadId}`;
  }
  return `${customerId}:${channelType}`;
}

export function parseConversationId(id: string): ParsedConversationId {
  const parts = id.split(":");
  const customerId = parts[0];
  const channelType = parts[1] as ChannelType;
  const allowed: ChannelType[] = ["whatsapp", "instagram", "facebook", "email", "web_chat"];
  if (!customerId || !allowed.includes(channelType)) {
    throw new Error("invalid conversation id");
  }

  const threadPart = parts.slice(2).join(":");
  if (channelType !== "email" || !threadPart) {
    return { customerId, channelType };
  }
  if (threadPart === NEW_EMAIL_THREAD) {
    return { customerId, channelType, isNewEmailThread: true };
  }
  return { customerId, channelType, externalThreadId: threadPart };
}

/** Subject shown in thread lists — strip reply/forward prefixes. */
export function displayEmailSubject(subject: string | null | undefined): string {
  const raw = subject?.trim();
  if (!raw) return "(no subject)";
  const stripped = raw.replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "").trim();
  return stripped || "(no subject)";
}
