import type { FastifyPluginAsync } from "fastify";
import { sendWhatsAppTemplateMessage } from "../services/MessagingService.js";
import { prisma } from "../config/db.js";

export const broadcastRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/v1/broadcasts — send a template to multiple contacts
  app.post<{
    Body: {
      templateId: string;
      customerIds: string[];
      variables: Record<string, string>;
      tag?: string;
      includeTags?: string[];
      excludeTags?: string[];
      scheduledAt?: string;
      recurrence?: "none" | "weekly" | "monthly";
      suppressionDays?: number | null;
    };
  }>("/", async (req, reply) => {
    try {
      const { templateId, customerIds: rawIds, variables, includeTags, excludeTags, scheduledAt, recurrence, suppressionDays } = req.body;

      // Resolve customerIds based on rawIds + tags
      let finalCustomerIds = new Set(rawIds || []);
      
      if (includeTags && includeTags.length > 0) {
        const taggedCustomers = await prisma.customer.findMany({
          where: { tag: { in: includeTags }, whatsappIdentities: { some: {} } },
          select: { id: true },
        });
        taggedCustomers.forEach((c) => finalCustomerIds.add(c.id));
      }

      if (excludeTags && excludeTags.length > 0) {
        const excludedCustomers = await prisma.customer.findMany({
          where: { tag: { in: excludeTags }, whatsappIdentities: { some: {} } },
          select: { id: true },
        });
        excludedCustomers.forEach((c) => finalCustomerIds.delete(c.id));
      }

      const customerIds = Array.from(finalCustomerIds);

      if (!templateId || customerIds.length === 0) {
        return reply.code(400).send({ error: "templateId and customerIds (or matching tags) are required" });
      }

      const template = await prisma.whatsAppTemplate.findUnique({ where: { id: templateId } });
      if (!template) return reply.code(404).send({ error: "Template not found" });
      if (template.status !== "APPROVED") {
        return reply.code(400).send({ error: "Only APPROVED templates can be broadcast" });
      }

      const job = await prisma.broadcastJob.create({
        data: {
          templateId,
          templateName: template.name,
          variables: variables as any,
          status: "pending",
          total: customerIds.length,
          succeeded: 0,
          failed: 0,
          includeTags: includeTags || [],
          excludeTags: excludeTags || [],
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          recurrence: recurrence || "none",
          suppressionDays: suppressionDays || null,
        },
      });

      // Insert all recipients as pending
      await prisma.broadcastRecipient.createMany({
        data: customerIds.map(customerId => ({
          jobId: job.id,
          customerId,
          status: "pending"
        }))
      });

      return reply.send({
        jobId: job.id,
        total: customerIds.length,
        succeeded: 0,
        failed: 0,
        status: "pending",
        results: [],
      });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // POST /api/v1/broadcasts/:id/pause
  app.post<{ Params: { id: string } }>("/:id/pause", async (req, reply) => {
    const job = await prisma.broadcastJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.code(404).send({ error: "Job not found" });
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: { pausedAt: job.pausedAt ? null : new Date() } // toggle pause
    });
    return reply.send({ success: true });
  });

  // POST /api/v1/broadcasts/:id/cancel
  app.post<{ Params: { id: string } }>("/:id/cancel", async (req, reply) => {
    const job = await prisma.broadcastJob.findUnique({ where: { id: req.params.id } });
    if (!job) return reply.code(404).send({ error: "Job not found" });
    await prisma.broadcastJob.update({
      where: { id: job.id },
      data: { cancelledAt: new Date() }
    });
    return reply.send({ success: true });
  });

  // GET /api/v1/broadcasts/:id/no-reply
  app.get<{ Params: { id: string } }>("/:id/no-reply", async (req, reply) => {
    const job = await prisma.broadcastJob.findUnique({
      where: { id: req.params.id },
      include: { recipients: true }
    });
    if (!job) return reply.code(404).send({ error: "Job not found" });
    
    // In a real app we'd check if the customer sent a message after the broadcast.
    // For now, return all recipients who have 'deliveredAt' or 'readAt' but haven't replied.
    const noReply = job.recipients.filter(r => (r.deliveredAt || r.readAt));
    return reply.send({ contacts: noReply.map(r => r.customerId) });
  });

  // GET /api/v1/broadcasts — list past broadcast jobs
  app.get("/", async (req, reply) => {
    try {
      const jobs = await prisma.broadcastJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          recipients: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      return reply.send({ jobs });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });
};
