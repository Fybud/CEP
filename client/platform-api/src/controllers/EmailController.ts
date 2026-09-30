import type { FastifyRequest, FastifyReply } from "fastify";
import { setupEmailWatch, renewEmailWatch } from "../services/EmailService.js";

export class EmailController {
  static async setupWatch(
    request: FastifyRequest<{ Body: { inboxId?: string } }>,
    reply: FastifyReply,
  ) {
    try {
      // inboxId optional — defaults to the single enabled Email inbox
      const result = await setupEmailWatch(request.body?.inboxId);
      return reply.code(200).send({ ok: true, ...result });
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err.message });
    }
  }

  static async renewWatch(
    request: FastifyRequest<{ Body: { inboxId?: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const results = await renewEmailWatch(request.body?.inboxId);
      return reply.code(200).send({ ok: true, results });
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err.message });
    }
  }
}
