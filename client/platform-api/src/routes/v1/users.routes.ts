import type { FastifyInstance } from "fastify";
import { UserController } from "../../controllers/UserController.js";
import { requireManager } from "../../middleware/auth.js";

export async function userRoutes(app: FastifyInstance) {
  // Manager+ can list/manage users (scoped by role inside controller)
  app.get("/", { preHandler: [requireManager] }, UserController.listUsers as any);
  app.post("/", { preHandler: [requireManager] }, UserController.createUser as any);
  app.patch("/:id", { preHandler: [requireManager] }, UserController.updateUser as any);
  app.delete("/:id", { preHandler: [requireManager] }, UserController.deleteUser as any);
}
