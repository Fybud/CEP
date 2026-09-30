import type { FastifyPluginAsync } from "fastify";
import { WhatsAppTemplateService } from "../services/WhatsAppTemplateService.js";
import { WhatsAppQuotaService } from "../services/WhatsAppQuotaService.js";
import { isFeatureEnabled } from "../services/FeatureService.js";

async function requireTemplatesEnabled() {
  const enabled = await isFeatureEnabled("whatsapp_templates_enabled", false);
  if (!enabled) {
    throw Object.assign(new Error("WhatsApp Templates are disabled for this workspace"), {
      statusCode: 403,
    });
  }
}

export const whatsAppTemplateRoutes: FastifyPluginAsync = async (app) => {
  // GET /quota — no feature flag required so admins can always check
  app.get("/quota", async (_req, reply) => {
    try {
      const quota = await WhatsAppQuotaService.getTemplateMessagingQuota();
      return reply.send(quota);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET / — list all templates
  app.get("/", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const templates = await WhatsAppTemplateService.listTemplates();
      return reply.send({ templates });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // POST /sync — full sync from Meta
  app.post("/sync", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const result = await WhatsAppTemplateService.syncTemplatesFromMeta();
      return reply.send(result);
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // POST / — create new template
  app.post("/", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const body = req.body as any;
      const template = await WhatsAppTemplateService.createTemplate({
        name: body.name,
        language: body.language,
        internalCategory: body.internalCategory,
        metaCategory: body.metaCategory,
        components: body.components,
      });
      return reply.status(201).send({ template });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // GET /:id/analytics — template send/delivered/read analytics (last 30 days)
  app.get("/:id/analytics", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const { id } = req.params as { id: string };
      const analytics = await WhatsAppTemplateService.getTemplateAnalytics(id);
      return reply.send(analytics);
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // GET /:id — single template detail
  app.get("/:id", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const { id } = req.params as { id: string };
      const template = await WhatsAppTemplateService.getTemplate(id);
      if (!template) return reply.status(404).send({ error: "Template not found" });
      return reply.send({ template });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // POST /:id/sync — refresh single template status from Meta
  app.post("/:id/sync", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const { id } = req.params as { id: string };
      const template = await WhatsAppTemplateService.syncSingleTemplate(id);
      return reply.send({ template });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // PATCH /:id — edit PENDING template only
  app.patch("/:id", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const { id } = req.params as { id: string };
      const body = req.body as any;
      const template = await WhatsAppTemplateService.updateTemplate(id, {
        components: body.components,
        internalCategory: body.internalCategory,
      });
      return reply.send({ template });
    } catch (err: any) {
      req.log.error(err);
      // 400 if it's a user-facing error (e.g. approved template)
      const status =
        err.statusCode ??
        (err.message?.includes("cannot be edited") ? 400 : 500);
      return reply.status(status).send({ error: err.message });
    }
  });

  // DELETE /:id — delete template
  app.delete("/:id", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const { id } = req.params as { id: string };
      await WhatsAppTemplateService.deleteTemplate(id);
      return reply.send({ ok: true });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });
};
