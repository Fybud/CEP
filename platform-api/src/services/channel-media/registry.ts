import type { ChannelType } from "../../generated/client/index.js";
import { whatsappChannelMedia } from "./whatsapp.js";
import { instagramChannelMedia } from "./instagram.js";
import { facebookChannelMedia } from "./facebook.js";
import { emailChannelMedia } from "./email.js";
import type { ChannelMediaHandler } from "./types.js";

const handlers = new Map<ChannelType, ChannelMediaHandler>([
  ["whatsapp", whatsappChannelMedia],
  ["instagram", instagramChannelMedia],
  ["facebook", facebookChannelMedia],
  ["email", emailChannelMedia],
]);

export function getChannelMediaHandler(
  channelType: ChannelType,
): ChannelMediaHandler | null {
  return handlers.get(channelType) ?? null;
}

export function channelSupportsAttachments(channelType: ChannelType): boolean {
  return handlers.has(channelType);
}
