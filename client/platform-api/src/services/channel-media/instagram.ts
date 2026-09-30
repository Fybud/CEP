import type { InstagramChannelConfig } from "../../adapters/shared/types.js";
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

function attachmentContentType(
  type: string,
): ParsedInboundMedia["contentType"] {
  // Reels / share videos often arrive as ig_reel; Meta may still label some videos as "image".
  if (type === "ig_reel" || type === "video" || type === "share") return "video";
  if (type === "image" || type === "story_mention") return "image";
  if (type === "audio") return "audio";
  if (type === "file") return "file";
  return "file";
}

function contentTypeFromMime(mimeType: string): ParsedInboundMedia["contentType"] {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
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
  if (!res.ok) throw new Error(`Instagram media download HTTP ${res.status}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

export const instagramChannelMedia: ChannelMediaHandler = {
  channelType: "instagram",

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
          : type === "ig_reel" || type === "video" || type === "share"
            ? "video/mp4"
            : type === "image" || type === "story_mention"
              ? "image/jpeg"
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
      const { buffer, mimeType: downloadedMime } = await downloadUrl(parsed.url);
      // Prefer the real Content-Type from Meta CDN over the webhook type guess
      // (Instagram often labels videos as type "image", producing filenames like image.mp4).
      const mimeType =
        downloadedMime && downloadedMime !== "application/octet-stream"
          ? downloadedMime.split(";")[0]!.trim()
          : parsed.mimeType ?? downloadedMime;
      const contentType = contentTypeFromMime(mimeType);
      const ext = mimeType.split("/")[1]?.split("+")[0] ?? "bin";
      const filename = parsed.filename ?? `${contentType}.${ext}`;
      const key = channelMediaKey("instagram", customerId, filename);
      await putObject({
        key,
        body: buffer,
        contentType: mimeType,
      });
      return {
        mediaKey: key,
        mimeType,
        filename,
      };
    } catch (err) {
      console.warn(
        "[channel-media:instagram] inbound download failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  },

  async buildOutboundWithMedia({ message, to, buffer: _buffer }) {
    void _buffer;
    const mimeType = message.mediaMimeType ?? "application/octet-stream";
    const mediaKey = message.mediaKey;
    if (!mediaKey) throw new Error("mediaKey is required for Instagram media send");

    // Meta fetches the URL server-side; signed S3 URL works for private buckets.
    const url = await signedGetUrl(mediaKey, 3600);
    const type = outboundAttachmentType(mimeType);

    return {
      recipient: { id: to },
      message: {
        attachment: {
          type,
          payload: { url, is_reusable: true },
        },
      },
    };
  },
};
