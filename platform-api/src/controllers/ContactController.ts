import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import {
  bulkImportContacts,
  createCustomer,
  deleteCustomer,
  findMatchingCustomers,
  loadCustomerShaped,
  mergeCustomers,
  updateCustomer,
} from "../services/CustomerService.js";
import { shapeCustomer } from "../services/MessagingService.js";

export class ContactController {
  static async listContacts(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const customers = await prisma.customer.findMany({
        include: {
          whatsappIdentities: true,
          instagramIdentities: true,
          emailIdentities: true,
          facebookIdentities: true,
        },
        orderBy: { updatedAt: "desc" },
      });
      return reply.send(customers.map(shapeCustomer));
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async createContact(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        name?: string;
        email?: string;
        emails?: string[];
        whatsappId?: string;
        whatsappIds?: string[];
        instagramId?: string;
        facebookId?: string;
        mergeIntoId?: string;
        keepName?: string;
        force?: boolean;
      };

      const emails = body.emails?.length
        ? body.emails
        : body.email
          ? [body.email]
          : [];
      const whatsappIds = body.whatsappIds?.length
        ? body.whatsappIds
        : body.whatsappId
          ? [body.whatsappId]
          : [];

      if (!body.force && !body.mergeIntoId) {
        const matches = await findMatchingCustomers({
          emails,
          whatsappIds,
          instagramId: body.instagramId,
          facebookId: body.facebookId,
        });
        if (matches.length) {
          return reply.code(409).send({
            error: "customer_match",
            message: "Customer found with matching channel ids",
            matches,
          });
        }
      }

      const result = await createCustomer({
        name: body.name,
        emails,
        whatsappIds,
        instagramId: body.instagramId,
        facebookId: body.facebookId,
        mergeIntoId: body.mergeIntoId,
        keepName: body.keepName ?? body.name,
        force: Boolean(body.force),
      });

      if (result && "needsMerge" in result && result.needsMerge) {
        return reply.code(409).send({
          error: "customer_match",
          message: "Customer found with matching channel ids",
          matches: result.matches,
        });
      }

      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async updateContact(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const body = request.body as {
        name?: string;
        email?: string;
        emails?: string[];
        whatsappId?: string;
        whatsappIds?: string[];
        instagramId?: string;
        facebookId?: string;
        mergeIntoId?: string;
        keepName?: string;
        force?: boolean;
        tag?: string | null;
      };
      const existing = await prisma.customer.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: "not found" });

      // Prefer arrays when present (including empty = clear that channel list).
      const emails = Array.isArray(body.emails)
        ? body.emails
        : body.email !== undefined
          ? body.email
            ? [body.email]
            : []
          : undefined;
      const whatsappIds = Array.isArray(body.whatsappIds)
        ? body.whatsappIds
        : body.whatsappId !== undefined
          ? body.whatsappId
            ? [body.whatsappId]
            : []
          : undefined;

      if (!body.force && !body.mergeIntoId) {
        const matches = await findMatchingCustomers({
          emails: emails ?? [],
          whatsappIds: whatsappIds ?? [],
          instagramId: body.instagramId,
          facebookId: body.facebookId,
        });
        const others = matches.filter((m) => m.id !== request.params.id);
        if (others.length) {
          return reply.code(409).send({
            error: "customer_match",
            message: "Customer found with matching channel ids",
            matches: others,
          });
        }
      }

      // If only tag is being changed, patch it directly and return early
      if (
        body.tag !== undefined &&
        !body.name && !body.email && !body.emails && !body.whatsappId &&
        !body.whatsappIds && !body.instagramId && !body.facebookId && !body.mergeIntoId
      ) {
        const updated = await prisma.customer.update({
          where: { id: request.params.id },
          data: { tag: body.tag ?? null },
          include: {
            whatsappIdentities: true,
            instagramIdentities: true,
            emailIdentities: true,
            facebookIdentities: true,
          },
        });
        return reply.send(shapeCustomer(updated));
      }

      const result = await updateCustomer(request.params.id, {
        name: body.name,
        emails,
        whatsappIds,
        instagramId: body.instagramId,
        facebookId: body.facebookId,
        mergeIntoId: body.mergeIntoId,
        keepName: body.keepName ?? body.name,
        force: Boolean(body.force),
        tag: body.tag,
      });

      if (result && "needsMerge" in result && result.needsMerge) {
        return reply.code(409).send({
          error: "customer_match",
          message: "Customer found with matching channel ids",
          matches: result.matches,
        });
      }

      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async merge(
    request: FastifyRequest<{
      Body: { targetId?: string; sourceIds?: string[]; keepName?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { targetId, sourceIds, keepName } = request.body ?? {};
    if (!targetId || !sourceIds?.length || !keepName) {
      return reply.code(400).send({ error: "targetId, sourceIds, keepName required" });
    }
    try {
      const result = await mergeCustomers({ targetId, sourceIds, keepName });
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async getOne(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const shaped = await loadCustomerShaped(request.params.id);
    if (!shaped) return reply.code(404).send({ error: "not found" });
    return reply.send(shaped);
  }

  static async deleteContact(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const result = await deleteCustomer(request.params.id);
      return reply.send(result);
    } catch (err: any) {
      const message = err?.message ?? "Failed to delete contact";
      const code = message === "Customer not found" ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  }

  /** PATCH /api/v1/contacts/:id/tag — set or clear the tag field only */
  static async setTag(
    request: FastifyRequest<{ Params: { id: string }; Body: { tag: string | null } }>,
    reply: FastifyReply,
  ) {
    try {
      const { tag } = request.body;
      const updated = await prisma.customer.update({
        where: { id: request.params.id },
        data: { tag: tag ?? null },
        include: {
          whatsappIdentities: true,
          instagramIdentities: true,
          emailIdentities: true,
          facebookIdentities: true,
        },
      });
      return reply.send(shapeCustomer(updated));
    } catch (err: any) {
      const code = err?.code === "P2025" ? 404 : 400;
      return reply.code(code).send({ error: err.message });
    }
  }

  /** GET /api/v1/contacts/tags — list all distinct tags in use */
  static async listTags(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const rows = await prisma.customer.findMany({
        where: { tag: { not: null } },
        select: { tag: true },
        distinct: ["tag"],
        orderBy: { tag: "asc" },
      });
      return reply.send({ tags: rows.map((r) => r.tag).filter(Boolean) });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async bulkImport(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        contacts: Array<{
          name?: string;
          whatsapp?: string;
          email?: string;
          instagram?: string;
          facebook?: string;
        }>;
      };

      if (!Array.isArray(body?.contacts) || body.contacts.length === 0) {
        return reply.code(400).send({ error: "contacts array is required" });
      }

      if (body.contacts.length > 1000) {
        return reply.code(400).send({ error: "Maximum 1,000 contacts per import batch" });
      }

      const result = await bulkImportContacts(body.contacts);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async getTimeline(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const customerId = request.params.id;
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) return reply.code(404).send({ error: "Contact not found" });

      const [messages, tickets, broadcasts] = await Promise.all([
        prisma.message.findMany({
          where: { customerId },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            channelType: true,
            direction: true,
            content: true,
            createdAt: true,
            status: true,
          },
        }),
        prisma.ticket.findMany({
          where: { customerId },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            notes: {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: { id: true, body: true, createdAt: true },
            },
          },
        }),
        prisma.broadcastRecipient.findMany({
          where: { customerId },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            job: { select: { templateName: true, status: true } },
          },
        }),
      ]);

      const events: Array<Record<string, unknown>> = [];

      for (const m of messages) {
        events.push({
          id: `msg_${m.id}`,
          type: "message",
          channelType: m.channelType,
          direction: m.direction,
          content: m.content,
          status: m.status,
          timestamp: m.createdAt.toISOString(),
        });
      }

      for (const t of tickets) {
        events.push({
          id: `ticket_${t.id}`,
          type: "ticket",
          ticketNumber: t.number,
          subject: t.subject,
          status: t.status,
          timestamp: t.createdAt.toISOString(),
        });
        for (const n of t.notes) {
          events.push({
            id: `ticket_note_${n.id}`,
            type: "ticket_note",
            body: n.body,
            timestamp: n.createdAt.toISOString(),
          });
        }
      }

      for (const r of broadcasts) {
        events.push({
          id: `broadcast_${r.id}`,
          type: "broadcast",
          templateName: r.job?.templateName,
          status: r.status,
          error: r.error,
          timestamp: r.createdAt.toISOString(),
        });
      }

      events.sort(
        (a, b) =>
          new Date(String(b.timestamp)).getTime() - new Date(String(a.timestamp)).getTime(),
      );

      const customFields =
        customer.customFields && typeof customer.customFields === "object" && !Array.isArray(customer.customFields)
          ? (customer.customFields as Record<string, string>)
          : {};

      return reply.send({ events, customFields });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async updateCustomFields(
    request: FastifyRequest<{ Params: { id: string }; Body: Record<string, string | null> }>,
    reply: FastifyReply,
  ) {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: request.params.id } });
      if (!customer) return reply.code(404).send({ error: "Contact not found" });

      const current =
        customer.customFields && typeof customer.customFields === "object" && !Array.isArray(customer.customFields)
          ? { ...(customer.customFields as Record<string, string>) }
          : {};

      const patch = request.body ?? {};
      for (const [key, value] of Object.entries(patch)) {
        if (!key.trim()) continue;
        if (value === null) {
          delete current[key];
        } else {
          current[key] = String(value);
        }
      }

      const updated = await prisma.customer.update({
        where: { id: request.params.id },
        data: { customFields: current },
      });

      const customFields =
        updated.customFields && typeof updated.customFields === "object" && !Array.isArray(updated.customFields)
          ? (updated.customFields as Record<string, string>)
          : {};

      return reply.send({ customFields });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
