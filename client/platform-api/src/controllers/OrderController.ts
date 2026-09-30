import type { FastifyRequest, FastifyReply } from "fastify";
import { orderService } from "../services/orders/order.service.js";

export class OrderController {
  static async listOrders(
    request: FastifyRequest<{
      Querystring: { email?: string; phone?: string };
    }>,
    reply: FastifyReply,
  ) {
    const email = request.query.email?.trim();
    const phone = request.query.phone?.trim();

    if (!email && !phone) {
      return reply.code(400).send({
        error: "Provide email and/or phone to look up customer orders",
      });
    }

    try {
      const result = await orderService.getOrdersForCustomer({ email, phone });
      return reply.send(result);
    } catch (err: any) {
      return reply.code(502).send({
        error: err.message || "Failed to fetch orders from order provider",
      });
    }
  }

  /** Full commerce payload for the inbox customer widget (profile + stats + orders). */
  static async getCommerce(
    request: FastifyRequest<{
      Querystring: { email?: string; phone?: string; customerId?: string };
    }>,
    reply: FastifyReply,
  ) {
    const email = request.query.email?.trim();
    const phone = request.query.phone?.trim();
    const customerId = request.query.customerId?.trim();

    if (!email && !phone) {
      return reply.code(400).send({
        error: "Provide email and/or phone to look up customer commerce",
      });
    }

    try {
      const result = await orderService.getCustomerCommerce({ email, phone, customerId });
      return reply.send(result);
    } catch (err: any) {
      return reply.code(502).send({
        error: err.message || "Failed to fetch customer commerce",
      });
    }
  }
}
