import type { ChannelType, ContentType } from "../../generated/client/index.js";
import type { ChannelConfig, NormalizedInboundMessage, OutboundTextMessage } from "../../adapters/shared/types.js";

export type ParsedInboundMedia = {
  /** Provider media id (WhatsApp media id, Gmail attachment id, …). */
  providerMediaId?: string;
  /** Direct download URL (Instagram CDN, etc.). */
  url?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
  contentType: ContentType;
  /** Extra ids needed to fetch (e.g. Gmail message id). */
  meta?: Record<string, string>;
};

export type StoredMedia = {
  mediaKey: string;
  mimeType: string;
  filename?: string;
  contentType?: ContentType;
};

/** Per-channel media ingest + outbound hooks. Register new channels in registry.ts. */
export interface ChannelMediaHandler {
  readonly channelType: ChannelType;

  parseInboundRaw(raw: unknown): ParsedInboundMedia | null;

  /** Optional: all attachments in one inbound (email multi-attach). */
  parseAllInboundRaw?(raw: unknown): ParsedInboundMedia[];

  persistInbound(input: {
    config: ChannelConfig;
    customerId: string;
    parsed: ParsedInboundMedia;
  }): Promise<StoredMedia | null>;

  /** Build channel-specific API payload when sending stored media. */
  buildOutboundWithMedia(input: {
    config: ChannelConfig;
    message: OutboundTextMessage;
    to: string;
    buffer: Buffer;
  }): Promise<Record<string, unknown>>;
}

export type InboundMediaResult = {
  content: string;
  contentType: ContentType;
  mediaKey?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaItems?: StoredMedia[];
};

function refineContent(
  inboundContent: string,
  parsed: ParsedInboundMedia,
): string {
  let content = inboundContent;
  if (parsed.caption?.trim()) {
    return parsed.caption.trim();
  }
  if (
    !content.trim() ||
    content.startsWith("[") ||
    /^(image|audio|video|file|document)$/i.test(content.trim())
  ) {
    const name = parsed.filename?.trim();
    return name && !/^(image|audio|video|file|document)$/i.test(name) ? name : "";
  }
  return content;
}

export async function resolveInboundMedia(
  handler: ChannelMediaHandler,
  input: {
    config: ChannelConfig;
    customerId: string;
    inbound: NormalizedInboundMessage;
  },
): Promise<InboundMediaResult | null> {
  const raw =
    input.inbound.raw && typeof input.inbound.raw === "object" && !Array.isArray(input.inbound.raw)
      ? input.inbound.raw
      : null;
  if (!raw) return null;

  const parsedList =
    handler.parseAllInboundRaw?.(raw) ??
    (() => {
      const one = handler.parseInboundRaw(raw);
      return one ? [one] : [];
    })();
  if (!parsedList.length) return null;

  const storedItems: StoredMedia[] = [];
  for (const parsed of parsedList) {
    const stored = await handler.persistInbound({
      config: input.config,
      customerId: input.customerId,
      parsed,
    });
    if (stored) {
      const mime = stored.mimeType ?? "";
      const contentType: ContentType = mime.startsWith("video/")
        ? "video"
        : mime.startsWith("image/")
          ? "image"
          : mime.startsWith("audio/")
            ? "audio"
            : parsed.contentType;
      storedItems.push({
        ...stored,
        contentType,
      });
    }
  }

  const primary = parsedList[0]!;
  const firstStored = storedItems[0];
  // Prefer original body text when present; only fall back to filename labels for empty/[media] bodies.
  let content = input.inbound.content;
  if (
    !content.trim() ||
    content.startsWith("[") ||
    /^(image|audio|video|file|document)$/i.test(content.trim())
  ) {
    content = refineContent(input.inbound.content, primary);
    // Multi-attach with no caption: don't put a single filename over the body.
    if (storedItems.length > 1 && !primary.caption?.trim()) {
      content = input.inbound.content.startsWith("[") ? "" : input.inbound.content;
      if (/^(image|audio|video|file|document)$/i.test(content.trim())) content = "";
    }
  }

  // Prefer MIME-derived type so mislabeled Instagram videos (image.mp4) render as video.
  const resolvedContentType = firstStored?.contentType ?? primary.contentType;

  return {
    content,
    contentType: resolvedContentType,
    mediaKey: firstStored?.mediaKey,
    mediaMimeType: firstStored?.mimeType,
    mediaFilename: firstStored?.filename,
    mediaItems: storedItems.length ? storedItems : undefined,
  };
}

export type MediaItemDto = {
  mediaKey: string;
  mimeType: string;
  filename?: string | null;
  contentType?: string | null;
};

export function normalizeMediaItems(
  mediaItems: unknown,
  fallback?: {
    mediaKey?: string | null;
    mediaMimeType?: string | null;
    mediaFilename?: string | null;
    contentType?: string | null;
  },
): MediaItemDto[] {
  if (Array.isArray(mediaItems) && mediaItems.length) {
    const out: MediaItemDto[] = [];
    for (const row of mediaItems) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const mediaKey = typeof r.mediaKey === "string" ? r.mediaKey : null;
      if (!mediaKey) continue;
      out.push({
        mediaKey,
        mimeType:
          typeof r.mimeType === "string"
            ? r.mimeType
            : typeof r.mediaMimeType === "string"
              ? r.mediaMimeType
              : "application/octet-stream",
        filename:
          typeof r.filename === "string"
            ? r.filename
            : typeof r.mediaFilename === "string"
              ? r.mediaFilename
              : null,
        contentType: typeof r.contentType === "string" ? r.contentType : null,
      });
    }
    return out;
  }
  if (fallback?.mediaKey) {
    return [
      {
        mediaKey: fallback.mediaKey,
        mimeType: fallback.mediaMimeType ?? "application/octet-stream",
        filename: fallback.mediaFilename ?? null,
        contentType: fallback.contentType ?? null,
      },
    ];
  }
  return [];
}
