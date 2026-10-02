import type { FastifyInstance } from "fastify";
import { BlockedContactController } from "../../controllers/BlockedContactController.js";

export async function blockedContactRoutes(app: FastifyInstance) {
  app.get("/", BlockedContactController.list);
  app.post("/", BlockedContactController.block);
  app.delete("/:customerId", BlockedContactController.unblock);
}
