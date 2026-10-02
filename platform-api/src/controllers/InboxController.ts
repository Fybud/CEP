import type { FastifyRequest, FastifyReply } from "fastify";
import { InboxService } from "../services/InboxService.js";

export class InboxController {
  static async updateInbox(
    request: FastifyRequest<{
      Params: { inboxId: string };
      Body: { name?: string; enabled?: boolean; channelConfig?: Record<string, unknown> };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const inbox = await InboxService.update(request.params.inboxId, request.body ?? {});
      return reply.send(inbox);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async disconnectInbox(
    request: FastifyRequest<{ Params: { inboxId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const inbox = await InboxService.disconnect(request.params.inboxId);
      return reply.send(inbox);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }
}
