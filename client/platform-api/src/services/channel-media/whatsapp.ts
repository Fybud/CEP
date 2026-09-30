import type { WhatsAppChannelConfig } from "../../adapters/shared/types.js";
import type { OutboundTextMessage } from "../../adapters/shared/types.js";
import {
  isMediaStorageEnabled,
  putObject,
  channelMediaKey,
} from "../MediaService.js";
import type { ChannelMediaHandler, ParsedInboundMedia } from "./types.js";

const GRAPH = "https://graph.facebook.com/v21.0";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeToken(accessToken: string): string {
  let token = accessToken.trim();
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, "").trim();
  return token;
}

function parseMediaPart(
  part: Record<string, unknown> | null,
  contentType: ParsedInboundMedia["contentType"],
  defaultMime: string,
  defaultFilename?: string,
): ParsedInboundMedia | null {
  if (!part?.id) return null;
  return {
    providerMediaId: String(part.id),
    mimeType: typeof part.mime_type === "string" ? part.mime_type : defaultMime,
    filename:
      defaultFilename ??
      (typeof part.filename === "string" ? part.filename : undefined),
    caption: typeof part.caption === "string" ? part.caption : undefined,
    contentType,
  };
}

async function downloadProviderMedia(
  config: WhatsAppChannelConfig,
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = normalizeToken(config.accessToken ?? "");
  const metaRes = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = (await metaRes.json().catch(() => ({}))) as {
    url?: string;
    mime_type?: string;
    error?: { message?: string };
  };
  if (!metaRes.ok || !meta.url) {
    throw new Error(meta.error?.message ?? `WhatsApp media meta HTTP ${metaRes.status}`);
  }
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp media download HTTP ${fileRes.status}`);
  }
  return {
    buffer: Buffer.from(await fileRes.arrayBuffer()),
    mimeType: meta.mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream",
  };
}

async function uploadProviderMedia(
  config: WhatsAppChannelConfig,
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const token = normalizeToken(config.accessToken ?? "");
  const phoneNumberId = String(config.phoneNumberId ?? "").trim();
  if (!phoneNumberId || !token) throw new Error("WhatsApp not configured");

  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType);
  form.set(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    filename,
  );

  const res = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message ?? `WhatsApp media upload HTTP ${res.status}`);
  }
  return json.id;
}

function outboundMessageType(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

export const whatsappChannelMedia: ChannelMediaHandler = {
  channelType: "whatsapp",

  parseInboundRaw(raw: unknown): ParsedInboundMedia | null {
    const msg = asRecord(raw);
    if (!msg) return null;
    const type = typeof msg.type === "string" ? msg.type : "";
    if (type === "image") {
      return parseMediaPart(asRecord(msg.image), "image", "image/jpeg");
    }
    if (type === "video") {
      return parseMediaPart(asRecord(msg.video), "video", "video/mp4");
    }
    if (type === "audio") {
      return parseMediaPart(asRecord(msg.audio), "audio", "audio/ogg");
    }
    if (type === "document") {
      return parseMediaPart(asRecord(msg.document), "file", "application/octet-stream", "file");
    }
    return null;
  },

  async persistInbound({ config, customerId, parsed }) {
    if (!isMediaStorageEnabled() || !parsed.providerMediaId) return null;
    try {
      const { buffer, mimeType } = await downloadProviderMedia(
        config as WhatsAppChannelConfig,
        parsed.providerMediaId,
      );
      const filename = parsed.filename ?? `${parsed.contentType}.${mimeType.split("/")[1] ?? "bin"}`;
      const key = channelMediaKey("whatsapp", customerId, filename);
      await putObject({ key, body: buffer, contentType: mimeType });
      return { mediaKey: key, mimeType, filename };
    } catch (err) {
      console.warn(
        "[channel-media:whatsapp] inbound download failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  },

  async buildOutboundWithMedia({ config, message, to, buffer }) {
    const waConfig = config as WhatsAppChannelConfig;
    let mimeType = message.mediaMimeType ?? "application/octet-stream";
    let filename = message.mediaFilename ?? "file";

    // WhatsApp API does not accept audio/webm. Remap to audio/mp4.
    // Meta's transcoder is more forgiving and will process the webm container
    // if we pass it through the gateway as audio/mp4.
    if (mimeType === "audio/webm" || mimeType.startsWith("audio/webm;")) {
      mimeType = "audio/mp4";
      filename = filename.replace(/\.webm$/, ".mp4");
    }

    const waMediaId = await uploadProviderMedia(waConfig, buffer, mimeType, filename);
    const waType = outboundMessageType(mimeType);
    const caption = message.content?.trim() || undefined;

    if (waType === "document") {
      return {
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
          id: waMediaId,
          ...(caption ? { caption } : {}),
          filename,
        },
      };
    }
    return {
      messaging_product: "whatsapp",
      to,
      type: waType,
      [waType]: { id: waMediaId, ...(caption ? { caption } : {}) },
    };
  },
};
