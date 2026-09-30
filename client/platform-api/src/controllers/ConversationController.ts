import type { FastifyRequest, FastifyReply } from "fastify";
import { ConversationService } from "../services/ConversationService.js";
import { isFeatureEnabled } from "../services/FeatureService.js";
import { prisma } from "../config/db.js";

export class ConversationController {
  static async searchMessages(
    request: FastifyRequest<{ Querystring: { q: string } }>,
    reply: FastifyReply,
  ) {
    if (!request.query.q || request.query.q.trim() === '') {
      return reply.send({ results: [] });
    }
    try {
      const results = await ConversationService.searchMessages(request.query.q.trim());
      return reply.send({ results });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
  static async listConversations(
    request: FastifyRequest<{
      Querystring: { accountId?: string; inboxId?: string; status?: string };
    }>,
    reply: FastifyReply,
  ) {
    const status = request.query.status;
    const mapped =
      status === "resolved" || status === "active" || status === "all"
        ? status
        : status === "open" || status === "pending"
          ? "active"
          : "all";
    const conversations = await ConversationService.list(mapped);

    // Catch up intents for threads that arrived while the classifier was unreachable.
    void import("../services/IntentClassifierService.js").then(({ backfillMissingIntentsAsync }) => {
      backfillMissingIntentsAsync();
    });

    const userId = request.user?.id;
    if (!userId) {
      return reply.send(conversations);
    }

    const pins = await prisma.conversationPin.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    // Pins are stored as contact ids (pin contact, not channel thread).
    const pinnedContacts = new Set(pins.map((p) => p.conversationId));
    return reply.send(
      conversations.map((c) => ({
        ...c,
        pinned: pinnedContacts.has(c.contactId),
      })),
    );
  }

  static async getConversation(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const list = await ConversationService.list("all");
      const conversation = list.find((c) => c.id === request.params.id);
      if (!conversation) return reply.code(404).send({ error: "not found" });
      return reply.send(conversation);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async getMessages(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const messages = await ConversationService.listMessages(request.params.id);
      return reply.send(messages);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async markRead(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const result = await ConversationService.markConversationRead(request.params.id);
      return reply.send({ ok: true, ...result });
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async sendMessage(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        content?: string;
        subject?: string;
        mediaKey?: string;
        mediaMimeType?: string;
        mediaFilename?: string;
      };
    }>,
    reply: FastifyReply,
  ) {
    const content = request.body?.content?.trim() ?? "";
    const mediaKey = request.body?.mediaKey?.trim();
    const mediaMimeType = request.body?.mediaMimeType?.trim();
    if (!content && !mediaKey) {
      return reply.code(400).send({ error: "content or media attachment is required" });
    }
    try {
      const result = await ConversationService.sendMessage(
        request.params.id,
        content,
        request.body?.subject,
        mediaKey && mediaMimeType
          ? {
              mediaKey,
              mediaMimeType,
              mediaFilename: request.body?.mediaFilename,
            }
          : undefined,
      );
      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async sendWhatsAppTemplate(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        templateId: string;
        variables: Record<string, string>;
      };
    }>,
    reply: FastifyReply,
  ) {
    const templateId = request.body?.templateId;
    if (!templateId) return reply.code(400).send({ error: "templateId is required" });

    try {
      const templatesEnabled = await isFeatureEnabled("whatsapp_templates_enabled", false);
      if (!templatesEnabled) {
        return reply.code(403).send({ error: "WhatsApp Templates are disabled for this workspace" });
      }
      const result = await ConversationService.sendWhatsAppTemplate(
        request.params.id,
        templateId,
        request.body?.variables || {}
      );
      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async updateStatus(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { status?: "open" | "pending" | "resolved" };
    }>,
    reply: FastifyReply,
  ) {
    const status = request.body?.status;
    if (!status) return reply.code(400).send({ error: "status is required" });
    try {
      const conversation = await ConversationService.updateStatus(request.params.id, status);
      return reply.send(conversation);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async suppress(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    if (request.user?.role !== "SUPER_ADMIN" && request.user?.role !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can delete conversations" });
    }
    try {
      const result = await ConversationService.suppress(request.params.id);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async suppressMessages(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { messageIds?: string[] };
    }>,
    reply: FastifyReply,
  ) {
    if (request.user?.role !== "SUPER_ADMIN" && request.user?.role !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can delete messages" });
    }
    const messageIds = request.body?.messageIds;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return reply.code(400).send({ error: "messageIds required" });
    }
    try {
      const result = await ConversationService.suppressMessages(
        request.params.id,
        messageIds,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async reactToMessage(
    request: FastifyRequest<{
      Params: { id: string; messageId: string };
      Body: { emoji: string };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const emoji = request.body?.emoji?.trim();
      if (!emoji) return reply.code(400).send({ error: "emoji required" });

      const user = request.user;
      const reactorKey = user?.id ?? "agent";

      const message = await prisma.message.findUnique({
        where: { id: request.params.messageId },
      });
      if (!message) return reply.code(404).send({ error: "Message not found" });

      const reactions =
        message.reactions && typeof message.reactions === "object" && !Array.isArray(message.reactions)
          ? { ...(message.reactions as Record<string, string[]>) }
          : {};

      const existing = new Set(reactions[emoji] ?? []);
      if (existing.has(reactorKey)) existing.delete(reactorKey);
      else existing.add(reactorKey);
      reactions[emoji] = [...existing];
      if (reactions[emoji].length === 0) delete reactions[emoji];

      const updated = await prisma.message.update({
        where: { id: message.id },
        data: { reactions },
      });

      return reply.send({ success: true, reactions: updated.reactions });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async downloadTranscript(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const messages = await ConversationService.listMessages(request.params.id);
      const { customerId, channelType } = ConversationService.parseConversationId(
        request.params.id,
      );
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });

      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));

      const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
      });

      doc.fontSize(16).text("Conversation transcript", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#444");
      doc.text(`Contact: ${customer?.name ?? customerId}`);
      doc.text(`Channel: ${channelType}`);
      doc.text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();
      doc.fillColor("#000");

      for (const m of messages) {
        const when = new Date(m.createdAt).toISOString();
        const who = m.direction === "incoming" ? "Customer" : "Agent";
        doc.fontSize(9).fillColor("#666").text(`${when} · ${who}`);
        doc.fontSize(11).fillColor("#000").text(m.content || "[attachment]", {
          width: 500,
        });
        doc.moveDown(0.6);
      }

      doc.end();
      const pdf = await done;

      return reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="transcript-${channelType}-${customerId.slice(0, 8)}.pdf"`,
        )
        .send(pdf);
    } catch (err: any) {
      const message =
        typeof err?.message === "string" && err.message.includes("pinned")
          ? "Database is missing a required column. Run pending migrations (messages.pinned)."
          : err?.message || "Failed to generate transcript";
      return reply.code(500).send({ error: message });
    }
  }

  static async togglePin(request: FastifyRequest<{ Params: { id: string, messageId: string } }>, reply: FastifyReply) {
    try {
      const message = await prisma.message.findUnique({ where: { id: request.params.messageId } });
      if (!message) return reply.code(404).send({ error: "Message not found" });

      const updated = await prisma.message.update({
        where: { id: request.params.messageId },
        data: { pinned: !message.pinned }
      });
      return reply.send({ pinned: updated.pinned });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async toggleStar(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    if (!request.user?.id) return reply.code(401).send({ error: "Unauthorized" });
    try {
      const { customerId } = ConversationService.parseConversationId(request.params.id);
      const existing = await prisma.conversationPin.findUnique({
        where: {
          userId_conversationId: {
            userId: request.user.id,
            conversationId: customerId,
          },
        },
      });
      if (existing) {
        await prisma.conversationPin.delete({ where: { id: existing.id } });
        return reply.send({ pinned: false });
      }
      await prisma.conversationPin.create({
        data: {
          userId: request.user.id,
          conversationId: customerId,
        },
      });
      return reply.send({ pinned: true });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
