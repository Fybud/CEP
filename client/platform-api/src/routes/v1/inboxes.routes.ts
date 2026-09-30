import type { FastifyInstance } from "fastify";
import { InboxController } from "../../controllers/InboxController.js";

export async function inboxRoutes(app: FastifyInstance) {
  app.patch("/:inboxId", InboxController.updateInbox);
  app.post("/:inboxId/disconnect", InboxController.disconnectInbox);
}
