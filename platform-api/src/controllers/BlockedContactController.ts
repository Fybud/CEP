import type { FastifyRequest, FastifyReply } from "fastify";
import {
  blockCustomer,
  listBlockedContacts,
  unblockCustomer,
} from "../services/BlockedContactService.js";

export class BlockedContactController {
  static async list(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const rows = await listBlockedContacts();
      return reply.send(rows);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async block(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as { customerId?: string; reason?: string };
      const customerId = body.customerId?.trim();
      if (!customerId) {
        return reply.code(400).send({ error: "customerId is required" });
      }
      const row = await blockCustomer({
        customerId,
        reason: body.reason,
        blockedBy: request.user?.id ?? null,
      });
      return reply.send(row);
    } catch (err: any) {
      if (err.message === "Customer not found") {
        return reply.code(404).send({ error: err.message });
      }
      return reply.code(500).send({ error: err.message });
    }
  }

  static async unblock(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { customerId } = request.params as { customerId: string };
      if (!customerId?.trim()) {
        return reply.code(400).send({ error: "customerId is required" });
      }
      const result = await unblockCustomer(customerId);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
