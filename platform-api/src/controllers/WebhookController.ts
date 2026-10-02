import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import {
  getChannelAdapter,
  resolveChannelConfig,
} from "../adapters/shared/index.js";
import { ingestInboundMessages } from "../services/MessagingService.js";
import { handlePubSubNotification } from "../services/EmailService.js";
import type { ChannelType, ChannelConfig as ChannelConfigRow } from "../generated/client/index.js";

const channelTypes = ["whatsapp", "instagram", "facebook", "email", "web_chat"] as const;

async function resolveChannelConfigRow(channelType: ChannelType): Promise<ChannelConfigRow | null> {
  const enabled = await prisma.channelConfig.findFirst({
    where: { channelType, enabled: true },
    orderBy: { createdAt: "asc" },
  });
  if (enabled) return enabled;
  return prisma.channelConfig.findFirst({
    where: { channelType },
    orderBy: { createdAt: "asc" },
  });
}

export class WebhookController {
  static async unifiedVerifyWebhook(
    request: FastifyRequest<{ Params: { channel: string }; Querystring: Record<string, string> }>,
    reply: FastifyReply,
  ) {
    if (!channelTypes.includes(request.params.channel as ChannelType)) {
      return reply.code(404).send("not found");
    }
    const adapter = getChannelAdapter(request.params.channel as ChannelType);
    if (!adapter.verifyWebhook) return reply.code(400).send("verification not supported");

    const channelType = request.params.channel as ChannelType;
    const rows = await prisma.channelConfig.findMany({
      where: { channelType },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    for (const row of rows) {
      const config = resolveChannelConfig(row.channelType, row.channelConfig);
      const challenge = adapter.verifyWebhook(config as never, request.query);
      if (challenge != null) {
        if (!row.enabled) {
          await prisma.channelConfig.update({ where: { id: row.id }, data: { enabled: true } });
        }
        return reply.type("text/plain").send(challenge);
      }
    }
    return reply.code(403).send("forbidden");
  }

  static async unifiedReceiveWebhook(
    request: FastifyRequest<{ Params: { channel: string } }>,
    reply: FastifyReply,
  ) {
    const channel = request.params.channel;
    request.log.info({ channel, path: `/webhooks/${channel}` }, `webhook POST /webhooks/${channel}`);
    if (!channelTypes.includes(channel as ChannelType)) {
      return reply.code(404).send({ error: "not found" });
    }
    const resolved = await resolveChannelConfigRow(channel as ChannelType);
    if (!resolved) {
      return reply.code(404).send({ error: "no channel config — restart API / configure Settings" });
    }
    if (!resolved.enabled) {
      await prisma.channelConfig.update({ where: { id: resolved.id }, data: { enabled: true } });
    }
    try {
      const result = await ingestInboundMessages({
        channelConfigId: resolved.id,
        payload: request.body,
      });
      return reply.code(200).send({ ok: true, ...result });
    } catch (err: any) {
      request.log.error({ err, channel }, "webhook ingest failed");
      return reply.code(400).send({ ok: false, error: err.message });
    }
  }

  static async handlePubSub(request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await handlePubSubNotification(request.body as any);
      return reply.code(200).send({ ok: true, ...result });
    } catch (err: any) {
      request.log.error(err, "Email Pub/Sub notification failed");
      return reply.code(200).send({ ok: false, error: err.message });
    }
  }
}
