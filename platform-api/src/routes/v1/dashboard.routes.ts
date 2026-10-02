import type { FastifyInstance } from "fastify";
import { DashboardController } from "../../controllers/DashboardController.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/metrics", DashboardController.getMetrics);
}
