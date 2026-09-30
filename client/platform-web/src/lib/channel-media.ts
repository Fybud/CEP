import type { ChannelType } from "../api";
import { uploadConversationAttachment as uploadAttachment } from "../api";

/** Channels with attachment send/receive enabled (matches API channel-media registry). */
const ATTACHMENT_CHANNELS: ReadonlySet<ChannelType> = new Set([
  "whatsapp",
  "instagram",
  "facebook",
  "email",
]);

export function channelSupportsAttachments(channel: ChannelType): boolean {
  return ATTACHMENT_CHANNELS.has(channel);
}

export { uploadAttachment as uploadConversationAttachment };

const MB = 1024 * 1024;

export const CHANNEL_MEDIA_LIMITS: any = {
  whatsapp: {
    default: 100 * MB, // Documents up to 100MB
    image: 5 * MB,
    video: 16 * MB,
    audio: 16 * MB,
    document: 100 * MB,
  },
  instagram: {
    default: 25 * MB, // Video up to 25MB
    image: 8 * MB,
    video: 25 * MB,
    audio: 25 * MB,
  },
  facebook: {
    default: 25 * MB,
    image: 25 * MB,
    video: 25 * MB,
    audio: 25 * MB,
    document: 25 * MB,
  },
  email: {
    default: 25 * MB,
    image: 25 * MB,
    video: 25 * MB,
    audio: 25 * MB,
    document: 25 * MB,
  },
};

export function getChannelMediaLimit(channelType: ChannelType, mimeType: string): number {
  const limits = CHANNEL_MEDIA_LIMITS[channelType];
  if (!limits) return 25 * MB;

  if (mimeType.startsWith("image/")) return limits.image ?? limits.default;
  if (mimeType.startsWith("video/")) return limits.video ?? limits.default;
  if (mimeType.startsWith("audio/")) return limits.audio ?? limits.default;
  
  return limits.document ?? limits.default;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
