import type { FastifyInstance } from "fastify";
import { HealthController } from "../../controllers/HealthController.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/channels", HealthController.checkChannelHealth);
}
