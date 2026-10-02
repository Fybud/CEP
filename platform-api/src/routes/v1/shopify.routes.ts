import type { FastifyInstance } from "fastify";
import { ShopifyConfigController } from "../../controllers/ShopifyConfigController.js";

export async function shopifyConfigRoutes(app: FastifyInstance) {
  app.get("/", ShopifyConfigController.get);
  app.put("/", ShopifyConfigController.update);
  app.patch("/", ShopifyConfigController.update);
}
