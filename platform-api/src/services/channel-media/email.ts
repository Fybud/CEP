import type { gmail_v1 } from "googleapis";
import type { EmailChannelConfig } from "../../adapters/shared/types.js";
import {
  isMediaStorageEnabled,
  putObject,
  channelMediaKey,
} from "../MediaService.js";
import type { ChannelMediaHandler, ParsedInboundMedia } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contentTypeFromMime(mimeType: string): ParsedInboundMedia["contentType"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

type GmailPart = gmail_v1.Schema$MessagePart;

function walkAttachmentParts(part: GmailPart | null | undefined, out: GmailPart[]): void {
  if (!part) return;
  const filename = part.filename?.trim();
  const attachmentId = part.body?.attachmentId;
  if (filename && attachmentId) {
    out.push(part);
  }
  for (const child of part.parts ?? []) {
    walkAttachmentParts(child, out);
  }
}

export function listGmailAttachmentParts(raw: unknown): GmailPart[] {
  const msg = asRecord(raw);
  if (!msg) return [];
  const found: GmailPart[] = [];
  walkAttachmentParts(msg.payload as GmailPart | undefined, found);
  return found;
}

function encodeMimeWord(filename: string): string {
  if (/^[\x20-\x7E]+$/.test(filename) && !filename.includes('"')) return filename;
  return `=?UTF-8?B?${Buffer.from(filename, "utf8").toString("base64")}?=`;
}

/** Build a multipart/mixed RFC822 message with one attachment (base64url for Gmail API). */
export function buildRawEmailWithAttachment(input: {
  to: string;
  from?: string;
  subject: string;
  content: string;
  inReplyTo?: string;
  references?: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): string {
  const boundary = `cep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const textBody = input.content?.trim() || "(attachment)";
  const b64 = input.buffer.toString("base64").replace(/(.{76})/g, "$1\r\n");
  const safeName = encodeMimeWord(input.filename || "file");
  const mimeType = input.mimeType || "application/octet-stream";

  const lines = [
    `To: ${input.to}`,
    input.from ? `From: ${input.from}` : null,
    `Subject: ${input.subject}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.references ? `References: ${input.references}` : null,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${safeName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeName}"`,
    "",
    b64,
    `--${boundary}--`,
    "",
  ].filter((line): line is string => line != null);

  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

function parseParts(raw: unknown): ParsedInboundMedia[] {
  const msg = asRecord(raw);
  if (!msg) return [];
  const messageId = typeof msg.id === "string" ? msg.id.trim() : "";
  if (!messageId) return [];

  return listGmailAttachmentParts(raw).map((part) => {
    const mimeType = part.mimeType || "application/octet-stream";
    const filename = part.filename?.trim() || "attachment";
    return {
      providerMediaId: part.body!.attachmentId!,
      mimeType,
      filename,
      contentType: contentTypeFromMime(mimeType),
      meta: { gmailMessageId: messageId },
    };
  });
}

export const emailChannelMedia: ChannelMediaHandler = {
  channelType: "email",

  parseInboundRaw(raw: unknown): ParsedInboundMedia | null {
    return parseParts(raw)[0] ?? null;
  },

  parseAllInboundRaw(raw: unknown): ParsedInboundMedia[] {
    return parseParts(raw);
  },

  async persistInbound({ config, customerId, parsed }) {
    if (!isMediaStorageEnabled() || !parsed.providerMediaId || !parsed.meta?.gmailMessageId) {
      return null;
    }
    try {
      const { getEmailClient } = await import("../../adapters/email/index.js");
      const gmail = getEmailClient(config as EmailChannelConfig);
      const res = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: parsed.meta.gmailMessageId,
        id: parsed.providerMediaId,
      });
      const data = res.data.data;
      if (!data) return null;
      const buffer = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const mimeType = parsed.mimeType ?? "application/octet-stream";
      const filename = parsed.filename ?? "attachment";
      const key = channelMediaKey("email", customerId, filename);
      await putObject({ key, body: buffer, contentType: mimeType });
      return { mediaKey: key, mimeType, filename, contentType: parsed.contentType };
    } catch (err) {
      console.warn(
        "[channel-media:email] inbound download failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  },

  async buildOutboundWithMedia({ message, to, buffer }) {
    const mimeType = message.mediaMimeType ?? "application/octet-stream";
    const filename = message.mediaFilename ?? "file";
    const inReplyTo = message.replyToExternalId;
    const references = message.references;

    const raw = buildRawEmailWithAttachment({
      to,
      subject: message.subject || "Message from FyBud",
      content: message.content ?? "",
      inReplyTo,
      references,
      buffer,
      mimeType,
      filename,
    });

    return { raw };
  },
};
