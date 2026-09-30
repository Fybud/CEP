import type { FastifyInstance } from "fastify";
import { OrderController } from "../../controllers/OrderController.js";

export async function orderRoutes(app: FastifyInstance) {
  app.get("/", OrderController.listOrders);
  app.get("/commerce", OrderController.getCommerce);
}
