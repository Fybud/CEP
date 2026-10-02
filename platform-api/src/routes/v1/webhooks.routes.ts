import type { FastifyInstance } from "fastify";
import { WebhookController } from "../../controllers/WebhookController.js";

export async function webhookRoutes(app: FastifyInstance) {
  // Stable Email Pub/Sub endpoint (auto-resolves email inbox)
  app.post("/email/pubsub", WebhookController.handlePubSub);

  // Channel-only webhooks (single-tenant: first enabled inbox for that channel)
  app.get("/:channel", WebhookController.unifiedVerifyWebhook);
  app.post("/:channel", WebhookController.unifiedReceiveWebhook);
}
