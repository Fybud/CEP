import type { FacebookChannelConfig } from "../../adapters/shared/types.js";
import {
  isMediaStorageEnabled,
  putObject,
  channelMediaKey,
  signedGetUrl,
} from "../MediaService.js";
import type { ChannelMediaHandler, ParsedInboundMedia } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function attachmentContentType(type: string): ParsedInboundMedia["contentType"] {
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  if (type === "file") return "file";
  return "file";
}

function outboundAttachmentType(
  mimeType: string,
): "image" | "video" | "audio" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

async function downloadUrl(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Facebook media download HTTP ${res.status}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

export const facebookChannelMedia: ChannelMediaHandler = {
  channelType: "facebook",

  parseInboundRaw(raw: unknown): ParsedInboundMedia | null {
    const ev = asRecord(raw);
    const message = asRecord(ev?.message) ?? ev;
    if (!message) return null;

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const first = asRecord(attachments[0]);
    if (!first) return null;

    const type = String(first.type ?? "file").toLowerCase();
    const payload = asRecord(first.payload);
    const url = typeof payload?.url === "string" ? payload.url : undefined;
    if (!url) return null;

    return {
      url,
      mimeType:
        typeof payload?.mime_type === "string"
          ? payload.mime_type
          : type === "image"
            ? "image/jpeg"
            : type === "video"
              ? "video/mp4"
              : type === "audio"
                ? "audio/mpeg"
                : "application/octet-stream",
      filename: typeof payload?.title === "string" ? payload.title : undefined,
      contentType: attachmentContentType(type),
    };
  },

  async persistInbound({ customerId, parsed }) {
    if (!isMediaStorageEnabled() || !parsed.url) return null;
    try {
      const { buffer, mimeType } = await downloadUrl(parsed.url);
      const filename = parsed.filename ?? `${parsed.contentType}.${mimeType.split("/")[1] ?? "bin"}`;
      const key = channelMediaKey("facebook", customerId, filename);
      await putObject({
        key,
        body: buffer,
        contentType: parsed.mimeType ?? mimeType,
      });
      return {
        mediaKey: key,
        mimeType: parsed.mimeType ?? mimeType,
        filename,
      };
    } catch (err) {
      console.warn(
        "[channel-media:facebook] inbound download failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  },

  async buildOutboundWithMedia({
    config,
    message,
    to,
  }) {
    const fbConfig = config as FacebookChannelConfig;
    if (!fbConfig.accessToken) {
      throw new Error("Facebook accessToken missing");
    }
    if (!message.mediaKey || !message.mediaMimeType) {
      throw new Error("mediaKey and mediaMimeType required");
    }

    const type = outboundAttachmentType(message.mediaMimeType);
    const url = await signedGetUrl(message.mediaKey, 3600);

    return {
      recipient: { id: to },
      message: {
        attachment: {
          type,
          payload: {
            url,
            is_reusable: false,
          },
        },
      },
      messaging_type: message.messagingType ?? "RESPONSE",
      ...(message.tag ? { tag: message.tag } : {}),
    };
  },
};
