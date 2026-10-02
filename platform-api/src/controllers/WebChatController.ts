import type { FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { prisma } from "../config/db.js";
import {
  findIdentityByExternalId,
  normalizeWhatsAppId,
  formatWhatsAppStorage,
} from "../services/MessagingService.js";
import { isCustomerBlocked } from "../services/BlockedContactService.js";
import {
  ensureWebChatChannelConfig,
  getWebChatSettings,
  updateWebChatSettings,
} from "../services/WebChatWidgetService.js";

async function ensureWhatsAppOnCustomer(customerId: string, whatsappDigits: string) {
  const stored = formatWhatsAppStorage(whatsappDigits) ?? whatsappDigits;
  const existing = await findIdentityByExternalId("whatsapp", whatsappDigits);
  if (existing) {
    if (existing.customerId === customerId) return existing;
    // Move WA identity onto this customer so inbox stays unified
    await prisma.message.updateMany({
      where: { channelType: "whatsapp", channelId: existing.id },
      data: { customerId },
    });
    return prisma.whatsAppChannel.update({
      where: { id: existing.id },
      data: { customerId, externalId: stored },
    });
  }
  return prisma.whatsAppChannel.create({
    data: {
      id: randomUUID(),
      customerId,
      externalId: stored,
      resolved: true,
      metadata: { source: "web_chat" },
    },
  });
}

export class WebChatController {
  /**
   * Start or resume a web-chat session.
   * Requires name + WhatsApp so the visitor unifies with an existing CEP contact
   * (or creates one with a WhatsApp identity for later omnichannel merge).
   */
  static async createSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      await ensureWebChatChannelConfig();

      const body = request.body as {
        name?: string;
        whatsapp?: string;
        phone?: string;
        externalId?: string;
      };

      const name = body.name?.trim();
      const whatsappRaw = (body.whatsapp ?? body.phone ?? "").trim();
      const digits = normalizeWhatsAppId(whatsappRaw);

      if (!name) {
        return reply.code(400).send({ error: "Name is required" });
      }
      if (!digits || digits.replace(/\D/g, "").length < 10) {
        return reply.code(400).send({
          error: "A valid WhatsApp number is required (include country code, e.g. +91…)",
        });
      }

      const storedWa = formatWhatsAppStorage(digits) ?? digits;
      let externalId = body.externalId?.trim() || randomUUID();

      let webChatChannel = await prisma.webChatChannel.findUnique({
        where: { externalId },
        include: { customer: true },
      });

      const existingWa = await findIdentityByExternalId("whatsapp", digits);

      if (webChatChannel) {
        // Prefer the customer that already owns this WhatsApp number
        let customerId = webChatChannel.customerId;
        if (existingWa && existingWa.customerId !== customerId) {
          customerId = existingWa.customerId;
          await prisma.message.updateMany({
            where: { channelType: "web_chat", channelId: webChatChannel.id },
            data: { customerId },
          });
          webChatChannel = await prisma.webChatChannel.update({
            where: { id: webChatChannel.id },
            data: {
              customerId,
              metadata: { whatsapp: storedWa, source: "web_chat_embed" },
            },
            include: { customer: true },
          });
        }

        if (await isCustomerBlocked(customerId)) {
          return reply.code(403).send({ error: "This contact is blocked" });
        }

        await ensureWhatsAppOnCustomer(customerId, digits);
        await prisma.customer.update({
          where: { id: customerId },
          data: { name },
        });

        return reply.send({
          externalId,
          customerId,
          channelId: webChatChannel.id,
          whatsapp: storedWa,
          name,
        });
      }

      if (existingWa) {
        if (await isCustomerBlocked(existingWa.customerId)) {
          return reply.code(403).send({ error: "This contact is blocked" });
        }

        // Resume as known WhatsApp contact — attach a new web-chat session identity
        const customerId = existingWa.customerId;
        await prisma.customer.update({
          where: { id: customerId },
          data: { name },
        });

        webChatChannel = await prisma.webChatChannel.create({
          data: {
            id: randomUUID(),
            customerId,
            externalId,
            metadata: { whatsapp: storedWa, source: "web_chat_embed" },
          },
          include: { customer: true },
        });

        return reply.send({
          externalId,
          customerId,
          channelId: webChatChannel.id,
          whatsapp: storedWa,
          name,
        });
      }

      // Brand-new contact: Customer + WhatsApp + WebChat in one go
      const customer = await prisma.customer.create({
        data: {
          id: randomUUID(),
          name,
          whatsappIdentities: {
            create: {
              id: randomUUID(),
              externalId: storedWa,
              resolved: true,
              metadata: { source: "web_chat" },
            },
          },
          webChatIdentities: {
            create: {
              id: randomUUID(),
              externalId,
              metadata: { whatsapp: storedWa, source: "web_chat_embed" },
            },
          },
        },
        include: { webChatIdentities: true },
      });

      const created = customer.webChatIdentities[0]!;
      return reply.send({
        externalId,
        customerId: customer.id,
        channelId: created.id,
        whatsapp: storedWa,
        name,
      });
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (
        msg.includes('invalid input value for enum "ChannelType"') &&
        msg.includes("web_chat")
      ) {
        return reply.code(503).send({
          error:
            "Web Chat is not ready on this database yet. Restart the API so migrations can add ChannelType.web_chat, then try again.",
        });
      }
      return reply.code(500).send({ error: err.message || "Internal Server Error" });
    }
  }

  static async sendMessage(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { externalId, content } = request.body as {
        externalId: string;
        content: string;
      };
      if (!externalId || !content?.trim()) {
        return reply.code(400).send({ error: "Missing required fields" });
      }

      await ensureWebChatChannelConfig();

      const channel = await prisma.webChatChannel.findUnique({
        where: { externalId },
      });
      if (!channel) return reply.code(404).send({ error: "Session not found" });

      if (await isCustomerBlocked(channel.customerId)) {
        return reply.code(403).send({ error: "This contact is blocked" });
      }

      const now = new Date();
      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          channelType: "web_chat",
          channelId: channel.id,
          customerId: channel.customerId,
          direction: "incoming",
          content: content.trim(),
          status: "delivered",
        },
      });

      await prisma.webChatChannel.update({
        where: { id: channel.id },
        data: {
          lastMessageAt: now,
          lastCustomerMessageAt: now,
          resolved: false,
        },
      });

      await prisma.customer.update({
        where: { id: channel.customerId },
        data: { resolved: false, updatedAt: now },
      });

      const { classifyInboundMessageAsync } = await import(
        "../services/IntentClassifierService.js"
      );
      classifyInboundMessageAsync({
        channelType: "web_chat",
        channelId: channel.id,
        content: content.trim(),
      });

      return reply.send(message);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async getMessages(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { externalId } = request.query as { externalId: string };
      if (!externalId) return reply.code(400).send({ error: "Missing externalId" });

      const channel = await prisma.webChatChannel.findUnique({
        where: { externalId },
      });
      if (!channel) return reply.code(404).send({ error: "Session not found" });

      if (await isCustomerBlocked(channel.customerId)) {
        return reply.code(403).send({ error: "This contact is blocked" });
      }

      const messages = await prisma.message.findMany({
        where: { channelType: "web_chat", channelId: channel.id },
        orderBy: { createdAt: "asc" },
      });

      return reply.send(messages);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  /** Public config for the embed (no secrets / no widget key). */
  static async getEmbedConfig(_request: FastifyRequest, reply: FastifyReply) {
    await ensureWebChatChannelConfig();
    const cfg = await prisma.channelConfig.findFirst({
      where: { channelType: "web_chat" },
    });
    return reply.send({
      enabled: Boolean(cfg?.enabled),
      channel: "web_chat",
      requireWhatsApp: true,
      requireName: true,
    });
  }

  /** Auth: agent settings (allowed domains). */
  static async getSettings(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const settings = await getWebChatSettings();
      return reply.send(settings);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async patchSettings(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        allowedOrigins?: string[];
      };
      const settings = await updateWebChatSettings({
        allowedOrigins: body.allowedOrigins,
      });
      return reply.send(settings);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
