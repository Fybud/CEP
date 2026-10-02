import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import {
  channelMediaKey,
  channelMediaMaxBytes,
  getObjectBuffer,
  isMediaStorageEnabled,
  putObject,
} from "../services/MediaService.js";
import {
  channelSupportsAttachments,
  normalizeMediaItems,
  getChannelMediaLimit,
  formatBytes,
} from "../services/channel-media/index.js";
import { parseConversationId } from "../utils/conversationId.js";

function contentTypeFromMime(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

export class MediaController {
  static async streamMessageMedia(
    request: FastifyRequest<{
      Params: { messageId: string };
      Querystring: { index?: string };
    }>,
    reply: FastifyReply,
  ) {
    if (!isMediaStorageEnabled()) {
      return reply.code(503).send({ error: "Media storage is not configured" });
    }
    const message = await prisma.message.findUnique({
      where: { id: request.params.messageId },
    });
    if (!message) {
      return reply.code(404).send({ error: "Media not found" });
    }

    const items = normalizeMediaItems(message.mediaItems, {
      mediaKey: message.mediaKey,
      mediaMimeType: message.mediaMimeType,
      mediaFilename: message.mediaFilename,
      contentType: message.contentType,
    });
    if (!items.length) {
      return reply.code(404).send({ error: "Media not found" });
    }

    const index = Math.max(0, Number.parseInt(String(request.query.index ?? "0"), 10) || 0);
    const item = items[Math.min(index, items.length - 1)]!;

    try {
      const { body, contentType } = await getObjectBuffer(item.mediaKey);
      const mime = item.mimeType || contentType || "application/octet-stream";
      const filename = item.filename || "file";
      return reply
        .header("Content-Type", mime)
        .header("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`)
        .header("Cache-Control", "private, max-age=3600")
        .send(body);
    } catch (err: unknown) {
      request.log.error(err, "media stream failed");
      return reply.code(404).send({ error: "Media unavailable" });
    }
  }

  static async uploadAttachment(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    if (!isMediaStorageEnabled()) {
      return reply.code(503).send({ error: "Media storage is not configured (AWS S3 env vars)" });
    }
    const { customerId, channelType } = parseConversationId(request.params.id);
    if (!channelSupportsAttachments(channelType)) {
      return reply.code(400).send({ error: `Attachments are not supported for ${channelType}` });
    }

    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "file is required" });

    const mimeType = part.mimetype || "application/octet-stream";
    const filename = part.filename || "file";
    
    const chunks: Buffer[] = [];
    let total = 0;
    const max = getChannelMediaLimit(channelType, mimeType);
    
    for await (const chunk of part.file) {
      total += chunk.length;
      if (total > max) {
        return reply.code(413).send({
          error: `File exceeds ${formatBytes(max)} limit for ${channelType}`,
        });
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const key = channelMediaKey(channelType, customerId, filename);
    await putObject({ key, body: buffer, contentType: mimeType });

    return reply.send({
      mediaKey: key,
      mediaMimeType: mimeType,
      mediaFilename: filename,
      contentType: contentTypeFromMime(mimeType),
    });
  }
}
