import type { FastifyRequest, FastifyReply } from "fastify";
import { AccountService } from "../services/AccountService.js";
import { InboxService } from "../services/InboxService.js";

export class AccountController {
  static async createAccount(_request: FastifyRequest, reply: FastifyReply) {
    return reply.code(201).send({ id: "workspace", name: "Workspace" });
  }

  static async listAccounts(_request: FastifyRequest, _reply: FastifyReply) {
    return AccountService.list();
  }

  static async listInboxes(
    request: FastifyRequest<{ Params: { accountId: string } }>,
    reply: FastifyReply,
  ) {
    return reply.send(await InboxService.listByAccount(request.params.accountId));
  }

  static async createInbox(_request: FastifyRequest, reply: FastifyReply) {
    return reply.code(400).send({ error: "channel configs are fixed — use PATCH to update" });
  }

  static async updateChannel(
    request: FastifyRequest<{
      Params: { accountId: string; channel: "whatsapp" | "instagram" | "facebook" | "email" };
      Body: {
        enabled?: boolean;
        config?: Record<string, unknown>;
        channelConfig?: Record<string, unknown>;
      };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const body = request.body ?? {};
      const inbox = await InboxService.updateByChannelType(request.params.channel, {
        enabled: body.enabled,
        channelConfig: body.channelConfig ?? body.config,
      });
      return reply.code(200).send(inbox);
    } catch (err: any) {
      if (err.message.includes("not found")) return reply.code(404).send({ error: err.message });
      return reply.code(400).send({ error: err.message });
    }
  }
}
