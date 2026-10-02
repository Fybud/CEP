import type { FastifyInstance } from "fastify";
import { EmailController } from "../../controllers/EmailController.js";

export async function emailRoutes(app: FastifyInstance) {
  app.post("/watch", EmailController.setupWatch);
  app.post("/renew-watch", EmailController.renewWatch);
}
