import type { FastifyInstance } from "fastify";
import { AccountController } from "../../controllers/AccountController.js";

export async function accountRoutes(app: FastifyInstance) {
  app.post("/", AccountController.createAccount);
  app.get("/", AccountController.listAccounts);
  app.get("/:accountId/inboxes", AccountController.listInboxes);
  app.post("/:accountId/inboxes", AccountController.createInbox);
  // Compatibility shim — prefer inbox endpoints
  app.patch("/:accountId/channels/:channel", AccountController.updateChannel);
}
